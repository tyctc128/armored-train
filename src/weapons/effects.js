import * as THREE from 'three';
import { radialTexture } from '../train/textures.js';

const MAX_PARTS = 900;
const WIND = new THREE.Vector3(1.3, 0, 0.7); // 微風（m/s）：煙塵會慢慢飄走
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

// 捲雲狀的煙團貼圖：多個柔邊圓疊出不規則的團塊，邊緣漸淡
function puffTexture(seed) {
  let sd = seed;
  const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.pow(rnd(), 0.7) * 34;
    const x = n / 2 + Math.cos(a) * d;
    const y = n / 2 + Math.sin(a) * d;
    const r = 9 + rnd() * 20;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const light = rnd() < 0.5;
    grd.addColorStop(0, light ? 'rgba(255,255,255,0.3)' : 'rgba(170,170,170,0.26)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, n, n);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 砲口焰：中心亮、帶放射狀火舌
function flareTexture() {
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const core = g.createRadialGradient(64, 64, 0, 64, 64, 60);
  core.addColorStop(0, 'rgba(255,250,225,1)');
  core.addColorStop(0.25, 'rgba(255,205,110,0.85)');
  core.addColorStop(0.6, 'rgba(255,120,30,0.3)');
  core.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = core;
  g.fillRect(0, 0, n, n);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + Math.random() * 0.5;
    const len = 38 + Math.random() * 24;
    const grd = g.createLinearGradient(64, 64, 64 + Math.cos(a) * len, 64 + Math.sin(a) * len);
    grd.addColorStop(0, 'rgba(255,220,150,0.7)');
    grd.addColorStop(1, 'rgba(255,120,30,0)');
    g.strokeStyle = grd;
    g.lineWidth = 5 + Math.random() * 7;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(64, 64);
    g.lineTo(64 + Math.cos(a) * len, 64 + Math.sin(a) * len);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const MAX_CRATERS = 80;

// 砲口焰、爆炸、煙塵、彈坑
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.puffs = [3, 17, 29, 41].map(puffTexture);
    this.smokeTex = this.puffs[0];
    this.flareTex = flareTexture();
    this.debrisTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.0)');
    this.flashTex = radialTexture('rgba(255,240,200,1)', 'rgba(255,140,40,0)');
    this.parts = [];
    this.free = [];
    this.emitters = [];
    this.flash = new THREE.PointLight(0xffb060, 0, 120, 1.6);
    scene.add(this.flash);
    this.flashT = 0;

    this.craterGeo = new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2);
    this.craterMat = new THREE.MeshStandardMaterial({
      color: 0x2a241c,
      roughness: 1,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    this.craters = [];
  }

  sprite() {
    let s = this.free.pop();
    if (!s) {
      if (this.parts.length >= MAX_PARTS) return null;
      s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      s.renderOrder = 2;
      this.scene.add(s);
    }
    s.visible = true;
    return s;
  }

  // colorEnd：生命週期內由 color 漸變到 colorEnd（火球 → 黑煙）；wind：受風影響的比例；gravity：重力（碎屑）
  spawn({ pos, vel = null, size = 1, grow = 0, life = 1, color = 0xffffff, colorEnd = null, opacity = 1, additive = false, tex = null, rise = 0, drag = 1.5, wind = 0, gravity = 0, fadeIn = 12 }) {
    const s = this.sprite();
    if (!s) return;
    const m = s.material;
    m.map = tex || this.puffs[(Math.random() * this.puffs.length) | 0];
    m.color.set(color);
    m.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.opacity = opacity;
    m.rotation = Math.random() * Math.PI * 2;
    m.needsUpdate = true;
    s.position.copy(pos);
    s.scale.setScalar(size);
    this.parts.push({
      s,
      vel: vel ? vel.clone() : new THREE.Vector3(),
      size,
      grow,
      life,
      t: 0,
      opacity,
      rise,
      drag,
      wind,
      gravity,
      fadeIn,
      c0: colorEnd != null ? new THREE.Color(color) : null,
      c1: colorEnd != null ? new THREE.Color(colorEnd) : null,
    });
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      if (p.t >= p.life) {
        p.s.visible = false;
        this.free.push(p.s);
        this.parts.splice(i, 1);
        continue;
      }
      const k = p.t / p.life;
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.vel.y += (p.rise - p.gravity) * dt;
      p.s.position.addScaledVector(p.vel, dt);
      if (p.wind) p.s.position.addScaledVector(WIND, dt * p.wind * Math.min(1, p.t * 0.8));
      // 煙團先快後慢地脹大
      p.s.scale.setScalar(p.size + p.grow * p.life * (1 - Math.pow(1 - k, 2)) * 0.5);
      p.s.material.opacity = p.opacity * Math.pow(1 - k, 1.3) * Math.min(1, p.t * p.fadeIn);
      if (p.c0) p.s.material.color.copy(_c1.copy(p.c0)).lerp(_c2.copy(p.c1), Math.min(1, k * 2.2));
    }
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.t += dt;
      e.acc += dt * e.rate;
      while (e.acc >= 1) {
        e.acc -= 1;
        e.emit();
      }
      if (e.duration && e.t > e.duration) this.emitters.splice(i, 1);
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.intensity = Math.max(0, this.flashT) * this.flashPower;
    }
  }

  lightFlash(pos, power = 400, dur = 0.12) {
    this.flash.position.copy(pos);
    this.flashPower = power / dur;
    this.flashT = dur;
  }

  muzzleFlash(pos, dir, scale = 1) {
    // 砲口焰：正面一團、沿砲軸一串
    for (let i = 0; i < 3; i++) {
      this.spawn({
        pos: pos.clone().addScaledVector(dir, i * 0.7 * scale),
        size: (2.0 - i * 0.45) * scale,
        life: 0.06 + i * 0.015,
        tex: i === 0 ? this.flareTex : this.flashTex,
        additive: true,
        fadeIn: 200,
      });
    }
    // 硝煙：先被火藥氣體往前推，再慢慢散開、隨風飄走
    const puffs = Math.ceil(7 * scale);
    for (let i = 0; i < puffs; i++) {
      const v = dir.clone().multiplyScalar((3 + Math.random() * 14) * Math.sqrt(scale));
      v.x += (Math.random() - 0.5) * 3 * scale;
      v.y += (Math.random() - 0.2) * 2 * scale;
      v.z += (Math.random() - 0.5) * 3 * scale;
      this.spawn({ pos, vel: v, size: 0.7 * scale, grow: 1.5 * scale, life: 3 + Math.random() * 3.5, color: 0xe8e4d8, colorEnd: 0xb4b0a6, opacity: 0.5, rise: 0.25, drag: 2.2, wind: 1 });
    }
    if (scale > 0.5) {
      // 大口徑：砲口下方地面揚起的塵土
      for (let i = 0; i < 4; i++) {
        const v = new THREE.Vector3((Math.random() - 0.5) * 5, 0.6 + Math.random(), (Math.random() - 0.5) * 5).addScaledVector(dir, 3);
        this.spawn({ pos: pos.clone().setY(pos.y - 2.2), vel: v, size: 1.5 * scale, grow: 1.6 * scale, life: 4 + Math.random() * 2, color: 0x9a8c72, opacity: 0.35, drag: 1.2, wind: 1 });
      }
      this.lightFlash(pos, 300 * scale);
    }
  }

  explosion(pos, scale = 1) {
    // 閃光與火球（橘紅 → 黑煙）
    this.spawn({ pos, size: 7 * scale, grow: 60 * scale, life: 0.16, tex: this.flareTex, additive: true, fadeIn: 200 });
    const n = Math.round(12 * Math.sqrt(scale));
    for (let i = 0; i < Math.ceil(n / 2); i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 9, 3 + Math.random() * 9, (Math.random() - 0.5) * 9).multiplyScalar(scale);
      this.spawn({ pos, vel: v, size: 3 * scale, grow: 3.5 * scale, life: 1.6 + Math.random() * 1.2, color: 0xffa040, colorEnd: 0x2a2622, opacity: 0.95, drag: 2.0, rise: 1.5, fadeIn: 60 });
    }
    // 土柱：向上噴起後落下
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 16, 14 + Math.random() * 26, (Math.random() - 0.5) * 16).multiplyScalar(scale * 0.8);
      this.spawn({ pos, vel: v, size: 4 * scale, grow: 1.6 * scale, life: 3.5 + Math.random() * 3, color: 0x4a4236, colorEnd: 0x6a6052, opacity: 0.95, drag: 1.0, gravity: 9, wind: 0.3 });
    }
    // 四散的土塊碎屑
    for (let i = 0; i < n * 2; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 40, 10 + Math.random() * 30, (Math.random() - 0.5) * 40).multiplyScalar(Math.sqrt(scale));
      this.spawn({ pos, vel: v, size: (0.25 + Math.random() * 0.4) * scale, life: 1.5 + Math.random() * 1.5, color: 0x2e2820, opacity: 1, drag: 0.3, gravity: 18, tex: this.debrisTex, fadeIn: 200 });
    }
    // 貼地擴散的塵環與久久不散的煙塵
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * 11, 0.6 + Math.random() * 1.5, Math.sin(a) * 11).multiplyScalar(scale);
      this.spawn({ pos, vel: v, size: 4 * scale, grow: 1.5 * scale, life: 6 + Math.random() * 5, color: 0x9a8e78, opacity: 0.55, drag: 1.6, wind: 0.8 });
    }
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 5, (Math.random() - 0.5) * 6).multiplyScalar(scale);
      this.spawn({ pos, vel: v, size: 7 * scale, grow: 1.4 * scale, life: 10 + Math.random() * 9, color: 0x6e675c, colorEnd: 0x9a9488, opacity: 0.6, drag: 0.5, rise: 0.4, wind: 1 });
    }
    this.lightFlash(pos, 4000 * scale, 0.2);
  }

  dust(pos, scale = 0.3) {
    for (let i = 0; i < 3; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2.5, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2.5).multiplyScalar(scale * 2);
      this.spawn({ pos, vel: v, size: 1.2 * scale, grow: 1.6 * scale, life: 1.4 + Math.random(), color: 0x94886f, opacity: 0.6, wind: 0.6 });
    }
  }

  spark(pos) {
    this.spawn({ pos, size: 0.5, life: 0.08, tex: this.flashTex, additive: true });
  }

  crater(pos, normal, r) {
    let m = this.craters.length >= MAX_CRATERS ? this.craters.shift() : null;
    if (!m) {
      m = new THREE.Mesh(this.craterGeo, this.craterMat);
      m.receiveShadow = true;
      this.scene.add(m);
    }
    m.position.copy(pos).addScaledVector(normal, 0.08);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    m.rotateY(Math.random() * Math.PI);
    m.scale.setScalar(r);
    this.craters.push(m);
  }

  // 持續冒煙（被擊毀的目標）
  smokeColumn(pos, duration = 60, scale = 1) {
    const p = pos.clone();
    this.emitters.push({
      t: 0,
      acc: 0,
      rate: 2.5,
      duration,
      emit: () =>
        this.spawn({
          pos: p,
          vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, 3 + Math.random() * 2, (Math.random() - 0.5) * 1.5),
          size: 2 * scale,
          grow: 1.1 * scale,
          life: 12,
          color: 0x1c1a17,
          colorEnd: 0x56524b,
          opacity: 0.6,
          drag: 0.2,
          rise: 0.4,
          wind: 1,
        }),
    });
  }

  // 機關車煙囪（getter 回傳目前位置與強度）
  chimney(getState) {
    const tmp = new THREE.Vector3();
    this.emitters.push({
      t: 0,
      acc: 0,
      get rate() {
        return getState(tmp).rate;
      },
      duration: 0,
      emit: () => {
        const st = getState(tmp);
        // 煤煙：出力大時又黑又急，怠速時淡而慢；冬天的冷空氣裡久久不散
        this.spawn({
          pos: tmp,
          vel: new THREE.Vector3((Math.random() - 0.5) * 0.8, 4 + st.power * 5, (Math.random() - 0.5) * 0.8),
          size: 0.9,
          grow: 1.0 + st.power * 0.5,
          life: 7 + st.power * 4,
          color: st.power > 0.3 ? 0x2a2825 : 0x55524b,
          colorEnd: 0x8a877f,
          opacity: 0.45 + st.power * 0.25,
          drag: 0.6,
          rise: 0.35,
          wind: 1,
        });
        // 汽缸與安全閥的白色蒸汽（低處、兩側）
        if (Math.random() < 0.5) {
          const side = Math.random() < 0.5 ? -1 : 1;
          this.spawn({
            pos: tmp.clone().add(new THREE.Vector3(1.5, -3.0, side * 1.5)),
            vel: new THREE.Vector3(1.5 + Math.random() * 2, 0.4 + Math.random(), side * (1 + Math.random() * 2.5)),
            size: 0.6,
            grow: 1.0,
            life: 2.5 + Math.random() * 2,
            color: 0xf2f2ee,
            opacity: 0.4 + st.power * 0.2,
            drag: 1.5,
            rise: 0.5,
            wind: 1,
          });
        }
      },
    });
  }
}
