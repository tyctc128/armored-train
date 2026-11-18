import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const JOINTS = [
  'Hips', 'Spine', 'Head',
  'ShoulderL', 'ElbowL', 'HandL', 'ShoulderR', 'ElbowR', 'HandR',
  'HipL', 'KneeL', 'AnkleL', 'HipR', 'KneeR', 'AnkleR',
];

// 姿勢：各關節的 [繞 X, 繞 Y, 繞 Z] 弧度（角色面向 +X；繞 Z 正值＝往前抬）
// 未列出的關節回到 0。hipsY 為骨盆高度位移（坐姿用）。
const D = Math.PI / 180;
const SWING = 0.4; // 走路時大腿前後擺動的幅度（弧度）
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
  // 持槍瞄準（步槍改架在肩上，見 rifleAim）
  aim: {
    rifle: 'aim', Spine: [0, -0.25, 4 * D], Head: [0, 0.2, -4 * D],
    ShoulderR: [-0.25, 0, 70 * D], ElbowR: [0, 0, 70 * D], ShoulderL: [0.35, 0, 80 * D], ElbowL: [0, 0, 15 * D],
  },
  crouchAim: {
    rifle: 'aim', hipsY: -0.38, Spine: [0, -0.25, 12 * D], Head: [0, 0.2, -8 * D],
    HipL: [0, 0, 100 * D], KneeL: [0, 0, -130 * D], HipR: [0, 0, 10 * D], KneeR: [0, 0, -120 * D],
    ShoulderR: [-0.25, 0, 70 * D], ElbowR: [0, 0, 70 * D], ShoulderL: [0.35, 0, 80 * D], ElbowL: [0, 0, 15 * D],
  },
  // 趴姿：整個身體往前倒（root 俯仰），手臂往前持槍
  prone: {
    rifle: 'aim', rootPitch: -86 * D, rootLift: 0.18, Head: [0, 0, 70 * D],
    ShoulderL: [0.3, 0, 160 * D], ElbowL: [0, 0, 20 * D], ShoulderR: [-0.3, 0, 150 * D], ElbowR: [0, 0, 60 * D],
    HipL: [0.15, 0, 0], HipR: [-0.15, 0, 0],
  },
  dead: {
    rootPitch: 88 * D, rootLift: 0.12, Head: [0, 0.5, 0],
    ShoulderL: [0.9, 0, 30 * D], ElbowL: [0, 0, 40 * D], ShoulderR: [-0.7, 0, 60 * D], ElbowR: [0, 0, 20 * D],
    HipL: [0.2, 0, 10 * D], KneeL: [0, 0, -30 * D], HipR: [-0.1, 0, 0],
  },
  // 騎乘：坐在馬鞍上、雙腿夾住馬身
  ride: {
    hipsY: -0.92,
    HipL: [0.45, 0, 70 * D], KneeL: [0, 0, -95 * D], HipR: [-0.45, 0, 70 * D], KneeR: [0, 0, -95 * D],
    ShoulderL: [0, 0, 45 * D], ElbowL: [0, 0, 50 * D], ShoulderR: [0, 0, 45 * D], ElbowR: [0, 0, 50 * D],
  },
  rideAim: {
    rifle: 'aim', hipsY: -0.92, Spine: [0, -0.4, 0], Head: [0, 0.3, 0],
    HipL: [0.45, 0, 70 * D], KneeL: [0, 0, -95 * D], HipR: [-0.45, 0, 70 * D], KneeR: [0, 0, -95 * D],
    ShoulderR: [-0.25, 0, 70 * D], ElbowR: [0, 0, 70 * D], ShoulderL: [0.35, 0, 80 * D], ElbowL: [0, 0, 15 * D],
  },
  wounded: { hipsY: -0.5, Spine: [0, 0, 25 * D], HipL: [0, 0, 95 * D], KneeL: [0, 0, -95 * D], HipR: [0, 0, 95 * D], KneeR: [0, 0, -95 * D], ShoulderL: [0, 0, 30 * D], ElbowL: [0, 0, 90 * D] },
};

// 以分部件關節組成的 3D 軍士，動作由程式產生
export class Soldier {
  constructor(template, { pose = 'stand', name = '', variant = 'crew' } = {}) {
    this.root = cloneSkinned(template); // 蒙皮模型需連同骨架一起複製
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.j = {};
    for (const n of JOINTS) this.j[n] = this.root.getObjectByName(n);
    this.rifle = this.root.getObjectByName('Rifle');
    if (this.rifle) {
      this.rifleSlung = { p: this.rifle.position.clone(), r: this.rifle.rotation.clone() };
      this.rifleAim = { p: new THREE.Vector3(0.24, 0.37, 0.12), r: new THREE.Euler(0, 0, -Math.PI / 2) };
    }
    this.baseHipsY = this.j.Hips.position.y;
    // 大腿、小腿長度：走路時用來算腳離骨盆多遠，讓踩地的那隻腳貼著地面
    this.thigh = this.j.KneeL.position.length();
    this.shin = this.j.AnkleL.position.length();
    this.rootPitch = 0;
    this.rootLift = 0;
    this.baseY = 0; // 由外部設定地面高度
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
    this.rootPitch += ((tgt.rootPitch ?? 0) - this.rootPitch) * (snap ? 1 : 0.1);
    this.rootLift += ((tgt.rootLift ?? 0) - this.rootLift) * (snap ? 1 : 0.1);
    if (this.rifle) {
      const r = tgt.rifle === 'aim' ? this.rifleAim : this.rifleSlung;
      this.rifle.position.copy(r.p);
      this.rifle.rotation.copy(r.r);
    }
  }

  update(dt, speed = 0) {
    this.t += dt;
    if (this.saluteT > 0) this.saluteT -= dt;
    this.walk += ((speed > 0.05 ? 1 : 0) - this.walk) * Math.min(1, dt * 6);
    // 步頻跟著步幅走（一個循環兩步，每步 2·腿長·sin(擺幅)），腳才不會在地上滑
    const stride = 4 * (this.thigh + this.shin) * Math.sin(SWING);
    this.phase += dt * (speed > 0.05 ? (speed * Math.PI * 2) / stride : 0);
    this.applyPose(false);

    const j = this.j;
    const s = Math.sin(this.phase);
    const w = this.walk;
    const breathe = Math.sin(this.t * 1.6) * 0.02;
    for (const n of JOINTS) {
      const c = this.cur[n];
      j[n].rotation.set(c[0], c[1], c[2]);
    }
    // 趴下、倒地：整個身體繞腳底俯仰
    this.root.rotation.z = this.rootPitch;
    this.root.position.y = this.baseY + this.rootLift;
    // 呼吸與重心
    j.Spine.rotation.z += breathe;
    j.Hips.position.y = this.baseHipsY + this.curHipsY;
    // 走路：雙腿交替、膝蓋彎曲、手臂反向擺動
    if (w > 0.01) {
      // 腳踝在骨盆下方多遠（只看前後擺動）
      const drop = (hip, knee) => this.thigh * Math.cos(hip.rotation.z) + this.shin * Math.cos(hip.rotation.z + knee.rotation.z);
      const before = Math.max(drop(j.HipL, j.KneeL), drop(j.HipR, j.KneeR));
      const c = Math.cos(this.phase);
      j.HipL.rotation.z += s * SWING * w;
      j.HipR.rotation.z -= s * SWING * w;
      // 往前跨的那條腿才彎膝抬腳；踩地的腿幾乎打直
      const kL = (Math.max(0, c) * 0.9 + 0.08) * w;
      const kR = (Math.max(0, -c) * 0.9 + 0.08) * w;
      j.KneeL.rotation.z -= kL;
      j.KneeR.rotation.z -= kR;
      // 腳掌大致保持水平
      j.AnkleL.rotation.z -= (s * SWING * w - kL) * 0.6;
      j.AnkleR.rotation.z -= (-s * SWING * w - kR) * 0.6;
      // 雙腿張開時骨盆要跟著降低，否則兩隻腳都懸空（看起來像飄著走）
      j.Hips.position.y += Math.max(drop(j.HipL, j.KneeL), drop(j.HipR, j.KneeR)) - before;
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
