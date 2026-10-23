import * as THREE from 'three';
import { FLOOR_Y } from '../train/carModels.js';
import { BLOCKED, EXPOSED } from '../train/train.js';
import { clamp } from '../core/math.js';
import { distToTrack, trackY, TRACK_X0, TRACK_X1 } from '../world/track.js';

const EYE_IN = 1.62;
const EYE_ROOF = 1.66;
const EYE_GROUND = 1.65;

// 3D 角色：位置以列車座標表示（a = 距車頭的距離、lat = 橫向、level = 車內／車頂）
// 下車後（level = 'ground'）改用世界座標 gx、gz，yaw 也改為世界方位
export class Player {
  constructor(train) {
    this.train = train;
    const cmd = train.cars.find((c) => c.kind === 'command');
    this.a = cmd.offset + cmd.len / 2 + 2;
    this.lat = 0.4;
    this.level = 'in';
    this.yaw = 0;
    this.pitch = 0;
    this.bobPhase = 0;
    this.moving = 0;
    this.exposed = false;
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  update(dt, input) {
    const sens = 0.0022;
    this.yaw -= input.mouseDX * sens;
    this.pitch = clamp(this.pitch - input.mouseDY * sens, -1.45, 1.45);
    if (this.level === 'ground') return this.updateGround(dt, input);

    const mz = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const mx = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    if (this.auto) {
      if (mx || mz) this.cancelAuto('已取消自動移動');
      else return this.autoWalk(dt);
    }
    const run = input.down('ShiftLeft') || input.down('ShiftRight');
    // 車內走道約 3 m/s；車頂、車外約 5 m/s
    const speed = (this.level === 'roof' ? (run ? 5 : 2.6) : run ? 3 : 1.8) * (this.speedMul ?? 1);
    let dx = 0;
    let dz = 0;
    if (mx || mz) {
      const fx = Math.cos(this.yaw);
      const fz = -Math.sin(this.yaw);
      const rx = Math.sin(this.yaw);
      const rz = Math.cos(this.yaw);
      dx = fx * mz + rx * mx;
      dz = fz * mz + rz * mx;
      const n = Math.hypot(dx, dz);
      dx = (dx / n) * speed * dt;
      dz = (dz / n) * speed * dt;
    }
    const na = this.a - dx;
    const nl = this.lat + dz;
    const t = this.train;
    let moved = false;
    if (t.walkable(na, nl, this.level) !== BLOCKED) {
      this.a = na;
      this.lat = nl;
      moved = true;
    } else if (t.walkable(na, this.lat, this.level) !== BLOCKED) {
      this.a = na;
      moved = true;
    } else if (t.walkable(this.a, nl, this.level) !== BLOCKED) {
      this.lat = nl;
      moved = true;
    }
    this.moving = moved && (mx || mz) ? speed : 0;
    if (this.moving) this.bobPhase += dt * speed * 2.4;
    this.exposed = t.walkable(this.a, this.lat, this.level) === EXPOSED;
  }

  where() {
    return this.train.carAt(this.a);
  }

  // ── 下車（車外地面）──
  // 車廂連接處的兩側出口：side = -1 左（北）、+1 右（南）
  exitPoint(gapIndex, side, out) {
    const car = this.train.cars[gapIndex];
    return out.set(-car.len / 2 - 0.5, 0, side * 2.3).applyMatrix4(car.group.matrixWorld);
  }

  // 在車廂連接處下車：依面向決定從哪一側下車
  dismount(terrain) {
    const w = this.where();
    if (!w || !w.inGap || this.level !== 'in') return false;
    const gap = w.x > 0 ? w.index - 1 : w.index;
    if (gap < 0 || gap >= this.train.cars.length - 1) return false;
    const car = this.train.cars[gap];
    const f = new THREE.Vector3(1, 0, 0).transformDirection(car.group.matrixWorld);
    const r = new THREE.Vector3(0, 0, 1).transformDirection(car.group.matrixWorld);
    const side = -Math.sin(this.yaw) >= 0 ? 1 : -1;
    const p = this.exitPoint(gap, side, new THREE.Vector3());
    // 面向換成世界方位
    const dir = f.multiplyScalar(Math.cos(this.yaw)).addScaledVector(r, -Math.sin(this.yaw));
    this.yaw = Math.atan2(-dir.z, dir.x);
    this.terrain = terrain;
    this.gx = p.x;
    this.gz = p.z;
    this.level = 'ground';
    this.auto = null;
    this.exposed = true;
    this.syncTrainCoords();
    return true;
  }

  // 附近的上車處（車廂連接處兩側）
  boardingGap() {
    const p = new THREE.Vector3();
    for (let i = 0; i < this.train.cars.length - 1; i++) {
      for (const side of [-1, 1]) {
        this.exitPoint(i, side, p);
        if (Math.hypot(p.x - this.gx, p.z - this.gz) < 1.8) return i;
      }
    }
    return -1;
  }

  board(gap) {
    const car = this.train.cars[gap];
    const f = new THREE.Vector3(1, 0, 0).transformDirection(car.group.matrixWorld);
    const r = new THREE.Vector3(0, 0, 1).transformDirection(car.group.matrixWorld);
    const dx = Math.cos(this.yaw);
    const dz = -Math.sin(this.yaw);
    this.yaw = Math.atan2(-(dx * r.x + dz * r.z), dx * f.x + dz * f.z);
    this.a = car.offset + car.len + 0.5;
    this.lat = 0;
    this.level = 'in';
    this.exposed = this.train.walkable(this.a, this.lat, 'in') === EXPOSED;
  }

  groundY(x, z) {
    return groundHeight(this.terrain, x, z);
  }

  updateGround(dt, input) {
    const mz = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const mx = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const run = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = (run ? 5 : 2.2) * (this.speedMul ?? 1);
    this.moving = 0;
    if (mx || mz) {
      const fx = Math.cos(this.yaw);
      const fz = -Math.sin(this.yaw);
      let dx = fx * mz + Math.sin(this.yaw) * mx;
      let dz = fz * mz + Math.cos(this.yaw) * mx;
      const n = Math.hypot(dx, dz);
      dx = (dx / n) * speed * dt;
      dz = (dz / n) * speed * dt;
      // 不能穿過車廂
      if (!this.hitsTrain(this.gx + dx, this.gz + dz)) {
        this.gx += dx;
        this.gz += dz;
        this.moving = speed;
      } else if (!this.hitsTrain(this.gx + dx, this.gz)) {
        this.gx += dx;
        this.moving = speed;
      } else if (!this.hitsTrain(this.gx, this.gz + dz)) {
        this.gz += dz;
        this.moving = speed;
      }
    }
    if (this.moving) this.bobPhase += dt * speed * 2.4;
    this.exposed = true;
    this.syncTrainCoords();
  }

  hitsTrain(x, z) {
    const p = new THREE.Vector3();
    const inv = new THREE.Matrix4();
    for (const car of this.train.cars) {
      p.set(x, car.group.position.y + 1, z).applyMatrix4(inv.copy(car.group.matrixWorld).invert());
      if (Math.abs(p.x) < car.len / 2 + 0.25 && Math.abs(p.z) < 1.9) return true;
    }
    return false;
  }

  // 列車簡圖用：把地面位置換算成列車座標（距車頭、橫向）
  syncTrainCoords() {
    const p = new THREE.Vector3();
    const inv = new THREE.Matrix4();
    for (const car of this.train.cars) {
      p.set(this.gx, car.group.position.y, this.gz).applyMatrix4(inv.copy(car.group.matrixWorld).invert());
      if (Math.abs(p.x) <= car.len / 2 + 0.6) {
        this.a = car.offset + car.len / 2 - p.x;
        this.lat = clamp(p.z, -3, 3);
        return;
      }
    }
    const front = this.train.cars[0];
    p.set(this.gx, front.group.position.y, this.gz).applyMatrix4(inv.copy(front.group.matrixWorld).invert());
    this.a = p.x > 0 ? 0 : this.train.totalLength;
    this.lat = clamp(p.z, -3, 3);
  }

  groundEye(out) {
    const bob = this.moving ? Math.sin(this.bobPhase) * 0.04 : 0;
    return out.set(this.gx, this.groundY(this.gx, this.gz) + EYE_GROUND + bob, this.gz);
  }

  // ── 自動走到指定車廂（數字鍵 1–8）──
  // 沿車內走道（約 3 m/s）前進，經過機關車時改走右側腳踏板；途中按 WASD 取消。
  startAuto(index, onMessage) {
    const car = this.train.cars[index];
    if (!car) return;
    this.onMessage = onMessage;
    if (this.level === 'roof') {
      onMessage?.('車頂上無法自動移動，請先經艙口回到車內', 'alert');
      return;
    }
    const a = car.offset + car.len / 2;
    this.auto = { index, a, lat: this.preferredLat(a), name: car.name, stuck: 0 };
    onMessage?.(`自動前往：${car.name}（按 WASD 取消）`);
  }

  cancelAuto(text) {
    if (!this.auto) return;
    this.auto = null;
    if (text) this.onMessage?.(text);
  }

  // 走道中線；機關車中段只能走右側腳踏板
  preferredLat(a) {
    const w = this.train.carAt(a);
    if (!w || !w.car.loco || w.inGap) return 0;
    const L2 = w.car.len / 2;
    return w.x < L2 - 0.9 && w.x > -L2 + 1.15 ? 1.62 : 0;
  }

  autoWalk(dt) {
    const t = this.train;
    const g = this.auto;
    const step = 3 * dt;
    const da = g.a - this.a;
    const dir = Math.sign(da);
    const near = Math.abs(da) < 1.5;
    const wantLat = near ? g.lat : this.preferredLat(this.a + dir * 1.2);
    let moved = false;
    const nl = this.lat + clamp(wantLat - this.lat, -step, step);
    if (nl !== this.lat && t.walkable(this.a, nl, 'in') !== BLOCKED) {
      this.lat = nl;
      moved = true;
    }
    if (dir) {
      const na = this.a + dir * Math.min(step, Math.abs(da));
      if (t.walkable(na, this.lat, 'in') !== BLOCKED) {
        this.a = na;
        moved = true;
      }
    }
    // 面向行進方向
    const face = dir > 0 ? Math.PI : dir < 0 ? 0 : this.yaw;
    let dy = face - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += clamp(dy, -4 * dt, 4 * dt);

    this.moving = moved ? 3 : 0;
    if (moved) this.bobPhase += dt * 3 * 2.4;
    this.exposed = t.walkable(this.a, this.lat, 'in') === EXPOSED;
    if (Math.abs(g.a - this.a) < 0.05 && Math.abs(g.lat - this.lat) < 0.05) {
      this.cancelAuto(`已抵達${g.name}`);
      return;
    }
    g.stuck = moved ? 0 : g.stuck + dt;
    if (g.stuck > 0.8) this.cancelAuto('前方無法通行，已停止自動移動');
  }

  // 經艙口上下車頂
  toggleLevel() {
    const target = this.level === 'in' ? 'roof' : 'in';
    if (this.train.walkable(this.a, this.lat, target) === BLOCKED) return false;
    this.level = target;
    return true;
  }

  eyeLocal(out) {
    const w = this.where();
    const bob = this.moving ? Math.sin(this.bobPhase) * 0.035 : 0;
    const y = this.level === 'in' ? FLOOR_Y + EYE_IN : w.car.roofY + EYE_ROOF;
    return { car: w.car, pos: out.set(w.x, y + bob, this.lat) };
  }

  applyCamera(camera) {
    if (this.level === 'ground') {
      this.groundEye(camera.position);
      this._e.set(this.pitch, this.yaw - Math.PI / 2, 0, 'YXZ');
      camera.quaternion.setFromEuler(this._e);
      camera.fov = 70;
      return;
    }
    const { car, pos } = this.eyeLocal(this._v);
    camera.position.copy(pos).applyMatrix4(car.group.matrixWorld);
    car.group.getWorldQuaternion(this._q);
    this._e.set(this.pitch, this.yaw - Math.PI / 2, 0, 'YXZ');
    camera.quaternion.copy(this._q).multiply(new THREE.Quaternion().setFromEuler(this._e));
    camera.fov = 70;
  }
}

// 地面高度：鐵道道碴上較高，其餘依地形
export function groundHeight(terrain, x, z) {
  const h = terrain.heightAt(x, z);
  const d = distToTrack(x, z);
  if (d > 3.2) return h;
  const top = trackY(clamp(x, TRACK_X0, TRACK_X1)) - 0.33;
  if (d < 1.75) return Math.max(h, top);
  return Math.max(h, top + ((d - 1.75) / 1.45) * -0.67);
}
