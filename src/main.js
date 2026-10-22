import './style.css';
import * as THREE from 'three';
import { Input } from './core/input.js';
import { clamp } from './core/math.js';
import { Track } from './world/track.js';
import { Terrain } from './world/terrain.js';
import { buildScenery } from './world/scenery.js';
import { setupEnvironment } from './world/environment.js';
import { createMaterials } from './train/carModels.js';
import { Train, NOTCHES } from './train/train.js';
import { loadModels } from './train/models.js';
import { TrainMap } from './trainMap.js';
import { CarGuide } from './guide/carGuide.js';
import './guide/guide.css';
import { Player } from './player/player.js';
import { Effects } from './weapons/effects.js';
import { Projectiles } from './weapons/projectiles.js';
import { calibrateDrag, airDensityRatio } from './weapons/ballistics.js';
import { buildFiringTable } from './weapons/firingTable.js';
import { WEAPONS } from './data/weapons.js';
import { TargetRange } from './targets.js';
import { Audio3D } from './audio.js';
import { GunStation, MgStation, ConsoleStation, RangefinderStation, TargetBook } from './stations.js';
import { UI, helpHtml, briefingHtml, firingTableHtml, targetBookHtml } from './ui.js';

const ui = new UI();
// 讓載入文字先畫出來（不用 rAF，背景分頁也能繼續載入）
const tick = () => new Promise((r) => setTimeout(r, 30));

async function init() {
  const canvas = document.getElementById('game');
  const overlay = document.getElementById('overlay');
  const g2d = overlay.getContext('2d');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 40000);

  function resize() {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    overlay.width = w;
    overlay.height = h;
  }
  addEventListener('resize', resize);
  resize();

  ui.setLoading('建立地形與鐵道…');
  await tick();
  const env = setupEnvironment(renderer, scene);
  const track = new Track();
  scene.add(track.buildMesh());
  const terrain = new Terrain();
  scene.add(terrain.mesh);
  buildScenery(scene, terrain);

  ui.setLoading('依史料校正彈道、計算射表…');
  await tick();
  for (const w of Object.values(WEAPONS)) {
    w.C = calibrateDrag(w.shells[0].v0, w.maxRange);
  }
  WEAPONS.type14.tables = Object.fromEntries(WEAPONS.type14.shells.map((s) => [s.id, buildFiringTable(WEAPONS.type14, s)]));

  ui.setLoading('載入車廂模型…');
  const models = await loadModels((done, total) => ui.setLoading(`載入車廂模型… ${done}/${total}`));
  ui.setLoading('組裝九四式裝甲列車…');
  await tick();
  const input = new Input(canvas);
  const audio = new Audio3D();
  const effects = new Effects(scene);
  const mats = createMaterials();

  const game = {
    time: 0,
    started: false,
    mode: 'walk',
    station: null,
    settings: { assist: false },
    stats: { shots: 0, hits: 0 },
    orbit: { yaw: -2.4, pitch: 0.25, dist: 75, car: 4 },
    tableShell: 'HE',
    input,
    audio,
    effects,
    message: (text, kind) => ui.message(text, kind),
  };

  const train = new Train(scene, track, mats, {
    message: game.message,
    bell: (ack) => audio.play('bell', train.cars[4].console.anchor.getWorldPosition(new THREE.Vector3()), ack ? 0.6 : 1),
  }, models);
  game.train = train;
  train.updateTransforms(0);

  const targets = new TargetRange(scene, terrain, effects);
  game.targets = targets;
  game.targetBook = new TargetBook(game);

  game.pick = (origin, dir) => {
    const tDist = terrain.raycast(origin, dir, 15000);
    const tHit = targets.raycast(origin, dir, tDist ?? 15000);
    if (tHit && (tDist == null || tHit.dist < tDist)) return { dist: tHit.dist, target: tHit.target };
    return tDist == null ? null : { dist: tDist };
  };

  const projectiles = new Projectiles(scene, terrain, targets, (p, point, target, normal) => {
    if (p.kind === 'shell') {
      const he = p.shell.he;
      effects.explosion(point, he ? 1 : 0.45);
      audio.play('explosion', point, he ? 1 : 0.6);
      if (normal) effects.crater(point, normal, he ? 3.2 : 1.6);
    } else {
      if (target) effects.spark(point);
      else effects.dust(point, 0.25);
    }
    const res = targets.applyImpact(point, p, target);
    if (p.kind === 'shell' && res.hit) game.stats.hits++;
    for (const t of res.destroyed) game.message(`${t.name}擊毀（${targets.destroyed}/${targets.total}）`);
  });
  projectiles.rhoRatio = airDensityRatio(15);
  game.projectiles = projectiles;

  const loco = train.cars.find((c) => c.loco);
  effects.chimney((out) => {
    loco.chimney.getWorldPosition(out);
    const v = Math.abs(train.speed);
    return { rate: 1.2 + v * 0.5, power: v / 16.7 };
  });

  // 崗位
  const stations = [];
  for (const car of train.cars) {
    const pool = { rounds: WEAPONS.type92.poolPerCar };
    for (const s of car.stations) {
      if (s.type === 'gun') s.obj = new GunStation(game, car, s.ref, s.label);
      else if (s.type === 'mg') s.obj = new MgStation(game, car, s.ref, pool);
      else if (s.type === 'console') s.obj = new ConsoleStation(game, car, s.ref);
      else if (s.type === 'rangefinder') s.obj = new RangefinderStation(game, car, s.ref);
      if (s.obj) stations.push(s.obj);
    }
  }

  const player = new Player(train);
  game.player = player;
  const trainMap = new TrainMap(document.getElementById('trainmap'), train);
  const guide = new CarGuide(document.getElementById('guide'), train, () => player.where()?.car);

  // ── 彈出視窗與暫停 ──
  const pause = ui.pause;
  input.onLockChange = (locked) => {
    pause.classList.toggle('hidden', locked || !game.started || !!ui.modalName || ui.guideOpen);
  };
  pause.addEventListener('click', () => input.lock());

  // 車廂圖鑑：開啟時遊戲暫停，預設顯示玩家所在的車廂
  function openGuide() {
    if (!game.started || ui.guideOpen) return;
    if (ui.modalName) ui.closeModal();
    ui.guideOpen = true;
    const w = player.where();
    guide.open(Math.max(0, train.cars.indexOf(w?.car)));
    input.unlock();
    pause.classList.add('hidden');
  }
  function closeGuide(relock) {
    guide.close();
    ui.guideOpen = false;
    clock.getDelta();
    if (relock) input.lock();
    pause.classList.toggle('hidden', input.locked || !game.started);
  }
  guide.onClose = () => closeGuide(true);
  document.getElementById('guide-btn').addEventListener('click', openGuide);
  document.getElementById('pause-guide').addEventListener('click', (e) => {
    e.stopPropagation();
    openGuide();
  });

  function openModal(name) {
    let html = '';
    if (name === 'help') html = helpHtml();
    if (name === 'table') html = firingTableHtml(WEAPONS.type14, game.tableShell);
    if (name === 'book') html = targetBookHtml(game.targetBook, game.time);
    ui.openModal(name, html);
    input.unlock();
  }
  function closeModal(relock) {
    ui.closeModal();
    if (relock) input.lock();
    pause.classList.toggle('hidden', input.locked || !game.started);
  }
  ui.modalBody.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.shell) {
      game.tableShell = b.dataset.shell;
      ui.modalBody.innerHTML = firingTableHtml(WEAPONS.type14, game.tableShell);
    }
    if (b.id === 'start-btn') {
      game.started = true;
      audio.init();
      closeModal(true);
    }
  });
  canvas.addEventListener('mousedown', () => {
    if (game.started && !input.locked && !ui.modalName) input.lock();
  });

  function handleGlobalKeys() {
    if (!game.started) return;
    if (ui.guideOpen) {
      if (input.hit('KeyI')) closeGuide(true);
      else if (input.hit('Escape')) closeGuide(false);
      else for (const code of input.pressed) guide.handleKey(code);
      return;
    }
    if (input.hit('KeyI')) {
      openGuide();
      return;
    }
    const keys = { KeyH: 'help', KeyT: 'table', KeyB: 'book' };
    for (const [code, name] of Object.entries(keys)) {
      if (input.hit(code)) {
        if (ui.modalName === name) closeModal(true);
        else openModal(name);
        return;
      }
    }
    if (ui.modalName && input.hit('Escape')) closeModal(false);
    if (ui.modalName) return;
    if (input.hit('KeyG')) {
      game.settings.assist = !game.settings.assist;
      game.message(`射擊輔助：${game.settings.assist ? '開（表尺自動設定）' : '關'}`);
    }
  }

  // ── 互動：崗位與艙口 ──
  function nearestInteractable() {
    const w = player.where();
    if (!w) return null;
    let best = null;
    let bestD = 1e9;
    if (player.level === 'in' && !w.inGap) {
      for (const s of w.car.stations) {
        const d = Math.hypot(w.x - s.x, player.lat - s.lat);
        if (d < 1.3 && d < bestD) {
          best = { kind: 'station', s };
          bestD = d;
        }
      }
    }
    if (!w.inGap) {
      for (const hx of w.car.hatches) {
        const d = Math.abs(w.x - hx);
        if (d < 0.9 && Math.abs(player.lat) < 0.8 && d < bestD) {
          best = { kind: 'hatch' };
          bestD = d;
        }
      }
    }
    return best;
  }

  function handleModeInput(dt) {
    if (input.hit('KeyV')) {
      if (game.mode === 'third') game.mode = game.station ? 'station' : 'walk';
      else game.mode = 'third';
    }
    if (game.mode === 'third') {
      const o = game.orbit;
      o.yaw -= input.mouseDX * 0.004;
      o.pitch = clamp(o.pitch + input.mouseDY * 0.003, -0.1, 1.4);
      o.dist = clamp(o.dist * (1 + input.wheel * 0.12), 12, 600);
      if (input.hit('BracketLeft')) o.car = Math.max(0, o.car - 1);
      if (input.hit('BracketRight')) o.car = Math.min(train.cars.length - 1, o.car + 1);
      return;
    }
    if (game.mode === 'station') {
      if (input.hit('KeyE') || input.hit('KeyQ')) {
        game.station.exit();
        game.station = null;
        game.mode = 'walk';
      }
      return;
    }
    for (let i = 0; i < train.cars.length; i++) {
      if (input.hit(`Digit${i + 1}`)) player.startAuto(i, game.message);
    }
    player.update(dt, input);
    if (input.hit('KeyE')) {
      player.cancelAuto();
      const it = nearestInteractable();
      if (!it) return;
      if (it.kind === 'hatch') {
        const up = player.level === 'in';
        if (player.toggleLevel()) game.message(up ? '爬上車頂（暴露位置）' : '回到車內');
        else game.message('此處無法通行', 'alert');
      } else if (it.s.obj) {
        game.station = it.s.obj;
        game.station.enter();
        game.mode = 'station';
      } else {
        game.message(`${it.s.label}`, 'alert');
      }
    }
  }

  const orbitCenter = new THREE.Vector3();
  function applyCamera() {
    if (game.mode === 'third') {
      const c = train.cars[game.orbit.car].group.position;
      orbitCenter.lerp(c, orbitCenter.lengthSq() ? 0.2 : 1);
      const o = game.orbit;
      camera.position.set(
        orbitCenter.x + Math.cos(o.pitch) * Math.sin(o.yaw) * o.dist,
        orbitCenter.y + 3 + Math.sin(o.pitch) * o.dist,
        orbitCenter.z + Math.cos(o.pitch) * Math.cos(o.yaw) * o.dist,
      );
      camera.position.y = Math.max(camera.position.y, terrain.heightAt(camera.position.x, camera.position.z) + 2);
      camera.lookAt(orbitCenter.x, orbitCenter.y + 3, orbitCenter.z);
      camera.fov = 55;
    } else if (game.mode === 'station') {
      game.station.applyCamera(camera);
    } else {
      player.applyCamera(camera);
    }
    camera.updateProjectionMatrix();
  }

  function updateHud(dt) {
    ui.updateMessages(dt);
    const w = player.where();
    const kmh = (train.speed * 3.6).toFixed(0);
    let where;
    if (game.mode === 'station') where = game.station.label;
    else where = `${w.inGap ? '車廂連接處' : w.car.name}・${player.level === 'in' ? '車內' : '車頂'}`;
    const exposed = game.mode === 'walk' && player.exposed;
    ui.set(
      ui.status,
      `<div><span class="k">里程</span> ${train.kmPost()} km　<span class="k">速度</span> ${kmh} km/h</div>
       <div><span class="k">傳令鐘</span> ${NOTCHES[train.ordered].name}${train.pending ? '（傳令中）' : ''}</div>
       <div><span class="k">位置</span> ${where}${exposed ? '　<span class="warn">⚠ 暴露位置</span>' : ''}</div>
       <div><span class="k">氣象</span> 15°C・無風　<span class="k">輔助</span> ${game.settings.assist ? '<span class="ok">開</span>' : '關'}</div>
       ${game.mode === 'third' ? '<div class="acc">第三人稱鏡頭（V 返回）</div>' : ''}`,
    );
    ui.set(
      ui.score,
      `<div class="k">靶場成績</div>
       <div>擊毀 <b>${targets.destroyed}</b> / ${targets.total}</div>
       <div><span class="k">砲彈</span> 發射 ${game.stats.shots}・有效 ${game.stats.hits}</div>`,
    );
    if (game.mode === 'station') {
      ui.weapon.classList.remove('hidden');
      ui.set(ui.weapon, game.station.hud());
    } else {
      ui.weapon.classList.add('hidden');
    }
    let prompt = '';
    if (game.mode === 'walk') {
      const it = nearestInteractable();
      if (it?.kind === 'hatch') prompt = `按 E：${player.level === 'in' ? '經艙口爬上車頂' : '經艙口回到車內'}`;
      else if (it?.s.obj) prompt = `按 E：${it.s.label}`;
      else if (it) prompt = it.s.label;
    }
    if (game.mode === 'walk' && player.auto) prompt = `自動前往 ${player.auto.index + 1}・${player.auto.name}（WASD 取消）`;
    ui.set(ui.prompt, prompt);
    trainMap.draw({ player, station: game.mode === 'station' ? game.station : null, autoTarget: player.auto, mode: game.mode });
    ui.dot.style.display = game.mode === 'walk' ? 'block' : 'none';
  }

  function drawOverlay() {
    g2d.clearRect(0, 0, overlay.width, overlay.height);
    if (game.mode === 'station' && game.station.drawOverlay) {
      game.station.drawOverlay(g2d, overlay.width, overlay.height, camera);
    }
  }

  // ── 主迴圈 ──
  const clock = new THREE.Clock();
  const focus = new THREE.Vector3();
  const locoPos = new THREE.Vector3();
  function frame() {
    requestAnimationFrame(frame);
    step(Math.min(clock.getDelta(), 0.05));
  }
  function step(dt) {
    handleGlobalKeys();
    if (ui.guideOpen) {
      // 圖鑑開啟時遊戲暫停，只繪製圖鑑的 3D 檢視
      guide.update(dt);
      input.endFrame();
      return;
    }
    const paused = !game.started || (!input.locked && !ui.modalName);
    if (!paused) {
      game.time += dt;
      const controlling = input.locked && !ui.modalName;
      train.update(dt);
      train.updateTransforms(game.time);
      if (controlling) handleModeInput(dt);
      for (const st of stations) st.update(dt, input, controlling && game.mode === 'station' && game.station === st);
      projectiles.update(dt);
      targets.update(dt);
      effects.update(dt);
      audio.updateEngine(dt, train.speed, loco.chimney.getWorldPosition(locoPos));
    }
    applyCamera();
    if (game.mode === 'third') focus.copy(orbitCenter);
    else focus.copy(camera.position);
    env.update(focus);
    audio.setListener(camera);
    renderer.render(scene, camera);
    drawOverlay();
    updateHud(dt);
    input.endFrame();
  }

  if (import.meta.env.DEV) {
    // 除錯用：背景分頁 rAF 停止時，可手動推進模擬
    const steps = (n, dt = 1 / 60) => {
      for (let i = 0; i < n; i++) step(dt);
    };
    window.__game = { game, camera, renderer, scene, stations, player, train, targets, steps, guide, openGuide, closeGuide };
  }

  ui.loading.classList.add('hidden');
  ui.openModal('briefing', briefingHtml());
  frame();
}

init().catch((err) => {
  console.error(err);
  ui.setLoading(`載入失敗：${err.message}`);
});
