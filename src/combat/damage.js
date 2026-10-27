import * as THREE from 'three';
import { clamp } from '../core/math.js';

const PLAYER_R = 0.32;

// 我方損傷：敵彈對車廂（穿甲判定）、玩家（血量與預備士兵）、乘員
export class Damage {
  constructor(game, train, crew) {
    this.game = game;
    this.train = train;
    this.crew = crew;
    this.hp = 100;
    this.reserves = 3; // 普通難度
    this.dead = false;
    this.penetrations = 0;
    this.pings = 0;
    this.hurtT = 0;
    this._inv = new THREE.Matrix4();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._c = new THREE.Vector3();
    this.hurtEl = document.getElementById('hurt');
  }

  // 敵彈線段 a→b 與我方的交點（最近者）
  hitTest(a, b) {
    let best = null;
    const ab = this._c.subVectors(b, a);
    const len = ab.length();
    if (len === 0) return null;
    // 車廂外殼（本地座標的長方體）
    for (const car of this.train.cars) {
      this._inv.copy(car.group.matrixWorld).invert();
      const la = this._a.copy(a).applyMatrix4(this._inv);
      const lb = this._b.copy(b).applyMatrix4(this._inv);
      const r = slab(la, lb, -car.len / 2, car.len / 2, 0.3, car.roofY ?? 3.4, -1.6, 1.6);
      if (r && (!best || r.t < best.t)) best = { kind: 'train', target: car, t: r.t, local: la.clone().lerp(lb, r.t), normal: r.normal };
    }
    // 玩家（只有在暴露位置時，車殼不會先擋住）
    const g = this.game;
    if (!this.dead && g.mode === 'walk') {
      const eye = g.camera.position;
      for (const dy of [0, -0.7]) {
        const c = this._a.copy(eye).setY(eye.y + dy);
        const t = segSphere(a, ab, len, c, PLAYER_R);
        if (t != null && (!best || t < best.t)) best = { kind: 'player', t };
      }
    }
    // 暴露位置的乘員（敞頂砲塔、迫砲座）
    for (const m of this.crew.members) {
      if (!m.alive || !m.exposed) continue;
      const c = this.crew.sphere(m, this._a);
      const t = segSphere(a, ab, len, c, 0.45);
      if (t != null && (!best || t < best.t)) best = { kind: 'crew', target: m, t };
    }
    if (best) best.point = a.clone().addScaledVector(ab, best.t);
    return best;
  }

  // 敵彈命中車廂：穿甲判定
  onTrainHit(car, local, normal, proj) {
    const g = this.game;
    const speed = proj.vel.length();
    const dir = proj.vel.clone().normalize();
    const nWorld = normal.clone().transformDirection(car.group.matrixWorld);
    const cos = Math.max(0.15, Math.abs(dir.dot(nWorld)));
    const armor = Math.abs(normal.y) > 0.5 ? 6 : 10;
    const pen = penetration(proj, speed);
    const point = local.clone().applyMatrix4(car.group.matrixWorld);
    if (pen < armor / cos) {
      this.pings++;
      g.effects.spark(point);
      if (Math.random() < 0.5) g.audio.play('ping', point, 0.7);
      // 槍眼、觀察孔附近：小機率打進去傷到機槍手
      for (const mg of car.mgs) {
        if (mg.base.position.distanceTo(local) < 0.8 && Math.random() < 0.3) {
          const op = this.crew.operatorOf(car.stations.find((s) => s.ref === mg)?.obj);
          if (op) this.crew.kill(op);
        }
      }
      return false;
    }
    // 擊穿
    this.penetrations++;
    g.effects.spark(point);
    g.effects.dust(point, 0.4);
    g.audio.play('hit', point, 1.2);
    g.message(`${car.name}被擊穿！`, 'alert');
    this.crew.woundNear(car, local, 2.5, 0.5);
    // 玩家在同一節車附近
    const w = g.player.where();
    if (w && w.car === car && g.player.level === 'in' && Math.hypot(w.x - local.x, g.player.lat - local.z) < 2) {
      this.hurt(25 + Math.random() * 20, '破片');
    }
    return true;
  }

  // 敵砲彈爆炸的破片：暴露位置的玩家與乘員
  splash(point) {
    const g = this.game;
    const exposed = (g.mode === 'walk' && g.player.exposed) || (g.mode === 'station' && g.station?.type === 'mortar');
    if (exposed && !this.dead) {
      const d = g.camera.position.distanceTo(point);
      if (d < 4) this.hurt(60 + Math.random() * 30, '被砲彈破片擊中');
      else if (d < 14 && Math.random() < (14 - d) / 14) this.hurt(20 + Math.random() * 25, '被砲彈破片擊中');
    }
    for (const m of this.crew.members) {
      if (!m.alive || !m.exposed) continue;
      const d = this.crew.sphere(m, this._a).distanceTo(point);
      if (d < 4 || (d < 12 && Math.random() < (12 - d) / 16)) this.crew.kill(m);
    }
  }

  hurt(amount, cause = '中彈') {
    if (this.dead) return;
    this.hp = clamp(this.hp - amount, 0, 100);
    this.hurtT = 1;
    this.game.audio.play('ping', null, 0.6);
    this.game.message(`你${cause}了！（生命 ${Math.round(this.hp)}）`, 'alert');
    this.game.emit('playerHurt', { hp: this.hp });
    if (this.hp <= 0) this.die();
  }

  die() {
    const g = this.game;
    if (this.reserves <= 0) {
      this.dead = true;
      g.message('指揮官陣亡，已無預備士兵可接替。', 'alert');
      g.emit('playerDead', { final: true });
      return;
    }
    this.reserves--;
    this.hp = 100;
    // 預備士兵在指揮車接替指揮
    const p = g.player;
    const cmd = this.train.cars.find((c) => c.kind === 'command');
    p.a = cmd.offset + cmd.len / 2 + 2;
    p.lat = 0.3;
    p.level = 'in';
    p.auto = null;
    if (g.mode !== 'walk') {
      g.station?.exit();
      g.station = null;
      g.mode = 'walk';
    }
    g.message(`指揮官陣亡！預備士兵在指揮車接替指揮（剩餘 ${this.reserves} 名）`, 'alert');
    g.emit('playerDead', { final: false });
  }

  update(dt) {
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.hurtEl) this.hurtEl.style.opacity = (this.hurtT * 0.8 + (this.hp < 40 ? 0.25 : 0)).toFixed(2);
    // 輕傷緩慢恢復到 60
    if (this.hp < 60 && this.hurtT === 0) this.hp = Math.min(60, this.hp + dt * 0.8);
    this.game.player.speedMul = this.hp < 40 ? 0.7 : 1;
  }

  statusHtml() {
    const c = this.hp > 60 ? 'ok' : this.hp > 30 ? 'acc' : 'warn';
    return `<span class="k">生命</span> <span class="${c}">${Math.round(this.hp)}</span>　<span class="k">預備士兵</span> ${this.reserves}`;
  }
}

// 步槍彈穿深（mm）隨速度下降；砲彈用 shell.pen
function penetration(proj, speed) {
  if (proj.shell?.pen) return proj.shell.pen * (speed / proj.shell.v0);
  const mass = proj.shell?.mass ?? 0.01;
  return 9 * (mass / 0.0105) * Math.pow(speed / 760, 1.6);
}

function segSphere(a, ab, len, c, r) {
  const t = clamp(((c.x - a.x) * ab.x + (c.y - a.y) * ab.y + (c.z - a.z) * ab.z) / (len * len), 0, 1);
  const px = a.x + ab.x * t - c.x;
  const py = a.y + ab.y * t - c.y;
  const pz = a.z + ab.z * t - c.z;
  return px * px + py * py + pz * pz <= r * r ? t : null;
}

// 線段與軸對齊盒的交點（回傳參數 t 與進入面的法線）
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
  if (axis < 0) return null; // 起點在盒內
  const normal = new THREE.Vector3();
  normal.setComponent(axis, sign);
  return { t: tmin, normal };
}
