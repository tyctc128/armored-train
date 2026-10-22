import * as THREE from 'three';
import { FLOOR_Y } from '../train/carModels.js';
import { BLOCKED, EXPOSED } from '../train/train.js';
import { clamp } from '../core/math.js';

const EYE_IN = 1.62;
const EYE_ROOF = 1.66;

// 3D 角色：位置以列車座標表示（a = 距車頭的距離、lat = 橫向、level = 車內／車頂）
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

    const mz = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const mx = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const run = input.down('ShiftLeft') || input.down('ShiftRight');
    // 車內走道約 3 m/s；車頂、車外約 5 m/s
    const speed = this.level === 'roof' ? (run ? 5 : 2.6) : run ? 3 : 1.8;
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
    const { car, pos } = this.eyeLocal(this._v);
    camera.position.copy(pos).applyMatrix4(car.group.matrixWorld);
    car.group.getWorldQuaternion(this._q);
    this._e.set(this.pitch, this.yaw - Math.PI / 2, 0, 'YXZ');
    camera.quaternion.copy(this._q).multiply(new THREE.Quaternion().setFromEuler(this._e));
    camera.fov = 70;
  }
}
