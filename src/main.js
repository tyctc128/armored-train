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
import { Tutorial } from './tutorial/tutorial.js';
import { Crew } from './crew/crew.js';
import { CrewAI } from './crew/crewAI.js';
import { Enemies } from './enemy/enemies.js';
import { Damage } from './combat/damage.js';
import { LEVELS, LEVEL2, LEVEL3, LEVEL4, LEVEL5, MissionRunner, loadProgress } from './missions/missions.js';
import { EnemyTrain } from './enemy/enemyTrain.js';
import { EnemyBattery } from './enemy/battery.js';
import { RailBreak } from './world/railBreak.js';
import './missions/missions.css';
import './tutorial/tutorial.css';
import { Player } from './player/player.js';
import { Effects } from './weapons/effects.js';
import { Projectiles } from './weapons/projectiles.js';
import { calibrateDrag, airDensityRatio } from './weapons/ballistics.js';
import { buildFiringTable, buildMortarTable } from './weapons/firingTable.js';
import { WEAPONS } from './data/weapons.js';
import { TargetRange } from './targets.js';
import { Audio3D } from './audio.js';
import { GunStation, MgStation, ConsoleStation, RangefinderStation, MortarStation, TargetBook } from './stations.js';
import { UI, helpHtml, briefingHtml, firingTableHtml, mortarTableHtml, targetBookHtml, menuHtml, level2BriefHtml, level3BriefHtml, level4BriefHtml, level5BriefHtml } from './ui.js';

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
  WEAPONS.type97.table = buildMortarTable(WEAPONS.type97, WEAPONS.type97.shells[0]);

  ui.setLoading('載入車廂模型…');
  const models = await loadModels((done, total) => ui.setLoading(`載入車廂模型… ${done}/${total}`));
  ui.setLoading('組裝九四式裝甲列車…');
  await tick();
  const input = new Input(canvas);
  const audio = new Audio3D();
  const effects = new Effects(scene);
  const mats = createMaterials();

  let tutorial = null;
  let mission = null;
  let enemies = null;
  let damage = null;
  let crewAI = null;
  let crew = null;
  let battery = null;
  let enemyTrain = null;
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
    // 遊戲事件（教學關用來判斷步驟是否完成）
    emit: (type, data) => {
      tutorial?.onEvent(type, data);
      mission?.onEvent(type, data);
      if (type === 'mark') crewAI?.onMark(data.entry);
    },
  };

  const train = new Train(scene, track, mats, {
    message: game.message,
    bell: (ack) => audio.play('bell', train.cars[4].console.anchor.getWorldPosition(new THREE.Vector3()), ack ? 0.6 : 1),
    derail: () => {
      const p = train.cars[0].group.position;
      effects.explosion(p, 0.5);
      audio.play('explosion', p, 1.2);
      game.message('列車衝過斷口，車頭出軌！', 'alert');
      game.emit('derailed');
    },
  }, models);
  game.train = train;
  const railBreak = new RailBreak(scene, track, game);
  game.railBreak = railBreak;
  train.updateTransforms(0);

  const targets = new TargetRange(scene, terrain, effects);
  game.targets = targets;
  game.targetBook = new TargetBook(game);

  game.pick = (origin, dir) => {
    const tDist = terrain.raycast(origin, dir, 15000);
    let tHit = targets.raycast(origin, dir, tDist ?? 15000);
    const eHit = enemies?.raycast(origin, dir, tDist ?? 15000);
    if (eHit && (!tHit || eHit.dist < tHit.dist)) tHit = eHit;
    const trHit = enemyTrain?.active ? enemyTrain.raycast(origin, dir, tDist ?? 6000) : null;
    if (trHit && (!tHit || trHit.dist < tHit.dist)) tHit = trHit;
    if (tHit && (tDist == null || tHit.dist < tDist)) return { dist: tHit.dist, target: tHit.target };
    return tDist == null ? null : { dist: tDist };
  };

  // 命中判定：我方彈打靶與敵兵，敵彈打我方車廂、玩家與暴露的乘員
  const hitTest = (a, b, p) => {
    if (p.side === 'enemy') return damage?.hitTest(a, b) ?? null;
    const t = targets.segmentHit(a, b);
    const e = enemies?.segmentHit(a, b);
    if (t && (!e || t.point.distanceToSquared(a) <= e.point.distanceToSquared(a))) return { kind: 'target', target: t.target, point: t.point };
    if (e) return { kind: 'enemy', target: e.target, point: e.point, part: e.part };
    if (enemyTrain?.active) {
      const h = enemyTrain.segmentHit(a, b);
      if (h) return { kind: 'etrain', target: h.car, point: h.point, local: h.local, normal: h.normal };
    }
    return null;
  };
  const projectiles = new Projectiles(scene, terrain, hitTest, (p, point, hit, normal) => {
    if (p.side === 'enemy' && p.kind === 'shell') {
      // 敵砲彈：爆炸、破片（尖鋭弾只有小爆炸）
      const he = p.shell.he;
      effects.explosion(point, he ? 0.6 : 0.25);
      audio.play('explosion', point, he ? 1 : 0.6);
      if (normal) effects.crater(point, normal, he ? 2 : 1);
      if (hit?.kind === 'train') damage.onTrainHit(hit.target, hit.local, hit.normal, p);
      if (he) damage.splash(point);
      return;
    }
    if (p.side === 'enemy') {
      if (hit?.kind === 'train') damage.onTrainHit(hit.target, hit.local, hit.normal, p);
      else if (hit?.kind === 'player') damage.hurt(35 + Math.random() * 30);
      else if (hit?.kind === 'crew') crew.kill(hit.target);
      else effects.dust(point, 0.2);
      return;
    }
    const target = hit?.kind === 'target' ? hit.target : null;
    if (hit?.kind === 'etrain') {
      const r = enemyTrain.applyHit(hit.target, hit.local, hit.normal, p);
      if (p.kind === 'shell') {
        game.stats.hits++;
        game.message(r.pen ? `擊穿敵${hit.target.role}！` : `命中敵${hit.target.role}，未擊穿`, r.pen ? '' : 'radio');
      }
    }
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
    const er = enemies?.applyImpact(point, p, hit?.kind === 'enemy' ? hit.target : null, hit?.part);
    if (er?.hit) res.hit = true;
    const bh = battery?.applyImpact(point, p) ?? [];
    if (bh.length) {
      res.hit = true;
      game.message(`敵迫砲擊毀（${battery.destroyed}／${battery.total}）`);
    }
    if (p.weapon?.id === 'type97') game.emit('mortarImpact', { point: point.clone(), destroyed: bh.length > 0 });
    if (p.kind === 'shell') crewAI?.onImpact(p, point);
    if (p.kind === 'shell' && res.hit) game.stats.hits++;
    for (const t of res.destroyed) {
      game.message(`${t.name}擊毀（${targets.destroyed}/${targets.total}）`);
      game.emit('destroyed', { target: t });
    }
    game.emit('impact', { kind: p.kind, hit: res.hit, point });
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
      else if (s.type === 'mortar') s.obj = new MortarStation(game, car, s.ref);
      if (s.obj) stations.push(s.obj);
    }
  }

  const player = new Player(train);
  game.player = player;
  const trainMap = new TrainMap(document.getElementById('trainmap'), train);
  const guide = new CarGuide(document.getElementById('guide'), train, () => player.where()?.car);

  game.camera = camera;
  crew = new Crew(train, models, game);
  enemies = new Enemies(scene, terrain, train, models, game);
  damage = new Damage(game, train, crew);
  crewAI = new CrewAI(game, crew, stations, enemies, terrain);
  battery = new EnemyBattery(scene, terrain, train, models, game);
  enemyTrain = new EnemyTrain(scene, track, mats, models, game);
  Object.assign(game, { enemies, damage, crew, crewAI, battery, enemyTrain });

  // 第一關教學
  tutorial = new Tutorial(
    {
      game,
      train,
      player,
      stations,
      targets,
      ui,
      input,
      defOf: (obj) => train.cars.flatMap((c) => c.stations).find((s) => s.obj === obj),
      showDebrief: (html) => {
        ui.openModal('debrief', html);
        input.unlock();
      },
    },
    scene,
  );

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
    if (name === 'table') html = game.station?.type === 'mortar' ? mortarTableHtml(WEAPONS.type97) : firingTableHtml(WEAPONS.type14, game.tableShell);
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
    if (b.id === 'start-btn' || b.id === 'free-btn') startLevel(1, b.id === 'start-btn');
    if (b.id === 'debrief-btn') closeModal(true);
    const go = b.dataset.goto;
    if (go === 'menu') {
      if (game.started) location.href = location.pathname;
      else ui.openModal('menu', menuHtml(LEVELS, loadProgress()));
    } else if (go?.startsWith('brief:')) {
      const id = +go.split(':')[1];
      ui.openModal('briefing', briefOf(id));
    } else if (go?.startsWith('start:')) {
      startLevel(+go.split(':')[1]);
    } else if (go?.startsWith('level:')) {
      location.href = `${location.pathname}?level=${go.split(':')[1]}`;
    }
  });

  function briefOf(id) {
    return { 1: briefingHtml, 2: level2BriefHtml, 3: level3BriefHtml, 4: level4BriefHtml, 5: level5BriefHtml }[id]();
  }

  // 開始關卡：1＝教學（可略過）、2＝沿線巡邏、3＝斷軌
  function startLevel(id, withTutorial = false) {
    game.started = true;
    game.level = id;
    audio.init();
    closeModal(true);
    if (id === 1) {
      crewAI.orders.mg = 'hold';
      if (withTutorial) tutorial.start();
      return;
    }
    targets.clear();
    document.getElementById('score').classList.add('hidden');
    mission = new MissionRunner(missionCtx);
    mission.start({ 2: LEVEL2, 3: LEVEL3, 4: LEVEL4, 5: LEVEL5 }[id]);
  }
  const missionCtx = {
    game,
    train,
    get enemies() {
      return enemies;
    },
    get damage() {
      return damage;
    },
    get crew() {
      return crew;
    },
    player,
    railBreak,
    get battery() {
      return battery;
    },
    get enemyTrain() {
      return enemyTrain;
    },
    mortar: stations.find((s) => s.type === 'mortar'),
    radio: (who, text) => game.message(`${who}：「${text}」`, 'radio'),
    showDebrief: (html) => {
      ui.openModal('debrief', html);
      input.unlock();
    },
  };
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
    if (ui.modalName && input.hit('Escape') && !['menu', 'briefing', 'debrief'].includes(ui.modalName)) closeModal(false);
    if (ui.modalName) return;
    // 乘員命令選單：開啟時數字鍵只用來下令
    if (input.locked && crewAI.handleInput(input) && crewAI.menuOpen) {
      for (let i = 1; i <= 9; i++) input.pressed.delete(`Digit${i}`);
    }
    if (input.hit('KeyG')) {
      game.settings.assist = !game.settings.assist;
      game.message(`射擊輔助：${game.settings.assist ? '開（表尺自動設定）' : '關'}`);
    }
  }

  // ── 互動：崗位與艙口 ──
  function nearestInteractable() {
    if (player.level === 'ground') {
      const gap = player.boardingGap();
      return gap >= 0 ? { kind: 'board', gap } : null;
    }
    const w = player.where();
    if (!w) return null;
    if (w.inGap && player.level === 'in' && Math.abs(player.lat) <= 0.5) return { kind: 'dismount' };
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
      if (input.hit(`Digit${i + 1}`)) {
        if (player.level === 'ground') game.message('在車外無法自動移動，請先上車', 'alert');
        else player.startAuto(i, game.message);
      }
    }
    player.update(dt, input);
    // 修軌：在斷口按住 E
    if (player.level === 'ground' && railBreak.near(player.gx, player.gz)) {
      player.repairing = input.down('KeyE');
      if (player.repairing && railBreak.work(dt, damage.hp < 40 ? 0.6 : 1)) {
        game.message('鐵軌修復完成！');
        game.emit('repaired');
      }
      if (player.repairing) return;
    } else {
      player.repairing = false;
    }
    if (input.hit('KeyE')) {
      player.cancelAuto();
      const it = nearestInteractable();
      if (!it) return;
      if (it.kind === 'dismount') {
        if (Math.abs(train.speed) > 0.3) game.message('列車行進中，無法下車', 'alert');
        else if (player.dismount(terrain)) game.message('下車（暴露位置）：小心敵火！');
      } else if (it.kind === 'board') {
        player.board(it.gap);
        game.message('回到列車上');
      } else if (it.kind === 'hatch') {
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
    // 十糎砲瞄準鏡會暫時隱藏自己的砲塔；其他視角都要顯示
    for (const st of stations) if (st.type === 'gun') st.gun.turret.visible = true;
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
    else if (player.level === 'ground') where = '車外地面';
    else where = `${w.inGap ? '車廂連接處' : w.car.name}・${player.level === 'in' ? '車內' : '車頂'}`;
    const exposed = game.mode === 'walk' && player.exposed;
    ui.set(
      ui.status,
      `<div><span class="k">里程</span> ${train.kmPost()} km　<span class="k">速度</span> ${kmh} km/h</div>
       <div><span class="k">傳令鐘</span> ${NOTCHES[train.ordered].name}${train.pending ? '（傳令中）' : ''}</div>
       <div><span class="k">位置</span> ${where}${exposed ? '　<span class="warn">⚠ 暴露位置</span>' : ''}</div>
       <div><span class="k">氣象</span> 15°C・無風　<span class="k">輔助</span> ${game.settings.assist ? '<span class="ok">開</span>' : '關'}</div>
       <div>${damage.statusHtml()}</div>
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
      if (player.level === 'ground' && railBreak.near(player.gx, player.gz)) prompt = player.repairing ? `修理中… ${Math.round(railBreak.progress * 100)}%（放開 E 暫停）` : `按住 E：修復鐵軌（${Math.round(railBreak.progress * 100)}%）`;
      else if (it?.kind === 'dismount') prompt = Math.abs(train.speed) > 0.3 ? '列車停下後，可在此按 E 下車' : '按 E：下車（暴露位置）';
      else if (it?.kind === 'board') prompt = '按 E：上車';
      else if (it?.kind === 'hatch') prompt = `按 E：${player.level === 'in' ? '經艙口爬上車頂' : '經艙口回到車內'}`;
      else if (it?.s.obj) prompt = `按 E：${it.s.label}`;
      else if (it) prompt = it.s.label;
    }
    if (game.mode === 'walk' && player.auto) prompt = `自動前往 ${player.auto.index + 1}・${player.auto.name}（WASD 取消）`;
    ui.set(ui.prompt, prompt);
    const cp = document.getElementById('crewpanel');
    cp.classList.toggle('hidden', !game.started || game.level === 1);
    if (game.started && game.level !== 1) ui.set(cp, crewAI.statusHtml());
    const cm = document.getElementById('cmdmenu');
    cm.classList.toggle('hidden', !crewAI.menuOpen);
    if (crewAI.menuOpen) ui.set(cm, crewAI.menuHtml());
    trainMap.draw({
      player,
      station: game.mode === 'station' ? game.station : null,
      autoTarget: player.auto,
      mode: game.mode,
      highlight: tutorial.highlightCar(),
    });
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
      tutorial.update(0, true);
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
      crew.update(dt);
      enemies.update(dt);
      battery.update(dt);
      enemyTrain.update(dt);
      crewAI.update(dt);
      damage.update(dt);
      tutorial.update(dt);
      mission?.update(dt);
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
    window.__game = { game, camera, renderer, scene, stations, player, train, targets, steps, railBreak, input, damage, battery, enemyTrain, guide, openGuide, closeGuide, tutorial, get mission() { return mission; } };
  }

  ui.loading.classList.add('hidden');
  // 開場：關卡選單（網址帶 ?level=N 時直接顯示該關簡報）
  const lv = +new URLSearchParams(location.search).get('level');
  if (lv === 1) ui.openModal('briefing', briefingHtml());
  else if (lv >= 2 && lv <= 5) ui.openModal('briefing', briefOf(lv));
  else ui.openModal('menu', menuHtml(LEVELS, loadProgress()));
  frame();
}

init().catch((err) => {
  console.error(err);
  ui.setLoading(`載入失敗：${err.message}`);
});
