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
    if (this.auto) {
      if (mx || mz) this.cancelAuto('已取消自動移動');
      else return this.autoWalk(dt);
    }
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
    return w.x < L2 - 1.2 && w.x > -L2 + 1.15 ? 1.62 : 0;
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
    const { car, pos } = this.eyeLocal(this._v);
    camera.position.copy(pos).applyMatrix4(car.group.matrixWorld);
    car.group.getWorldQuaternion(this._q);
    this._e.set(this.pitch, this.yaw - Math.PI / 2, 0, 'YXZ');
    camera.quaternion.copy(this._q).multiply(new THREE.Quaternion().setFromEuler(this._e));
    camera.fov = 70;
  }
}
