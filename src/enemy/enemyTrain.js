import * as THREE from 'three';
import { buildConsist } from '../train/carModels.js';
import { GAP } from '../train/train.js';
import { WEAPONS } from '../data/weapons.js';
import { lookupElevation } from '../weapons/firingTable.js';
import { clamp, gaussian, fromMil, wrapAngle } from '../core/math.js';

const UP = new THREE.Vector3(0, 1, 0);
// 敵砲彈：與我方十糎砲同級；尖鋭弾可擊穿我方 10 mm 側甲，榴弾只有破片
const ENEMY_GUN = { id: 'enemyGun', name: '敵十糎砲', short: '敵砲' };
const SHELLS = {
  AP: { id: 'AP', name: '敵尖鋭弾', v0: 700, form: 1.0, he: false, pen: 80 },
  HE: { id: 'HE', name: '敵榴弾', v0: 700, form: 1.07, he: true, pen: 8 },
};
// 各車裝甲（mm）與耐久
const ARMOR = { side: 20, roof: 12 };
const CAR_HP = { gunA: 80, gunB: 80, command: 80, loco: 120 };
const ROLE = { gunA: '前砲車', command: '指揮車', loco: '機關車', gunB: '後砲車' };

// 敵方裝甲列車：同一條鐵道上由東向西駛來，停在對峙距離與我方砲戰。
// 位置以 s（最西端車頭的弧長）表示，車頭朝西。
export class EnemyTrain {
  constructor(scene, track, mats, models, game) {
    this.scene = scene;
    this.track = track;
    this.mats = mats;
    this.models = models;
    this.game = game;
    this.cars = [];
    this.active = false;
    this._p1 = new THREE.Vector3();
    this._p2 = new THREE.Vector3();
    this._f = new THREE.Vector3();
    this._r = new THREE.Vector3();
    this._u = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._inv = new THREE.Matrix4();
  }

  get guns() {
    return this.cars.filter((c) => c.gun);
  }

  get gunsDestroyed() {
    return this.guns.filter((c) => c.hp <= 0).length;
  }

  get carsDestroyed() {
    return this.cars.filter((c) => c.hp <= 0).length;
  }

  // 失去戰鬥力：兩節砲車都被毀，或任意 3 節被毀
  get beaten() {
    return this.state === 'beaten';
  }

  spawn({ s, standoff = 1700, speed = 15 / 3.6 }) {
    const all = buildConsist(this.mats, this.models);
    const pick = ['gunA', 'command', 'loco', 'gunB'];
    let o = 0;
    for (const kind of pick) {
      const car = all.find((c) => c.kind === kind);
      tint(car.group);
      car.offset = o;
      o += car.len + GAP;
      car.hp = car.maxHp = CAR_HP[kind];
      car.role = ROLE[kind];
      car.enemy = true;
      if (car.gun) {
        car.gun.ai = { t: 6 + Math.random() * 6, err: null, aimRef: null, yaw: 0 };
      }
      this.scene.add(car.group);
      this.cars.push(car);
    }
    this.totalLength = o - GAP;
    this.s = Math.min(s, this.track.length - this.totalLength - 3);
    this.speed = speed;
    this.standoff = standoff;
    this.state = 'advance';
    this.active = true;
    this.updateTransforms();
  }

  update(dt) {
    if (!this.active) return;
    const g = this.game;
    const our = g.train;
    const gap = this.s - our.sFront;
    const loco = this.cars.find((c) => c.loco);
    if (loco.hp <= 0) this.state = this.state === 'advance' ? 'hold' : this.state;
    if (this.state === 'advance') {
      if (gap > this.standoff) this.s -= this.speed * dt;
      else {
        this.state = 'hold';
        g.emit('enemyTrainHalt', {});
      }
    }
    // 我方司機不能撞上敵車
    our.limitS = this.s - 40;
    this.updateTransforms();
    if (this.state === 'beaten') return;
    for (const car of this.guns) {
      if (car.hp <= 0) continue;
      this.updateGun(car, dt, gap);
    }
  }

  updateTransforms() {
    for (const car of this.cars) {
      const a = this.s + car.offset;
      this.track.sample(a + car.len * 0.2, this._p1);
      this.track.sample(a + car.len * 0.8, this._p2);
      // 車頭朝西（弧長減少的方向）
      this._f.subVectors(this._p1, this._p2).normalize();
      this._r.crossVectors(this._f, UP).normalize();
      this._u.crossVectors(this._r, this._f);
      this._m.makeBasis(this._f, this._u, this._r);
      car.group.quaternion.setFromRotationMatrix(this._m);
      car.group.position.addVectors(this._p1, this._p2).multiplyScalar(0.5);
      car.group.updateMatrixWorld(true);
    }
  }

  // 敵砲：轉向我方列車、逐發修正（指揮車被毀後修正變慢）
  updateGun(car, dt, gap) {
    const g = this.game;
    const gun = car.gun;
    const ai = gun.ai;
    const our = g.train;
    const ref = our.cars[4].group.position;
    if (!ai.aimRef || ai.aimRef.distanceTo(ref) > 50) {
      ai.aimRef = ref.clone();
      ai.err = null;
    }
    if (!ai.target || ai.retarget-- <= 0) {
      ai.target = our.cars[Math.floor(Math.random() * our.cars.length)];
      ai.retarget = 3;
    }
    const aim = ai.target.group.position.clone();
    aim.y += 2;
    const muzzleBase = gun.elev.getWorldPosition(new THREE.Vector3());
    const to = aim.clone().sub(muzzleBase);
    const horiz = Math.hypot(to.x, to.z);
    // 轉塔
    const inv = gun.turret.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    const local = to.clone().applyQuaternion(inv);
    const wantYaw = Math.atan2(-local.z, local.x);
    const w = WEAPONS.type14;
    const dy = wrapAngle(wantYaw - ai.yaw);
    ai.yaw = wrapAngle(ai.yaw + clamp(dy, -w.traverseRate * dt, w.traverseRate * dt));
    gun.turret.rotation.y = ai.yaw;
    const shellId = Math.random() < 0.5 ? 'AP' : 'HE';
    const errAlong = ai.err?.along ?? 0;
    const qe = Math.atan2(to.y, horiz) + fromMil(lookupElevation(w.tables[shellId], Math.max(50, horiz + errAlong)));
    gun.elev.rotation.z = gun.elev.rotation.z + clamp(qe - gun.elev.rotation.z, -w.elevRate * dt, w.elevRate * dt);
    ai.t -= dt;
    if (ai.t > 0 || Math.abs(dy) > 1.5 * Math.PI / 180 || gap > 4000) return;
    const commandAlive = this.cars.find((c) => c.kind === 'command').hp > 0;
    ai.t = (commandAlive ? 20 : 26) + Math.random() * 4;
    // 試射修正：距離誤差初始約 ±150 m，每發縮小；每發另有約 ±60 m 的散布（打不中是常態）
    const shrink = commandAlive ? 0.65 : 0.85;
    if (!ai.err) ai.err = { along: gaussian() * 150, lat: gaussian() * 6 };
    else ai.err = { along: ai.err.along * shrink, lat: ai.err.lat * shrink };
    const moving = this.state === 'advance';
    const shot = { along: ai.err.along + gaussian() * (moving ? 120 : 60), lat: ai.err.lat + gaussian() * (moving ? 6 : 2.5) };
    this.fire(car, shellId, aim, shot);
  }

  fire(car, shellId, aim, err) {
    const g = this.game;
    const gun = car.gun;
    const w = WEAPONS.type14;
    const shell = SHELLS[shellId];
    const muzzle = gun.muzzle.getWorldPosition(new THREE.Vector3());
    const to = aim.clone().sub(muzzle);
    const horiz = Math.hypot(to.x, to.z);
    const dirH = new THREE.Vector3(to.x / horiz, 0, to.z / horiz);
    const range = Math.max(50, horiz + err.along);
    const elev = Math.atan2(to.y, horiz) + fromMil(lookupElevation(w.tables[shellId], range));
    const yawOff = Math.atan2(err.lat, horiz);
    const d = dirH.clone().applyAxisAngle(UP, -yawOff);
    const vel = d.multiplyScalar(Math.cos(elev)).addScaledVector(UP, Math.sin(elev)).normalize().multiplyScalar(shell.v0);
    g.projectiles.spawn({ pos: muzzle, vel, k: w.C * shell.form, kind: 'shell', shell, weapon: ENEMY_GUN, side: 'enemy', source: car });
    g.effects.muzzleFlash(muzzle, vel.clone().normalize(), 2.2);
    g.audio.play('cannon', muzzle, 1);
    g.emit('enemyTrainFire', { car });
  }

  // ── 我方彈命中 ──
  segmentHit(a, b) {
    let best = null;
    for (const car of this.cars) {
      this._inv.copy(car.group.matrixWorld).invert();
      const la = a.clone().applyMatrix4(this._inv);
      const lb = b.clone().applyMatrix4(this._inv);
      const r = slab(la, lb, -car.len / 2, car.len / 2, 0.3, car.roofY ?? 3.4, -1.6, 1.6);
      if (r && (!best || r.t < best.t)) best = { car, t: r.t, local: la.clone().lerp(lb, r.t), normal: r.normal };
    }
    if (best) best.point = a.clone().lerp(b, best.t);
    return best;
  }

  raycast(origin, dir, maxDist) {
    const b = origin.clone().addScaledVector(dir, maxDist);
    const h = this.segmentHit(origin, b);
    return h ? { dist: h.t * maxDist, target: h.car } : null;
  }

  isNear(point, r = 40) {
    return this.active && this.cars.some((c) => c.group.position.distanceTo(point) < c.len / 2 + r);
  }

  // 穿甲：尖鋭弾以初速比例估算穿深；榴弾只造成外部損傷
  applyHit(car, local, normal, proj) {
    const g = this.game;
    if (car.hp <= 0) return { pen: false, dmg: 0 };
    const speed = proj.vel.length();
    const dir = proj.vel.clone().normalize();
    const nWorld = normal.clone().transformDirection(car.group.matrixWorld);
    const cos = Math.max(0.2, Math.abs(dir.dot(nWorld)));
    const armor = (Math.abs(normal.y) > 0.5 ? ARMOR.roof : ARMOR.side) / cos;
    const he = proj.shell.he;
    const penMm = he ? 15 : (proj.shell.penMm ?? 120) * (speed / proj.shell.v0);
    const pen = penMm > armor;
    const dmg = pen ? 45 + Math.random() * 20 : he ? 10 + Math.random() * 8 : 4;
    car.hp = Math.max(0, car.hp - dmg);
    const point = local.clone().applyMatrix4(car.group.matrixWorld);
    if (pen) g.effects.dust(point, 0.5);
    else g.effects.spark(point);
    if (car.hp <= 0) this.destroyCar(car);
    return { pen, dmg };
  }

  destroyCar(car) {
    const g = this.game;
    const p = car.group.position.clone();
    p.y += 3;
    g.effects.explosion(p, car.gun ? 1.2 : 0.8);
    g.audio.play('explosion', p, 1.4);
    g.effects.smokeColumn(p, 600, car.loco ? 1.4 : 1);
    if (car.gun) car.gun.elev.rotation.z = -0.05;
    g.emit('enemyCarDestroyed', { car });
    if (this.state !== 'beaten' && (this.gunsDestroyed >= this.guns.length || this.carsDestroyed >= 3)) {
      this.state = 'beaten';
      g.emit('enemyTrainBeaten', {});
    }
  }

  statusText() {
    return this.cars.map((c) => `${c.role}${c.hp <= 0 ? '✕' : `${Math.round((c.hp / c.maxHp) * 100)}%`}`).join('・');
  }
}

// 敵車塗裝：材質複製後調成暗灰褐色，不影響我方車廂
function tint(group) {
  const done = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const tintOne = (m) => {
      if (done.has(m)) return done.get(m);
      const c = m.clone();
      if (c.color) c.color.multiply(new THREE.Color(0.3, 0.3, 0.36));
      done.set(m, c);
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(tintOne) : tintOne(o.material);
  });
}

function slab(a, b, x0, x1, y0, y1, z0, z1) {
  let tmin = 0;
  let tmax = 1;
  let axis = -1;
  let sign = 0;
  const d = [b.x - a.x, b.y - a.y, b.z - a.z];
  const o = [a.x, a.y, a.z];
  const lo = [x0, y0, z0];
  const hi = [x1, y1, z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < lo[i] || o[i] > hi[i]) return null;
      continue;
    }
    let t1 = (lo[i] - o[i]) / d[i];
    let t2 = (hi[i] - o[i]) / d[i];
    let s = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      s = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      axis = i;
      sign = s;
    }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (axis < 0) return null;
  const normal = new THREE.Vector3();
  normal.setComponent(axis, sign);
  return { t: tmin, normal };
}
