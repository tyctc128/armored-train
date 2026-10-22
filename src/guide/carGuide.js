import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CARS, OPS } from './guideData.js';

const STATION_ICON = { gun: '砲', mg: '槍', console: '指', rangefinder: '測', mortar: '迫' };
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// 車廂圖鑑：左側車廂清單、中間可旋轉的 3D 模型與標註點、右側介紹／內裝／操作
export class CarGuide {
  constructor(root, train, getPlayerCar) {
    this.root = root;
    this.train = train;
    this.getPlayerCar = getPlayerCar;
    this.isOpen = false;
    this.index = 0;
    this.mode = 'ext';
    this.tab = 'overview';
    this.selected = null;
    this.autoRotate = true;
    this.tween = null;
    this.buildDom();
    this.buildScene();
  }

  // ───────────────────────── DOM ─────────────────────────
  buildDom() {
    this.root.innerHTML = `
      <div class="g-shell">
        <header class="g-head">
          <div class="g-brand">
            <svg viewBox="0 0 48 24" aria-hidden="true"><rect x="2" y="6" width="12" height="10" rx="1"/><rect x="16" y="4" width="14" height="12" rx="1"/><rect x="32" y="7" width="14" height="9" rx="1"/><circle cx="7" cy="19" r="2.2"/><circle cx="23" cy="19" r="2.2"/><circle cx="39" cy="19" r="2.2"/></svg>
            <div><h1>車廂圖鑑</h1><span>九四式裝甲列車・8 節編成</span></div>
          </div>
          <div class="g-head-hint"><kbd>←</kbd><kbd>→</kbd> 或 <kbd>1</kbd>–<kbd>8</kbd> 切換車廂　<kbd>I</kbd>／<kbd>Esc</kbd> 關閉</div>
          <button class="g-close" title="關閉（I／Esc）">✕</button>
        </header>
        <nav class="g-list"></nav>
        <section class="g-viewer">
          <canvas class="g-canvas"></canvas>
          <div class="g-pins"></div>
          <div class="g-bar">
            <div class="g-seg">
              <button data-mode="ext">外觀</button>
              <button data-mode="int">車內</button>
            </div>
            <button class="g-tog" data-act="rotate">自動旋轉</button>
            <button class="g-tog" data-act="reset">重設視角</button>
          </div>
          <div class="g-card hidden"></div>
          <div class="g-hint">拖曳旋轉・右鍵拖曳平移・滾輪縮放・點標註看說明</div>
        </section>
        <section class="g-detail">
          <div class="g-title"></div>
          <div class="g-tabs">
            <button data-tab="overview">概要</button>
            <button data-tab="ext">外觀</button>
            <button data-tab="int">內裝</button>
            <button data-tab="ops">操作</button>
            <button data-tab="tips">提示</button>
          </div>
          <div class="g-body"></div>
        </section>
      </div>`;
    const q = (s) => this.root.querySelector(s);
    this.el = {
      list: q('.g-list'),
      canvas: q('.g-canvas'),
      viewer: q('.g-viewer'),
      pins: q('.g-pins'),
      card: q('.g-card'),
      title: q('.g-title'),
      body: q('.g-body'),
      tabs: q('.g-tabs'),
      bar: q('.g-bar'),
    };
    q('.g-close').addEventListener('click', () => this.onClose?.());
    this.el.list.addEventListener('click', (e) => {
      const b = e.target.closest('[data-index]');
      if (b) this.select(+b.dataset.index);
    });
    this.el.tabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      this.tab = b.dataset.tab;
      if (this.tab === 'ext' || this.tab === 'int') this.setMode(this.tab);
      this.renderDetail();
    });
    this.el.bar.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.mode) {
        this.setMode(b.dataset.mode);
        if (this.tab === 'ext' || this.tab === 'int') this.tab = b.dataset.mode;
        this.renderDetail();
      }
      if (b.dataset.act === 'rotate') this.autoRotate = !this.autoRotate;
      if (b.dataset.act === 'reset') this.resetView(true);
      this.renderBar();
    });
    this.el.body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-item]');
      if (!b) return;
      const [mode, i] = b.dataset.item.split(':');
      this.focusItem(mode, +i);
    });
    this.el.pins.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pin]');
      if (b) this.focusItem(this.mode, +b.dataset.pin);
    });
  }

  renderList() {
    const here = this.getPlayerCar();
    this.el.list.innerHTML = this.train.cars
      .map((car, i) => {
        const d = CARS[car.kind];
        const icons = [...new Set(car.stations.filter((s) => s.obj).map((s) => STATION_ICON[s.type]).filter(Boolean))]
          .map((t) => `<i>${t}</i>`)
          .join('');
        return `<button data-index="${i}" class="${i === this.index ? 'on' : ''}">
          <b>${i + 1}</b>
          <div><strong>${d.title}</strong><small>${d.subtitle.split('・')[1] ?? ''}</small>
          <span class="g-icons">${icons}${here === car ? '<em>你在這裡</em>' : ''}</span></div>
        </button>`;
      })
      .join('');
  }

  renderBar() {
    this.el.bar.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === this.mode));
    this.el.bar.querySelector('[data-act="rotate"]').classList.toggle('on', this.autoRotate);
  }

  renderDetail() {
    const car = this.train.cars[this.index];
    const d = CARS[car.kind];
    const isHere = this.getPlayerCar() === car;
    this.el.title.innerHTML = `<span>第 ${this.index + 1} 節${isHere ? '・你在這裡' : ''}</span><h2>${d.title}</h2><p>${d.subtitle.split('・')[1] ?? ''}</p>`;
    this.el.tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    let html = '';
    if (this.tab === 'overview') {
      html = `<p class="g-lead">${d.role}</p>
        <table class="g-specs">${d.specs.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>
        <div class="g-note"><b>史料與設定</b>${d.history}</div>`;
    } else if (this.tab === 'ext' || this.tab === 'int') {
      const items = this.tab === 'ext' ? d.exterior : d.interior;
      html = `<p class="g-sub">點選項目，3D 視角會移過去。${this.tab === 'int' ? '車內物品目前只是外觀，角色可直接穿過。' : ''}</p>
        <ol class="g-items">${items
          .map(
            (it, i) => `<li data-item="${this.tab}:${i}" class="${this.selected && this.selected.mode === this.tab && this.selected.i === i ? 'on' : ''}">
              <b>${i + 1}</b><div><strong>${it.n}</strong><span>${it.d}</span></div></li>`,
          )
          .join('')}</ol>`;
    } else if (this.tab === 'ops') {
      const types = [...d.stations, 'walk'];
      html = types
        .map((t) => {
          const o = OPS[t];
          const count = car.stations.filter((s) => s.type === t).length;
          return `<div class="g-op">
            <h3>${o.title}${count > 1 ? `<small>×${count}</small>` : ''}</h3>
            <table>${o.keys.map(([k, v]) => `<tr><th>${k.split(/(\s*\/\s*|、)/).map((s) => (/^\s*\/\s*$|^、$/.test(s) ? s : `<kbd>${s}</kbd>`)).join('')}</th><td>${v}</td></tr>`).join('')}</table>
            ${o.steps.length ? `<ul>${o.steps.map((s) => `<li>${s}</li>`).join('')}</ul>` : ''}
          </div>`;
        })
        .join('');
      const locked = car.stations.filter((s) => s.type === 'locked');
      if (locked.length) html += `<div class="g-note"><b>尚未開放</b>${locked.map((s) => s.label).join('、')}</div>`;
      if (!d.stations.length) html = `<div class="g-note"><b>沒有可操作的崗位</b>機關車由司機駕駛，你只能經過這節車。</div>` + html;
    } else {
      html = `<ul class="g-tips">${d.tips.map((t) => `<li>${t}</li>`).join('')}</ul>`;
    }
    this.el.body.innerHTML = html;
  }

  // ───────────────────────── 3D 檢視 ─────────────────────────
  buildScene() {
    const r = new THREE.WebGLRenderer({ canvas: this.el.canvas, antialias: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1d2018);
    scene.fog = new THREE.Fog(0x1d2018, 30, 70);
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    this.scene = scene;

    scene.add(new THREE.HemisphereLight(0xe4ecf7, 0x3a372b, 0.7));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
    key.position.set(9, 14, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.03;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd4ff, 0.8);
    rim.position.set(-10, 6, -12);
    scene.add(rim);
    this.lamp = new THREE.PointLight(0xffe2b0, 0, 9, 1.5);
    scene.add(this.lamp);

    // 展示台：地面、道碴、鐵軌、枕木
    const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2b2e23, roughness: 1 }));
    ground.position.y = -0.45;
    ground.receiveShadow = true;
    scene.add(ground);
    const ballast = new THREE.Mesh(new THREE.BoxGeometry(40, 0.25, 3.2), new THREE.MeshStandardMaterial({ color: 0x55514a, roughness: 1 }));
    ballast.position.y = -0.4;
    ballast.receiveShadow = true;
    scene.add(ballast);
    const tieGeo = new THREE.BoxGeometry(0.24, 0.16, 2.6);
    const ties = new THREE.InstancedMesh(tieGeo, new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 }), 60);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 60; i++) ties.setMatrixAt(i, m.makeTranslation(-19.5 + i * 0.65, -0.24, 0));
    ties.receiveShadow = true;
    scene.add(ties);
    for (const z of [-0.7535, 0.7535]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(40, 0.16, 0.07), new THREE.MeshStandardMaterial({ color: 0x77706a, roughness: 0.35, metalness: 0.85 }));
      rail.position.set(0, -0.08, z);
      rail.receiveShadow = true;
      scene.add(rail);
    }

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
    this.controls = new OrbitControls(this.camera, this.el.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.addEventListener('start', () => {
      this.tween = null;
      this.userTouched = true;
    });
    this.raycaster = new THREE.Raycaster();
  }

  showCar(i) {
    if (this.carObj) this.scene.remove(this.carObj);
    const src = this.train.cars[i].group;
    const obj = src.clone(true);
    obj.position.set(0, 0, 0);
    obj.quaternion.identity();
    obj.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.carObj = obj;
    this.scene.add(obj);
  }

  views() {
    const car = this.train.cars[this.index];
    const L = car.len;
    if (this.mode === 'ext') {
      return { pos: new THREE.Vector3(L * 0.36, 4.4, L * 0.64 + 2), target: new THREE.Vector3(0, 2.0, 0), min: 4, max: 45 };
    }
    if (car.loco) return { pos: new THREE.Vector3(-L / 2 - 0.4, 2.8, 0.9), target: new THREE.Vector3(-2.6, 2.3, 0), min: 0.3, max: 6 };
    return { pos: new THREE.Vector3(-L / 2 + 1.0, 2.85, 0.25), target: new THREE.Vector3(L * 0.25, 2.25, 0), min: 0.3, max: L * 0.8 };
  }

  resetView(animate) {
    const v = this.views();
    this.controls.minDistance = v.min;
    this.controls.maxDistance = v.max;
    this.moveTo(v.pos, v.target, animate);
    this.selected = null;
    this.el.card.classList.add('hidden');
  }

  moveTo(pos, target, animate) {
    if (!animate) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.tween = null;
      return;
    }
    this.tween = { t: 0, p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: pos, t1: target };
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.lamp.intensity = mode === 'int' ? 6 : 0;
    this.resetView(false);
    this.renderBar();
  }

  focusItem(mode, i) {
    const car = this.train.cars[this.index];
    const d = CARS[car.kind];
    const it = (mode === 'ext' ? d.exterior : d.interior)[i];
    if (!it) return;
    if (this.mode !== mode) this.setMode(mode);
    this.autoRotate = false;
    this.selected = { mode, i };
    const p = new THREE.Vector3(...it.p);
    let cam;
    if (mode === 'ext') {
      const side = it.p[2] >= 0 ? 1 : -1;
      cam = new THREE.Vector3(p.x + 3, p.y + 2.2, p.z + side * 6.5);
    } else {
      const L2 = car.len / 2 - 0.6;
      const dx = p.x > 0 ? -2.2 : 2.2;
      cam = new THREE.Vector3(THREE.MathUtils.clamp(p.x + dx, -L2, L2), 2.85, THREE.MathUtils.clamp(-p.z * 0.35, -0.6, 0.6));
      if (car.loco) cam.set(p.x + (p.x > 0 ? -2.5 : 2.5), p.y + 1.0, p.z > 1 ? 3 : 2.2);
    }
    this.moveTo(cam, p, true);
    this.el.card.innerHTML = `<b>${i + 1}</b><div><strong>${it.n}</strong><span>${it.d}</span></div>`;
    this.el.card.classList.remove('hidden');
    if (this.tab !== mode) this.tab = mode;
    this.renderDetail();
    this.renderBar();
  }

  select(i) {
    this.index = THREE.MathUtils.clamp(i, 0, this.train.cars.length - 1);
    this.showCar(this.index);
    this.selected = null;
    if (this.mode === 'int' && this.tab === 'int') this.tab = 'int';
    else if (this.tab === 'int') this.tab = 'overview';
    this.mode = this.tab === 'int' ? 'int' : 'ext';
    this.lamp.intensity = this.mode === 'int' ? 6 : 0;
    this.resetView(false);
    this.renderList();
    this.renderDetail();
    this.renderBar();
  }

  open(index) {
    this.isOpen = true;
    this.root.classList.remove('hidden');
    this.autoRotate = true;
    this.mode = 'ext';
    this.tab = 'overview';
    this.select(index);
    this.resize();
  }

  close() {
    this.isOpen = false;
    this.root.classList.add('hidden');
  }

  handleKey(code) {
    if (code === 'ArrowLeft') this.select(this.index - 1);
    if (code === 'ArrowRight') this.select(this.index + 1);
    const m = /^Digit([1-8])$/.exec(code);
    if (m) this.select(+m[1] - 1);
  }

  resize() {
    const r = this.el.viewer.getBoundingClientRect();
    if (!r.width) return;
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
    this.size = { w: r.width, h: r.height };
  }

  update(dt) {
    if (!this.isOpen) return;
    const r = this.el.viewer.getBoundingClientRect();
    if (!this.size || Math.abs(r.width - this.size.w) > 1 || Math.abs(r.height - this.size.h) > 1) this.resize();
    if (this.tween) {
      this.tween.t = Math.min(1, this.tween.t + dt / 0.75);
      const k = ease(this.tween.t);
      this.camera.position.lerpVectors(this.tween.p0, this.tween.p1, k);
      this.controls.target.lerpVectors(this.tween.t0, this.tween.t1, k);
      if (this.tween.t >= 1) this.tween = null;
    }
    this.controls.autoRotate = this.autoRotate && this.mode === 'ext' && !this.tween;
    this.controls.autoRotateSpeed = 0.8;
    this.controls.update(dt);
    this.lamp.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
    this.updatePins();
  }

  updatePins() {
    const car = this.train.cars[this.index];
    const d = CARS[car.kind];
    const items = this.mode === 'ext' ? d.exterior : d.interior;
    if (this.pinKey !== `${this.index}:${this.mode}`) {
      this.pinKey = `${this.index}:${this.mode}`;
      this.el.pins.innerHTML = items.map((it, i) => `<button data-pin="${i}" title="${it.n}"><b>${i + 1}</b><span>${it.n}</span></button>`).join('');
    }
    const v = new THREE.Vector3();
    const camPos = this.camera.position;
    const pins = this.el.pins.children;
    // 被車體擋住的標註變淡（射線檢查較耗時，每 0.2 秒做一次）
    const now = performance.now();
    if (!this.occludedAt || now - this.occludedAt > 200) {
      this.occludedAt = now;
      this.occluded = items.map((it) => {
        v.set(...it.p).sub(camPos);
        const dist = v.length();
        this.raycaster.set(camPos, v.normalize());
        this.raycaster.far = dist - 0.25;
        return this.raycaster.intersectObject(this.carObj, true).length > 0;
      });
    }
    items.forEach((it, i) => {
      const el = pins[i];
      if (!el) return;
      v.set(...it.p);
      const dist = v.distanceTo(camPos);
      v.project(this.camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 && (this.mode === 'ext' || dist < 9);
      el.style.display = visible ? '' : 'none';
      if (!visible) return;
      el.style.transform = `translate(${((v.x + 1) / 2) * this.size.w}px, ${((1 - v.y) / 2) * this.size.h}px)`;
      el.classList.toggle('on', !!this.selected && this.selected.mode === this.mode && this.selected.i === i);
      const hidden = this.occluded?.[i] && !el.classList.contains('on');
      el.style.opacity = hidden ? '0.3' : this.mode === 'int' ? Math.max(0.35, 1 - dist / 9).toFixed(2) : '';
      el.style.zIndex = hidden ? '0' : '1';
    });
  }
}
