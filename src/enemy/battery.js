import * as THREE from 'three';
import { Soldier } from '../crew/soldier.js';
import { WEAPONS } from '../data/weapons.js';
import { highAngleElevation } from '../weapons/ballistics.js';
import { gaussian } from '../core/math.js';

// 敵迫砲彈：落在車頂可擊穿 6 mm 頂甲
const ENEMY_SHELL = { id: 'EHE', name: '敵迫砲彈', mass: 3.3, v0: 196, form: 1.0, he: true, pen: 25 };
const ENEMY_MORTAR = { id: 'enemyMortar', name: '敵迫砲', short: '敵迫砲', shells: [ENEMY_SHELL] };

// 敵迫砲陣地：躲在稜線後方，逐發試射修正，彈著越來越接近列車。
// 列車移動超過 80 m，敵軍要重新試射。
export class EnemyBattery {
  constructor(scene, terrain, train, templates, game) {
    this.scene = scene;
    this.terrain = terrain;
    this.train = train;
    this.tpl = templates;
    this.game = game;
    this.guns = [];
    this.active = false;
  }

  get destroyed() {
    return this.guns.filter((g) => !g.alive).length;
  }

  get total() {
    return this.guns.length;
  }

  // positions：[{x, z}]；interval：每門砲的射擊間隔（秒）
  spawn(positions, { interval = 16, firstDelay = 4 } = {}) {
    positions.forEach((p, i) => {
      const y = this.terrain.heightAt(p.x, p.z);
      const root = new THREE.Group();
      root.position.set(p.x, y, p.z);
      this.scene.add(root);
      root.add(makeMortarMesh());
      // 偽裝網與彈藥箱
      const net = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 0.25, 10), new THREE.MeshStandardMaterial({ color: 0x4d5233, roughness: 1 }));
      net.position.y = 0.12;
      root.add(net);
      const crew = [];
      for (const [dx, dz, pose] of [[-1.2, 0.6, 'crouchAim'], [0.9, -0.8, 'stand'], [-0.3, 1.4, 'prone']]) {
        const s = new Soldier(this.tpl.npc_enemy, { pose, variant: 'enemy' });
        s.root.position.set(p.x + dx, y, p.z + dz);
        s.baseY = y;
        this.scene.add(s.root);
        crew.push(s);
      }
      this.guns.push({
        pos: new THREE.Vector3(p.x, y + 0.9, p.z),
        root,
        crew,
        alive: true,
        t: firstDelay + i * (interval / 2),
        interval,
        err: null,
      });
    });
    this.aimRef = null;
    this.active = true;
  }

  update(dt) {
    if (!this.active) return;
    const c = this.train.cars[4].group.position;
    // 列車移動後重新試射
    if (!this.aimRef || this.aimRef.distanceTo(c) > 80) {
      if (this.aimRef) this.game.emit('batteryLost', {});
      this.aimRef = c.clone();
      for (const g of this.guns) g.err = null;
    }
    for (const g of this.guns) {
      for (const s of g.crew) s.update(dt, 0);
      if (!g.alive) continue;
      g.t -= dt;
      if (g.t <= 0) {
        g.t = g.interval * (0.85 + Math.random() * 0.3);
        this.fire(g);
      }
    }
  }

  fire(g) {
    // 試射誤差：第一發約 ±160 m，之後每發縮小（觀測修正）
    if (!g.err) g.err = { x: gaussian() * 160, z: gaussian() * 160 };
    else {
      g.err.x = g.err.x * 0.7 + gaussian() * 18;
      g.err.z = g.err.z * 0.7 + gaussian() * 18;
    }
    const car = this.train.cars[Math.floor(Math.random() * this.train.cars.length)];
    const aim = car.group.position.clone();
    aim.x += g.err.x;
    aim.z += g.err.z;
    const dx = aim.x - g.pos.x;
    const dz = aim.z - g.pos.z;
    const dist = Math.hypot(dx, dz);
    const w = WEAPONS.type97;
    const e = highAngleElevation(dist, ENEMY_SHELL.v0, w.C, { dt: 0.02 }, w.elevMax);
    if (e == null) return;
    const vel = new THREE.Vector3((dx / dist) * Math.cos(e), Math.sin(e), (dz / dist) * Math.cos(e)).multiplyScalar(ENEMY_SHELL.v0);
    const muzzle = g.pos.clone().setY(g.pos.y + 0.6);
    this.game.projectiles.spawn({ pos: muzzle, vel, k: w.C, kind: 'shell', shell: ENEMY_SHELL, weapon: ENEMY_MORTAR, side: 'enemy', source: g });
    // 發射煙：從稜線後冒出，可用觀測鏡看見
    this.game.effects.muzzleFlash(muzzle, vel.clone().normalize(), 1.0);
    this.game.effects.dust(muzzle.clone().setY(muzzle.y + 1), 1.2);
    this.game.audio.play('cannon', muzzle, 0.6, 1.35);
    this.game.emit('enemyMortarFire', { gun: g });
  }

  // 我方砲彈落地：判定是否擊毀敵迫砲
  applyImpact(point, proj) {
    if (proj.kind !== 'shell') return [];
    const he = proj.shell.he;
    // 砲位連同砲組、彈藥一起計算：近彈也能使砲失去作用
    const lethal = he ? 8 : 1.5;
    const reach = he ? 16 : 3;
    const out = [];
    for (const g of this.guns) {
      if (!g.alive) continue;
      const d = Math.hypot(point.x - g.pos.x, point.z - g.pos.z);
      const p = d < lethal ? 1 : d < reach ? 0.5 * (1 - (d - lethal) / (reach - lethal)) : 0;
      if (p > 0 && Math.random() < p) {
        g.alive = false;
        for (const s of g.crew) s.setPose('dead');
        g.root.rotation.z = 0.6;
        this.game.effects.smokeColumn(g.pos.clone(), 90, 0.8);
        out.push(g);
        this.game.emit('batteryGunDestroyed', { gun: g });
      }
    }
    return out;
  }
}

function makeMortarMesh() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x3e3f38, roughness: 0.6, metalness: 0.6 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.6), steel);
  plate.position.y = 0.28;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.25, 10), steel);
  tube.position.set(0.3, 0.85, 0);
  tube.rotation.z = -0.5;
  g.add(plate, tube);
  return g;
}
