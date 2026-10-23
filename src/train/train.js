import * as THREE from 'three';
import { buildConsist, DOOR_HALF } from './carModels.js';
import { clamp } from '../core/math.js';

export const GAP = 1.0;
export const NOTCHES = [
  { name: '後退', v: -10 / 3.6 },
  { name: '停止', v: 0 },
  { name: '微速', v: 10 / 3.6 },
  { name: '半速', v: 30 / 3.6 },
  { name: '全速', v: 60 / 3.6 },
];
const ORDER_DELAY = 2.0;
const BRAKE = 0.5;
const EMERGENCY = 0.8;   // 緊急煞車
const SIGHT = 150;       // 司機看得到斷軌的距離
const UP = new THREE.Vector3(0, 1, 0);

// 走動判定結果：0 不可通行、1 車內（有掩護）、2 暴露位置
export const BLOCKED = 0;
export const SHELTERED = 1;
export const EXPOSED = 2;

export class Train {
  constructor(scene, track, mats, hooks, models) {
    this.track = track;
    this.hooks = hooks;
    this.cars = buildConsist(mats, models);
    let o = 0;
    for (const car of this.cars) {
      car.offset = o;
      o += car.len + GAP;
      scene.add(car.group);
    }
    this.totalLength = o - GAP;
    this.sFront = this.totalLength + 120;
    this.speed = 0;
    this.ordered = 1;
    this.acknowledged = 1;
    this.pending = null;
    this.distance = 0;
    this.endWarned = false;
    this.blockS = null;     // 前方斷軌位置（弧長）；null 表示路線暢通
    this.derailed = false;

    this._p1 = new THREE.Vector3();
    this._p2 = new THREE.Vector3();
    this._f = new THREE.Vector3();
    this._r = new THREE.Vector3();
    this._u = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._sway = new THREE.Quaternion();
    this._e = new THREE.Euler();
  }

  // 指揮車傳令鐘：命令經約 2 秒傳到司機
  order(index) {
    const i = clamp(index, 0, NOTCHES.length - 1);
    if (i === this.ordered) return;
    this.ordered = i;
    this.pending = { notch: i, t: ORDER_DELAY };
    this.hooks.message(`傳令鐘：${NOTCHES[i].name}`);
    this.hooks.bell();
  }

  update(dt) {
    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) {
        this.acknowledged = this.pending.notch;
        this.pending = null;
        this.hooks.message(`司機：「${NOTCHES[this.acknowledged].name}，了解。」`, 'radio');
        this.hooks.bell(true);
      }
    }
    if (this.derailed) {
      this.speed = 0;
      return;
    }
    let target = NOTCHES[this.acknowledged].v;

    // 路線終點保護（前方有敵列車時以 limitS 為界）：司機自行減速
    const limited = this.limitS != null && this.limitS < this.track.length - 20;
    const frontRoom = (limited ? this.limitS : this.track.length - 20) - this.sFront;
    const rearRoom = this.sFront - this.totalLength - 20;
    const stopDist = (this.speed * this.speed) / (2 * BRAKE) + 4;
    let protecting = false;
    if (this.speed >= 0 && target > 0 && frontRoom < stopDist) protecting = true;
    if (this.speed <= 0 && target < 0 && rearRoom < stopDist) protecting = true;
    if (protecting) {
      target = 0;
      if (!this.endWarned) {
        this.hooks.message(limited ? '司機：「前方有敵列車，不能再靠近了！」' : '司機：「前方路線終點，減速停車！」', 'alert');
        this.endWarned = true;
      }
    } else if (Math.abs(this.speed) < 0.05) {
      this.endWarned = false;
    }

    // 斷軌：司機在 150 m 內才看得到，看到後緊急煞車停在斷口前；太快就來不及
    let emergency = false;
    if (this.blockS != null && this.speed >= 0) {
      const room = this.blockS - 12 - this.sFront;
      if (room < SIGHT && (target > 0 || this.speed > 0.05)) {
        if (target > 0 && room < (this.speed * this.speed) / (2 * EMERGENCY) + 3) {
          target = 0;
          emergency = this.speed > 0.05;
          if (!this.blockWarned) {
            this.hooks.message('司機：「前方鐵軌斷裂！緊急煞車！」', 'alert');
            this.blockWarned = true;
          }
        }
      }
    }

    const traction = 0.32 * (1 - (0.6 * Math.abs(this.speed)) / 16.7);
    const braking = this.speed !== 0 && Math.sign(target - this.speed) !== Math.sign(this.speed);
    const a = braking ? (emergency ? EMERGENCY : BRAKE) : traction;
    this.speed += clamp(target - this.speed, -a * dt, a * dt);
    this.sFront += this.speed * dt;
    const min = this.totalLength + 2;
    const max = Math.min(this.track.length - 2, this.limitS ?? Infinity);
    if (this.sFront < min || this.sFront > max) {
      this.sFront = clamp(this.sFront, min, max);
      this.speed = 0;
    }
    this.distance += this.speed * dt;
    // 因斷軌停車後，司機把傳令鐘回到「停止」等候命令（修好後不會自己開走）
    if (this.blockWarned && !this.blockHeld && Math.abs(this.speed) < 0.05) {
      this.blockHeld = true;
      this.ordered = this.acknowledged = 1;
      this.pending = null;
      this.hooks.message('司機：「已在斷口前停車，等候命令。」', 'radio');
    }
    if (this.blockS != null && this.sFront > this.blockS) {
      this.derailed = true;
      this.speed = 0;
      this.hooks.derail?.();
    }
  }

  // 前方鐵軌被炸斷（s 為弧長）；null 表示修復完成
  setBlock(s) {
    this.blockS = s;
    this.blockWarned = false;
    this.blockHeld = false;
  }

  updateTransforms(time) {
    const k = clamp(Math.abs(this.speed) / 16.7, 0, 1);
    this.cars.forEach((car, i) => {
      this.track.sample(this.sFront - (car.offset + car.len * 0.2), this._p1);
      this.track.sample(this.sFront - (car.offset + car.len * 0.8), this._p2);
      this._f.subVectors(this._p1, this._p2).normalize();
      this._r.crossVectors(this._f, UP).normalize();
      this._u.crossVectors(this._r, this._f);
      this._m.makeBasis(this._f, this._u, this._r);
      this._q.setFromRotationMatrix(this._m);
      // 行進晃動：側傾與縱搖
      const roll = k * (0.004 * Math.sin(time * 1.7 + i * 0.9) + 0.0018 * Math.sin(time * 5.3 + i * 2.1));
      const pitch = k * 0.0012 * Math.sin(time * 3.1 + i * 1.3);
      this._sway.setFromEuler(this._e.set(roll, 0, pitch));
      car.group.quaternion.copy(this._q).multiply(this._sway);
      car.group.position.addVectors(this._p1, this._p2).multiplyScalar(0.5);
      car.group.position.y += k * 0.012 * Math.sin(time * 7.3 + i);
      for (const w of car.wheels) w.mesh.rotation.z = -this.distance / w.r;
      car.group.updateMatrixWorld(true);
    });
  }

  // 依「距車頭的距離 a」找車廂；在車廂之間則回傳較近的一節並標記 gap
  carAt(a) {
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      if (a <= car.offset + car.len + GAP / 2 || i === this.cars.length - 1) {
        const x = car.offset + car.len / 2 - a;
        const inGap = a < car.offset || a > car.offset + car.len;
        return { car, index: i, x, inGap };
      }
    }
    return null;
  }

  walkable(a, lat, level) {
    if (a < 0 || a > this.totalLength) return BLOCKED;
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      if (a >= car.offset && a <= car.offset + car.len) {
        return carWalkable(car, car.offset + car.len / 2 - a, lat, level);
      }
      const next = this.cars[i + 1];
      if (next && a > car.offset + car.len && a < next.offset) {
        if (level === 'in') return Math.abs(lat) <= DOOR_HALF ? EXPOSED : BLOCKED;
        return car.roofWalk && next.roofWalk && Math.abs(lat) <= 0.8 ? EXPOSED : BLOCKED;
      }
    }
    return BLOCKED;
  }

  // 射線是否會打到自己的車廂（exclude 為開火的車廂）
  rayBlocked(origin, dir, exclude, maxT = 300) {
    const inv = new THREE.Matrix4();
    const ray = new THREE.Ray();
    const box = new THREE.Box3();
    const hit = new THREE.Vector3();
    for (const car of this.cars) {
      if (car === exclude) continue;
      inv.copy(car.group.matrixWorld).invert();
      ray.origin.copy(origin).applyMatrix4(inv);
      ray.direction.copy(dir).transformDirection(inv);
      box.min.set(-car.len / 2 - 0.3, 0.2, -1.75);
      box.max.set(car.len / 2 + 0.3, car.topY, 1.75);
      if (ray.intersectBox(box, hit) && hit.distanceTo(ray.origin) < maxT) return car;
    }
    return null;
  }

  velocity(out) {
    const p = this._p1;
    this.track.sample(this.sFront - this.totalLength / 2, p, out);
    return out.multiplyScalar(this.speed);
  }

  kmPost() {
    return (this.sFront / 1000).toFixed(2);
  }
}

function carWalkable(car, x, lat, level) {
  const L2 = car.len / 2;
  const al = Math.abs(lat);
  if (level === 'in') {
    if (car.loco) {
      // 機關車：前平台 → 右側腳踏板 → 後平台
      if (x > L2 - 0.2 || x < -L2 + 0.2) return al <= DOOR_HALF ? EXPOSED : BLOCKED;
      if (x > L2 - 1.2 || x < -L2 + 1.15) return al <= 1.75 ? EXPOSED : BLOCKED;
      return lat >= 1.45 && lat <= 1.8 ? EXPOSED : BLOCKED;
    }
    if (x > L2 - 0.2) return car.closedFront ? BLOCKED : al <= DOOR_HALF ? SHELTERED : BLOCKED;
    if (x < -L2 + 0.25) return car.closedRear ? BLOCKED : al <= DOOR_HALF ? SHELTERED : BLOCKED;
    if (car.pitX != null && Math.abs(x - car.pitX) < 0.15) return al <= DOOR_HALF ? SHELTERED : BLOCKED;
    if (al > car.innerHalf - 0.3) return BLOCKED;
    return car.pitX != null && x < car.pitX ? EXPOSED : SHELTERED;
  }
  if (!car.roofWalk) return BLOCKED;
  const [r0, r1] = car.roofRange;
  if (x < r0 + (r0 > -L2 ? 0.15 : 0) || x > r1) return BLOCKED;
  if (al > car.roofHalf - 0.2) return BLOCKED;
  for (const o of car.obstacles) {
    if (Math.hypot(x - o.x, lat - o.z) < o.r + 0.25) return BLOCKED;
  }
  return EXPOSED;
}
