import * as THREE from 'three';
import { radialTexture, smokeTexture } from '../train/textures.js';

const MAX_PARTS = 500;
const MAX_CRATERS = 80;

// 砲口焰、爆炸、煙塵、彈坑
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.smokeTex = smokeTexture();
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

  spawn({ pos, vel = null, size = 1, grow = 0, life = 1, color = 0xffffff, opacity = 1, additive = false, tex = null, rise = 0, drag = 1.5 }) {
    const s = this.sprite();
    if (!s) return;
    const m = s.material;
    m.map = tex || this.smokeTex;
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
      p.vel.y += p.rise * dt;
      p.s.position.addScaledVector(p.vel, dt);
      p.s.scale.setScalar(p.size + p.grow * p.t);
      p.s.material.opacity = p.opacity * (1 - k) * Math.min(1, p.t * 12);
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
    for (let i = 0; i < 3; i++) {
      this.spawn({
        pos: pos.clone().addScaledVector(dir, i * 0.6 * scale),
        size: (1.6 - i * 0.35) * scale,
        life: 0.07,
        tex: this.flashTex,
        additive: true,
      });
    }
    const puffs = Math.ceil(4 * scale);
    for (let i = 0; i < puffs; i++) {
      const v = dir.clone().multiplyScalar(4 + Math.random() * 10 * scale);
      v.x += (Math.random() - 0.5) * 3;
      v.y += Math.random() * 1.5;
      v.z += (Math.random() - 0.5) * 3;
      this.spawn({ pos, vel: v, size: 0.8 * scale, grow: 2.2 * scale, life: 2.5 + Math.random() * 2, color: 0xd8d4c8, opacity: 0.45, rise: 0.4 });
    }
    if (scale > 0.5) this.lightFlash(pos, 300 * scale);
  }

  explosion(pos, scale = 1) {
    this.spawn({ pos, size: 8 * scale, grow: 40 * scale, life: 0.2, tex: this.flashTex, additive: true });
    const n = Math.round(12 * Math.sqrt(scale));
    // 土柱：向上噴起後落下
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 16, 14 + Math.random() * 26, (Math.random() - 0.5) * 16).multiplyScalar(scale * 0.8);
      this.spawn({ pos, vel: v, size: 5 * scale, grow: 5 * scale, life: 4 + Math.random() * 4, color: 0x4f473b, opacity: 0.95, drag: 1.0, rise: -3 });
    }
    // 擴散的煙塵
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 8, 2 + Math.random() * 5, (Math.random() - 0.5) * 8).multiplyScalar(scale);
      this.spawn({ pos, vel: v, size: 8 * scale, grow: 4 * scale, life: 9 + Math.random() * 8, color: 0x8a8273, opacity: 0.7, drag: 0.5, rise: 0.4 });
    }
    this.lightFlash(pos, 4000 * scale, 0.2);
  }

  dust(pos, scale = 0.3) {
    this.spawn({ pos, vel: new THREE.Vector3(0, 1.5, 0), size: 0.6 * scale * 3, grow: 1.5 * scale * 3, life: 1.6, color: 0x8b806c, opacity: 0.7 });
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
          grow: 2.5 * scale,
          life: 9,
          color: 0x2e2b27,
          opacity: 0.55,
          drag: 0.2,
          rise: 0.4,
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
        this.spawn({
          pos: tmp,
          vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 3.5 + st.power * 3, (Math.random() - 0.5) * 0.6),
          size: 0.9,
          grow: 1.6,
          life: 5,
          color: 0x4a4740,
          opacity: 0.5,
          drag: 0.5,
          rise: 0.3,
        });
      },
    });
  }
}
