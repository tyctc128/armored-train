import * as THREE from 'three';
import { GAUGE_HALF } from './track.js';

const REPAIR_TIME = 24; // 一人搶修所需秒數
const UP = new THREE.Vector3(0, 1, 0);

// 斷軌：工兵炸斷的鐵軌。炸開後有彈坑、土堆與扭曲的鋼軌，玩家下車按住 E 修復。
export class RailBreak {
  constructor(scene, track, game) {
    this.scene = scene;
    this.track = track;
    this.game = game;
    this.state = 'none'; // none → broken → fixed
    this.progress = 0;
    this.pos = new THREE.Vector3();
    this.group = null;
  }

  get broken() {
    return this.state === 'broken';
  }

  // 在弧長 s 處引爆
  blow(s) {
    const g = this.game;
    this.s = s;
    this.state = 'broken';
    this.progress = 0;
    const t = new THREE.Vector3();
    this.track.sample(s, this.pos, t);
    const r = new THREE.Vector3().crossVectors(t, UP).normalize();
    this.basis = { t, r };
    g.effects.explosion(this.pos, 1.4);
    g.audio.play('explosion', this.pos, 1.5);
    g.effects.crater(this.pos.clone().setY(this.pos.y - 0.3), UP, 3.6);
    g.effects.smokeColumn(this.pos.clone().setY(this.pos.y + 0.5), 50, 0.6);
    this.build();
  }

  build() {
    const { t, r } = this.basis;
    const yaw = Math.atan2(-t.z, t.x);
    const group = new THREE.Group();
    const at = (along, lat, y) => this.pos.clone().addScaledVector(t, along).addScaledVector(r, lat).setY(this.pos.y + y);
    const dirt = new THREE.MeshStandardMaterial({ color: 0x5a4c3a, roughness: 1 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x4a443e, roughness: 0.5, metalness: 0.8 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x3b2e22, roughness: 0.95 });

    // 炸開的土堆蓋住斷口
    const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), dirt);
    mound.scale.set(2.4, 0.45, 1.9);
    mound.position.copy(at(0, 0, -0.32));
    mound.rotation.y = yaw;
    group.add(mound);

    // 扭曲翹起的鋼軌
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 0.08), steel);
        rail.position.copy(at(end * 1.9, side * GAUGE_HALF + side * 0.25 * Math.random(), 0.15));
        rail.rotation.set(0, yaw + side * end * 0.25, end * -0.35 + (Math.random() - 0.5) * 0.2, 'YXZ');
        rail.castShadow = true;
        group.add(rail);
      }
    }
    // 散落的枕木
    for (let i = 0; i < 5; i++) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 2.4), wood);
      tie.position.copy(at((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 7, -0.2));
      tie.rotation.set((Math.random() - 0.5) * 0.4, yaw + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 0.4);
      tie.castShadow = true;
      group.add(tie);
    }
    // 標示竿（紅旗）：方便從遠處找到斷軌處
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), wood);
    pole.position.copy(at(-3.2, 2.2, 0.8));
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshStandardMaterial({ color: 0xc8301e, side: THREE.DoubleSide }));
    flag.position.copy(at(-3.2, 2.2, 1.7)).addScaledVector(t, 0.3);
    flag.rotation.y = yaw;
    group.add(pole, flag);
    this.scene.add(group);
    this.group = group;
  }

  // 玩家是否在可以施工的位置
  near(x, z) {
    return this.broken && Math.hypot(x - this.pos.x, z - this.pos.z) < 3.2;
  }

  // 施工：rate 為效率（受傷時較慢）；回傳是否剛好完成
  work(dt, rate = 1) {
    if (!this.broken) return false;
    const before = this.progress;
    this.progress = Math.min(1, this.progress + (dt / REPAIR_TIME) * rate);
    // 敲擊聲：每完成 4% 一聲
    if (Math.floor(before * 25) !== Math.floor(this.progress * 25)) this.game.audio.play('clank', this.pos, 0.9);
    if (this.progress >= 1) {
      this.fix();
      return true;
    }
    return false;
  }

  fix() {
    this.state = 'fixed';
    if (this.group) this.scene.remove(this.group);
    // 換上的新鋼軌與枕木
    const { t, r } = this.basis;
    const yaw = Math.atan2(-t.z, t.x);
    const group = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x8d8780, roughness: 0.3, metalness: 0.9 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a5238, roughness: 0.9 });
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(5, 0.17, 0.085), steel);
      rail.position.copy(this.pos).addScaledVector(r, side * GAUGE_HALF).setY(this.pos.y - 0.085);
      rail.rotation.y = yaw;
      group.add(rail);
    }
    for (let i = -3; i <= 3; i++) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 2.6), wood);
      tie.position.copy(this.pos).addScaledVector(t, i * 0.65).setY(this.pos.y - 0.25);
      tie.rotation.y = yaw;
      group.add(tie);
    }
    this.scene.add(group);
    this.group = group;
  }
}
