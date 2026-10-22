import * as THREE from 'three';

const JOINTS = [
  'Hips', 'Spine', 'Head',
  'ShoulderL', 'ElbowL', 'HandL', 'ShoulderR', 'ElbowR', 'HandR',
  'HipL', 'KneeL', 'AnkleL', 'HipR', 'KneeR', 'AnkleR',
];

// 姿勢：各關節的 [繞 X, 繞 Y, 繞 Z] 弧度（角色面向 +X；繞 Z 正值＝往前抬）
// 未列出的關節回到 0。hipsY 為骨盆高度位移（坐姿用）。
const D = Math.PI / 180;
export const POSES = {
  stand: {},
  attention: { ShoulderL: [0.05, 0, 0], ShoulderR: [-0.05, 0, 0] },
  operate: { Spine: [0, 0, 8 * D], ShoulderL: [0, 0, 55 * D], ElbowL: [0, 0, 45 * D], ShoulderR: [0, 0, 55 * D], ElbowR: [0, 0, 45 * D] },
  telegraph: { Spine: [0, 0, 5 * D], ShoulderR: [-0.15, 0, 50 * D], ElbowR: [0, 0, 55 * D], ShoulderL: [0.1, 0, 5 * D] },
  map: {
    Spine: [0, 0, 32 * D], Head: [0, 0, 20 * D],
    ShoulderL: [0.15, 0, 60 * D], ElbowL: [0, 0, 20 * D], ShoulderR: [-0.15, 0, 60 * D], ElbowR: [0, 0, 20 * D],
    HipL: [0, 0, -10 * D], HipR: [0, 0, -10 * D],
  },
  sit: {
    hipsY: -0.47,
    HipL: [0, 0, 88 * D], KneeL: [0, 0, -88 * D], HipR: [0, 0, 88 * D], KneeR: [0, 0, -88 * D],
    ShoulderL: [0, 0, 40 * D], ElbowL: [0, 0, 60 * D], ShoulderR: [0, 0, 40 * D], ElbowR: [0, 0, 60 * D],
  },
  sitWork: {
    hipsY: -0.47, Spine: [0, 0, 10 * D],
    HipL: [0, 0, 88 * D], KneeL: [0, 0, -88 * D], HipR: [0, 0, 88 * D], KneeR: [0, 0, -88 * D],
    ShoulderL: [0, 0, 70 * D], ElbowL: [0, 0, 30 * D], ShoulderR: [-0.2, 0, 85 * D], ElbowR: [0, 0, 25 * D],
  },
  phone: { ShoulderL: [0.35, 0, 35 * D], ElbowL: [0, 0, 135 * D], Head: [0.12, 0, 0], ShoulderR: [0, 0, 10 * D] },
  carry: { ShoulderL: [0.1, 0, 60 * D], ElbowL: [0, 0, 55 * D], ShoulderR: [-0.1, 0, 60 * D], ElbowR: [0, 0, 55 * D] },
  salute: { ShoulderR: [-1.25, 0, 25 * D], ElbowR: [0, 0, 125 * D], HandR: [0, 0, -0.3], ShoulderL: [0.04, 0, 0] },
  lookUp: { Head: [0, 0, 28 * D], Spine: [0, 0, -6 * D], ShoulderL: [0, 0, 20 * D], ElbowL: [0, 0, 30 * D] },
};

// 以分部件關節組成的 3D 軍士，動作由程式產生
export class Soldier {
  constructor(template, { pose = 'stand', name = '', variant = 'crew' } = {}) {
    this.root = template.clone(true);
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.j = {};
    for (const n of JOINTS) this.j[n] = this.root.getObjectByName(n);
    this.rifle = this.root.getObjectByName('Rifle');
    this.baseHipsY = this.j.Hips.position.y;
    this.name = name;
    this.variant = variant;
    this.pose = pose;
    this.target = POSES[pose];
    this.cur = {};
    for (const n of JOINTS) this.cur[n] = [0, 0, 0];
    this.curHipsY = 0;
    this.walk = 0;           // 0–1 走路混合比例
    this.phase = Math.random() * 10;
    this.t = Math.random() * 10;
    this.headYaw = 0;
    this.lookTarget = null;  // 世界座標，頭轉向
    this.saluteT = 0;
    this.applyPose(true);
  }

  setPose(name) {
    if (!POSES[name]) return;
    this.pose = name;
    this.target = POSES[name];
  }

  salute(dur = 1.8) {
    this.saluteT = dur;
  }

  applyPose(snap) {
    const tgt = this.saluteT > 0 ? { ...this.target, ...POSES.salute, Head: [0, 0, 0] } : this.target;
    const k = snap ? 1 : 0.12;
    for (const n of JOINTS) {
      const t = tgt[n] ?? [0, 0, 0];
      const c = this.cur[n];
      for (let i = 0; i < 3; i++) c[i] += (t[i] - c[i]) * k;
    }
    this.curHipsY += ((tgt.hipsY ?? 0) - this.curHipsY) * k;
  }

  update(dt, speed = 0) {
    this.t += dt;
    if (this.saluteT > 0) this.saluteT -= dt;
    this.walk += ((speed > 0.05 ? 1 : 0) - this.walk) * Math.min(1, dt * 6);
    this.phase += dt * (speed > 0.05 ? speed * 3.6 : 0);
    this.applyPose(false);

    const j = this.j;
    const s = Math.sin(this.phase);
    const w = this.walk;
    const breathe = Math.sin(this.t * 1.6) * 0.02;
    for (const n of JOINTS) {
      const c = this.cur[n];
      j[n].rotation.set(c[0], c[1], c[2]);
    }
    // 呼吸與重心
    j.Spine.rotation.z += breathe;
    j.Hips.position.y = this.baseHipsY + this.curHipsY + w * Math.abs(Math.cos(this.phase)) * 0.03;
    // 走路：雙腿交替、膝蓋彎曲、手臂反向擺動
    if (w > 0.01) {
      j.HipL.rotation.z += s * 0.55 * w;
      j.HipR.rotation.z -= s * 0.55 * w;
      j.KneeL.rotation.z -= Math.max(0, -s) * 0.8 * w;
      j.KneeR.rotation.z -= Math.max(0, s) * 0.8 * w;
      if (this.pose !== 'carry') {
        j.ShoulderL.rotation.z -= s * 0.4 * w;
        j.ShoulderR.rotation.z += s * 0.4 * w;
      }
    }
    // 頭轉向注視目標
    let want = 0;
    if (this.lookTarget) {
      const p = this.root.worldToLocal(this.lookTarget.clone());
      want = THREE.MathUtils.clamp(Math.atan2(-p.z, p.x), -1.1, 1.1);
    } else {
      want = Math.sin(this.t * 0.23 + this.phase) * 0.25 * (1 - w);
    }
    this.headYaw += (want - this.headYaw) * Math.min(1, dt * 3);
    j.Head.rotation.y = this.headYaw;
  }
}
