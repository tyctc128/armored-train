import * as THREE from 'three';
import { WEAPONS } from './data/weapons.js';
import { lookupElevation } from './weapons/firingTable.js';
import { NOTCHES } from './train/train.js';
import { DEG, clamp, wrapAngle, toMil, fromMil, fmtMil, bearingMil, gaussian, MIL_PER_RAD } from './core/math.js';

const X_AXIS = new THREE.Vector3(1, 0, 0);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();

// 以參考物件的世界旋轉，再加上本地俯仰／方向（相機預設朝 -Z，轉成朝 +X）
function viewQuat(ref, pitch, yaw, out) {
  ref.getWorldQuaternion(_q2);
  _e.set(pitch, yaw - Math.PI / 2, 0, 'YXZ');
  return out.copy(_q2).multiply(_q.setFromEuler(_e));
}

function pxPerMil(camera, H) {
  return H / 2 / Math.tan((camera.fov * DEG) / 2) / MIL_PER_RAD;
}

// 鏡筒遮罩：整個畫面塗黑，再挖掉鏡孔（addHoles 畫出各個孔；孔可以互相重疊）
function maskWithHoles(g, W, H, alpha, addHoles) {
  g.save();
  g.fillStyle = `rgba(0,0,0,${alpha})`;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  g.beginPath();
  addHoles(g);
  g.fill();
  g.restore();
}

function scopeMask(g, W, H, r) {
  maskWithHoles(g, W, H, 0.92, (c) => {
    c.moveTo(W / 2 + r, H / 2);
    c.arc(W / 2, H / 2, r, 0, Math.PI * 2);
  });
  g.strokeStyle = 'rgba(0,0,0,0.9)';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(W / 2, H / 2, r, 0, Math.PI * 2);
  g.stroke();
}

// 畫面上方的方位刻度帶：目前方位（密位）與左右刻度
function bearingTape(g, W, camera) {
  const dir = _d.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const b = bearingMil(dir.x, dir.z);
  const ppm = pxPerMil(camera, g.canvas.height);
  const cx = W / 2;
  const half = 200;
  g.save();
  g.fillStyle = 'rgba(18,20,14,0.75)';
  g.fillRect(cx - half, 8, half * 2, 40);
  g.beginPath();
  g.rect(cx - half, 8, half * 2, 40);
  g.clip();
  // 刻度：依畫面比例決定間距（每格至少約 8 px）
  const step = [10, 50, 100, 200, 400].find((m) => m * ppm >= 8) ?? 400;
  const label = step * 4;
  g.strokeStyle = '#c9c3a8';
  g.fillStyle = '#c9c3a8';
  g.font = '11px sans-serif';
  g.textAlign = 'center';
  const first = Math.ceil((b - half / ppm) / step) * step;
  for (let m = first; m <= b + half / ppm; m += step) {
    const x = cx + (m - b) * ppm;
    const big = m % label === 0;
    g.beginPath();
    g.moveTo(x, 48);
    g.lineTo(x, big ? 38 : 43);
    g.stroke();
    if (big) g.fillText(fmtMil(m), x, 34);
  }
  g.restore();
  g.fillStyle = '#e0b25a';
  g.beginPath();
  g.moveTo(cx, 46);
  g.lineTo(cx - 6, 54);
  g.lineTo(cx + 6, 54);
  g.fill();
  g.font = 'bold 15px sans-serif';
  g.textAlign = 'center';
  g.fillStyle = '#e8e3cf';
  g.fillText(`方位 ${fmtMil(b)} 密位`, cx, 24);
}

function shake(camera, amount) {
  if (amount <= 0) return;
  camera.rotateX((Math.random() - 0.5) * amount);
  camera.rotateY((Math.random() - 0.5) * amount);
}

// ─────────────────────────────── 十糎砲 ───────────────────────────────
export class GunStation {
  // gun2：同一崗位連動的第二座砲塔（火砲車丙）：同步轉向、輪流射擊
  constructor(game, car, gun, label, weapon = WEAPONS.type14, gun2 = null) {
    this.type = 'gun';
    this.game = game;
    this.car = car;
    this.gun = gun;
    this.label = label;
    this.w = weapon;
    this.yaw = 0;
    this.elev = 1 * DEG;
    this.drum = 0;
    this.shellIdx = 1;
    this.loaded = null;
    this.reload = 0;
    this.ammo = { ...this.w.stock };
    this.rounds = 0;
    this.zoom = false;
    this.recoilT = 1;
    this.shake = 0;
    this.gun2 = gun2;
    this.recoilT2 = 1;
  }

  get shell() {
    return this.w.shells[this.shellIdx];
  }

  tableShell() {
    const id = this.loaded ?? this.shell.id;
    return this.w.tables[id];
  }

  enter() {}
  exit() {
    this.reload = 0;
  }

  update(dt, input, active) {
    const g = this.game;
    if (active) {
      const w = this.w;
      const sens = this.zoom ? 0.00006 : 0.00016;
      const fine = input.down('ShiftLeft') ? 0.25 : 1;
      let dyaw = -input.mouseDX * sens * 6;
      let delev = -input.mouseDY * sens * 6;
      if (input.down('ArrowLeft')) dyaw += w.traverseRate * dt * fine;
      if (input.down('ArrowRight')) dyaw -= w.traverseRate * dt * fine;
      if (input.down('ArrowUp')) delev += w.elevRate * dt * fine;
      if (input.down('ArrowDown')) delev -= w.elevRate * dt * fine;
      this.yaw = wrapAngle(this.yaw + clamp(dyaw, -w.traverseRate * dt, w.traverseRate * dt));
      this.elev = clamp(this.elev + clamp(delev, -w.elevRate * dt, w.elevRate * dt), w.elevMin, w.elevMax);

      if (input.wheel) this.drum = clamp(this.drum - input.wheel * (input.down('ShiftLeft') ? 10 : 1), 0, 1500);
      if (input.hit('PageUp')) this.drum = clamp(this.drum + 10, 0, 1500);
      if (input.hit('PageDown')) this.drum = clamp(this.drum - 10, 0, 1500);
      // 微調 ±0.1 密位（射表數值有一位小數）
      if (input.hit('Minus') || input.hit('NumpadSubtract')) this.drum = clamp(this.drum - 0.1, 0, 1500);
      if (input.hit('Equal') || input.hit('NumpadAdd')) this.drum = clamp(this.drum + 0.1, 0, 1500);
      this.drum = Math.round(this.drum * 10) / 10;
      for (let i = 0; i < this.w.shells.length; i++) if (input.hit(`Digit${i + 1}`)) this.selectShell(i);
      if (input.hit('BracketLeft')) g.targetBook.cycle(-1);
      if (input.hit('BracketRight')) g.targetBook.cycle(1);

      if (g.settings.assist) {
        const entry = g.targetBook.selected();
        if (entry) this.drum = Math.round(lookupElevation(this.tableShell(), entry.range) * 10) / 10;
      }

      if (!this.loaded && input.down('KeyR')) {
        if (this.ammo[this.shell.id] > 0) {
          if (this.reload === 0) g.audio.play('clank', this.gun.sight.getWorldPosition(_v), 0.8);
          this.reload += dt / w.reloadTime;
          if (this.reload >= 1) {
            this.loaded = this.shell.id;
            g.emit('reloaded', { station: this, shell: this.shell.id });
            this.ammo[this.shell.id]--;
            this.reload = 0;
            g.audio.play('clank', this.gun.sight.getWorldPosition(_v), 1.2);
            g.message(`${this.shell.name}裝填完畢`);
          }
        } else if (input.hit('KeyR')) {
          g.message(`${this.shell.name}已用罄`, 'alert');
        }
      } else if (!input.down('KeyR')) {
        this.reload = 0;
      }

      if (input.btnHit(0)) this.fire();
      if (input.btnHit(2)) {
        this.zoom = !this.zoom;
        this.game.emit('zoom', { station: this, zoom: this.zoom });
      }
    }

    this.recoilT = Math.min(1, this.recoilT + dt / 1.4);
    const recoil = (k) => (k < 0.08 ? -0.9 * (k / 0.08) : -0.9 * (1 - (k - 0.08) / 0.92) ** 2);
    this.gun.recoil.position.x = recoil(this.recoilT);
    this.gun.turret.rotation.y = this.yaw;
    this.gun.elev.rotation.z = this.elev;
    if (this.gun2) {
      this.recoilT2 = Math.min(1, this.recoilT2 + dt / 1.4);
      this.gun2.recoil.position.x = recoil(this.recoilT2) * 0.7;
      this.gun2.turret.rotation.y = this.yaw;
      this.gun2.elev.rotation.z = this.elev;
    }
    this.shake = Math.max(0, this.shake - dt * 0.15);
  }

  selectShell(i) {
    this.shellIdx = i;
    this.game.emit('shellSelect', { station: this, shell: this.shell.id });
    this.game.message(`選用彈種：${this.shell.name}${this.loaded ? '（下一發）' : ''}`);
  }

  fire() {
    const g = this.game;
    if (!this.loaded) {
      g.message('未裝填（按住 R 裝填）', 'alert');
      return;
    }
    const gun = this.firingGun();
    const muzzle = gun.muzzle.getWorldPosition(new THREE.Vector3());
    gun.elev.getWorldQuaternion(_q);
    const dir = X_AXIS.clone().applyQuaternion(_q);
    const blocker = g.train.rayBlocked(muzzle, dir, this.car);
    if (blocker) {
      g.message(`射界受阻：${blocker.name}在射線上`, 'alert');
      return;
    }
    const shell = this.w.shells.find((s) => s.id === this.loaded);
    // 散布
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(_q);
    const side = new THREE.Vector3().crossVectors(dir, up);
    dir.addScaledVector(up, fromMil(gaussian() * this.w.dispersionMil));
    dir.addScaledVector(side, fromMil(gaussian() * this.w.dispersionMil)).normalize();
    const v0 = shell.v0 * (1 - this.w.wearPerRound * this.rounds);
    const vel = dir.clone().multiplyScalar(v0).add(g.train.velocity(_d));
    g.projectiles.spawn({ pos: muzzle, vel, k: this.w.C * shell.form, kind: 'shell', shell, weapon: this.w, source: this });
    g.emit('gunFire', { station: this, shell: shell.id });
    g.effects.muzzleFlash(muzzle, dir, 2.2);
    g.audio.play('cannon', muzzle, 1);
    g.stats.shots++;
    this.rounds++;
    this.loaded = null;
    if (gun === this.gun) this.recoilT = 0;
    else this.recoilT2 = 0;
    this.shake = 0.03;
  }

  // 連動的兩座砲塔輪流射擊；砲口方向會掃過另一座砲塔時改由另一座射擊
  firingGun() {
    if (!this.gun2) return this.gun;
    const want = this.rounds % 2 === 0 ? this.gun : this.gun2;
    const other = want === this.gun ? this.gun2 : this.gun;
    const p = want.turret.getWorldPosition(new THREE.Vector3());
    const q = other.turret.getWorldPosition(new THREE.Vector3());
    want.elev.getWorldQuaternion(_q2);
    const dir = X_AXIS.clone().applyQuaternion(_q2);
    const toOther = q.sub(p);
    const horiz = Math.hypot(toOther.x, toOther.z);
    const cosA = (dir.x * toOther.x + dir.z * toOther.z) / (Math.hypot(dir.x, dir.z) * horiz);
    return cosA > Math.cos(25 * DEG) && dir.y < 0.14 ? other : want;
  }

  applyCamera(camera) {
    this.gun.sight.getWorldPosition(camera.position);
    this.gun.turret.getWorldQuaternion(_q2);
    _e.set(this.elev - fromMil(this.drum), -Math.PI / 2, 0, 'YXZ');
    camera.quaternion.copy(_q2).multiply(_q.setFromEuler(_e));
    camera.fov = this.zoom ? 5 : 13;
    // 瞄準鏡裝在砲塔內：從鏡中看不到自己的砲塔、防盾與砲管（每幀由 main 的 applyCamera 復原）
    this.gun.turret.visible = false;
    shake(camera, this.shake);
  }

  azimuthMil() {
    this.gun.elev.getWorldQuaternion(_q);
    _d.copy(X_AXIS).applyQuaternion(_q);
    return bearingMil(_d.x, _d.z);
  }

  drawOverlay(g, W, H, camera) {
    const r = Math.min(W, H) * 0.46;
    scopeMask(g, W, H, r);
    const cx = W / 2;
    const cy = H / 2;
    const ppm = pxPerMil(camera, H);
    g.strokeStyle = 'rgba(15,15,10,0.95)';
    g.fillStyle = 'rgba(15,15,10,0.95)';
    g.lineWidth = 1.5;
    g.font = '12px sans-serif';
    g.textAlign = 'center';
    // 主十字與分劃（每 5 密位一小刻、10 密位一大刻）
    g.beginPath();
    g.moveTo(cx - r, cy);
    g.lineTo(cx - 6, cy);
    g.moveTo(cx + 6, cy);
    g.lineTo(cx + r, cy);
    g.moveTo(cx, cy + 6);
    g.lineTo(cx, cy + r);
    g.stroke();
    for (let m = 5; m * ppm < r; m += 5) {
      const big = m % 10 === 0;
      const len = big ? 10 : 5;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx + s * m * ppm, cy - len);
        g.lineTo(cx + s * m * ppm, cy);
        g.stroke();
        if (big && m % 20 === 0 && m * ppm > 22) g.fillText(String(m), cx + s * m * ppm, cy - 14);
      }
      if (m % 10 === 0) {
        g.beginPath();
        g.moveTo(cx - 5, cy + m * ppm);
        g.lineTo(cx + 5, cy + m * ppm);
        g.stroke();
      }
    }
    // 上方倒 V 瞄準點
    g.beginPath();
    g.moveTo(cx - 8, cy - 14);
    g.lineTo(cx, cy - 2);
    g.lineTo(cx + 8, cy - 14);
    g.stroke();
  }

  hud() {
    const g = this.game;
    const entry = g.targetBook.selected();
    const reloadBar = this.loaded
      ? `<span class="ok">已裝填：${this.w.shells.find((s) => s.id === this.loaded).name}</span>`
      : this.reload > 0
        ? `裝填中 <div class="bar"><i style="width:${(this.reload * 100).toFixed(0)}%"></i></div>`
        : '<span class="warn">未裝填</span>　按住 <b>R</b>';
    const sug = entry ? lookupElevation(this.tableShell(), entry.range).toFixed(1) : null;
    return `
      <div class="acc">${this.label}</div>
      <div><span class="k">方位角</span> ${fmtMil(this.azimuthMil())}　<span class="k">射角</span> ${toMil(this.elev).toFixed(1)} 密位</div>
      <div><span class="k">表尺</span> <b>${this.drum.toFixed(1)}</b> 密位${g.settings.assist ? '　<span class="ok">輔助</span>' : ''}</div>
      <div><span class="k">彈種</span> ${this.shell.name}　${this.w.shells.map((s) => `<span class="k">${s.name}</span> ${this.ammo[s.id]}`).join('　')}</div>
      <div>${reloadBar}</div>
      <div><span class="k">目標簿</span> ${entry ? `${entry.id} 方位 ${fmtMil(entry.bearing)}・${entry.range} m（${entry.method}）${g.settings.assist ? '' : `<span class="k">　射表約 ${sug}</span>`}` : '—'}</div>
      <div class="k">滑鼠：方向／俯仰　滾輪：表尺 ±1（Shift ±10、- = 微調 ±0.1）　${this.w.shells.map((_, i) => i + 1).join('/')}：彈種　右鍵：倍率　[ ]：選目標　E：離開</div>`;
  }
}

// ─────────────────────────────── 九七式曲射歩兵砲（迫砲） ───────────────────────────────
// 裝定方位（密位）與距離（m），砲手依射表設定射角；曲射越過山稜。只能停車射擊。
const MUZZLE_LOCAL = new THREE.Vector3(-Math.cos(60 * DEG) * 1.27, 0.06 + Math.sin(60 * DEG) * 1.27, 0);

export class MortarStation {
  constructor(game, car, ref) {
    this.type = 'mortar';
    this.game = game;
    this.car = car;
    this.ref = ref;
    this.label = '電源車 九七式曲射歩兵砲';
    this.w = WEAPONS.type97;
    this.bearing = 0; // 密位，正北起算
    this.range = 1000;
    this.reload = 0;
    this.ready = true;
    this.ammo = { ...this.w.stock };
    this.rounds = 0;
    this.lookYaw = 0;
    this.lookPitch = 0.12;
    this.shake = 0;
    this.report = null; // 最近一次觀測哨回報
    this._init = false;
  }

  get table() {
    return this.w.table;
  }

  // 依射表求射角（密位）；射程外回傳 null
  elevMil(range = this.range) {
    const t = this.table;
    if (range < t.minRange || range > t.maxRange) return null;
    return lookupElevation(t, range);
  }

  enter() {
    if (!this._init) {
      // 第一次上崗：方位朝列車左側（北方）
      this._init = true;
      const q = this.car.group.getWorldQuaternion(new THREE.Quaternion());
      const left = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      this.bearing = Math.round(bearingMil(left.x, left.z) / 10) * 10;
    }
  }

  exit() {}

  // 依目標簿裝定
  layOn(entry) {
    if (!entry) {
      this.game.message('目標簿沒有選定的目標', 'alert');
      return;
    }
    // 目標簿的方位、距離以記錄者位置為準；有座標時改從迫砲位置重新計算
    if (entry.point) {
      const m = this.ref.node.getWorldPosition(new THREE.Vector3());
      this.bearing = Math.round(bearingMil(entry.point.x - m.x, entry.point.z - m.z));
      this.range = Math.round(Math.hypot(entry.point.x - m.x, entry.point.z - m.z) / 10) * 10;
    } else {
      this.bearing = Math.round(entry.bearing);
      this.range = Math.round(entry.range / 10) * 10;
    }
    this.game.message(`迫砲裝定：方位 ${fmtMil(this.bearing)}、距離 ${this.range} m（${entry.id}）`);
    this.game.emit('mortarLay', { station: this, entry });
  }

  update(dt, input, active) {
    const g = this.game;
    if (!this.ready) {
      this.reload += dt / this.w.reloadTime;
      if (this.reload >= 1) {
        this.ready = true;
        this.reload = 0;
      }
    }
    if (active) {
      this.lookYaw = clamp(this.lookYaw - input.mouseDX * 0.0022, -1.2, 1.2);
      this.lookPitch = clamp(this.lookPitch - input.mouseDY * 0.0022, -0.4, 0.9);
      const fine = input.down('ShiftLeft') || input.down('ShiftRight');
      const db = fine ? 1 : 10;
      const dr = fine ? 10 : 50;
      if (input.hit('KeyA') || input.hit('ArrowLeft')) this.bearing -= db;
      if (input.hit('KeyD') || input.hit('ArrowRight')) this.bearing += db;
      if (input.hit('KeyW') || input.hit('ArrowUp')) this.range += dr;
      if (input.hit('KeyS') || input.hit('ArrowDown')) this.range -= dr;
      this.bearing = ((this.bearing % 6400) + 6400) % 6400;
      this.range = clamp(this.range, 100, 3000);
      if (input.hit('BracketLeft')) g.targetBook.cycle(-1);
      if (input.hit('BracketRight')) g.targetBook.cycle(1);
      if (input.hit('KeyF')) this.layOn(g.targetBook.selected());
      if (input.btnHit(0)) this.fire();
    }
    // 砲身轉向裝定方位
    const dir = this.dirWorld(new THREE.Vector3());
    const inv = this.car.group.getWorldQuaternion(new THREE.Quaternion()).invert();
    dir.applyQuaternion(inv);
    this.ref.node.rotation.y = Math.atan2(dir.z, -dir.x);
    this.shake = Math.max(0, this.shake - dt * 0.2);
  }

  dirWorld(out) {
    const b = fromMil(this.bearing);
    return out.set(Math.sin(b), 0, -Math.cos(b));
  }

  fire() {
    const g = this.game;
    if (Math.abs(g.train.speed) > 0.3) {
      g.message('行進間無法射擊迫砲，請先停車', 'alert');
      return;
    }
    if (!this.ready) {
      g.message('裝填中…', 'alert');
      return;
    }
    if (this.ammo.HE <= 0) {
      g.message('迫砲彈已用罄', 'alert');
      return;
    }
    const elev = this.elevMil();
    if (elev == null) {
      g.message(`射程外（${this.table.minRange}–${this.table.maxRange} m）`, 'alert');
      return;
    }
    const shell = this.w.shells[0];
    const d = this.w.dispersionMil;
    const b = fromMil(this.bearing + gaussian() * d * 0.5);
    const e = fromMil(elev + gaussian() * d * 0.25);
    const v0 = shell.v0 * (1 + gaussian() * 0.004);
    const vel = new THREE.Vector3(Math.sin(b) * Math.cos(e), Math.sin(e), -Math.cos(b) * Math.cos(e)).multiplyScalar(v0);
    const muzzle = this.muzzle(new THREE.Vector3());
    g.projectiles.spawn({ pos: muzzle, vel, k: this.w.C * shell.form, kind: 'shell', shell, weapon: this.w, source: this });
    g.effects.muzzleFlash(muzzle, vel.clone().normalize(), 1.2);
    g.audio.play('cannon', muzzle, 0.55);
    this.ammo.HE--;
    this.rounds++;
    g.stats.shots++;
    this.ready = false;
    this.reload = 0;
    this.shake = 0.02;
    g.emit('mortarFire', { station: this });
  }

  muzzle(out) {
    return out.copy(MUZZLE_LOCAL).applyMatrix4(this.ref.node.matrixWorld);
  }

  applyCamera(camera) {
    // 站在砲的正後方（兩側砲手之間），視線朝裝定方位
    const base = this.ref.node.getWorldPosition(_v);
    const dir = this.dirWorld(_d);
    camera.position.copy(base).addScaledVector(dir, -0.35);
    camera.position.y += 1.75;
    const yaw = Math.atan2(-dir.z, dir.x) + this.lookYaw;
    _e.set(this.lookPitch, yaw - Math.PI / 2, 0, 'YXZ');
    camera.quaternion.setFromEuler(_e);
    camera.fov = 70;
    shake(camera, this.shake);
  }

  hud() {
    const g = this.game;
    const entry = g.targetBook.selected();
    const elev = this.elevMil();
    const moving = Math.abs(g.train.speed) > 0.3;
    const state = moving ? '<span class="warn">行進中，無法射擊</span>' : this.ready ? '<span class="ok">待發</span>　左鍵發射' : `裝填中 <div class="bar"><i style="width:${(this.reload * 100).toFixed(0)}%"></i></div>`;
    const r = this.report;
    return `
      <div class="acc">${this.label}</div>
      <div><span class="k">方位</span> <b>${fmtMil(this.bearing)}</b> 密位　<span class="k">距離</span> <b>${this.range}</b> m</div>
      <div><span class="k">射角</span> ${elev == null ? `<span class="warn">射程外（${this.table.minRange}–${this.table.maxRange} m）</span>` : `${elev.toFixed(0)} 密位`}　<span class="k">榴弾</span> ${this.ammo.HE}</div>
      <div>${state}</div>
      <div><span class="k">目標簿</span> ${entry ? `${entry.id} 方位 ${fmtMil(entry.bearing)}・${entry.range} m（${entry.method}）` : '—'}</div>
      ${r ? `<div><span class="k">觀測哨回報</span> <span class="acc">${r}</span></div>` : ''}
      <div class="k">A/D：方位 ±10（Shift ±1）　W/S：距離 ±50（Shift ±10）　[ ]：選目標　F：依目標裝定　T：射表　E：離開</div>`;
  }
}

// ─────────────────────────────── 九二式重機槍 ───────────────────────────────
export class MgStation {
  constructor(game, car, mg, pool) {
    this.type = 'mg';
    this.game = game;
    this.car = car;
    this.mg = mg;
    this.label = mg.label;
    this.pool = pool;
    this.w = WEAPONS.type92;
    this.yaw = 0;
    this.pitch = 0;
    this.strip = this.w.stripSize;
    this.reload = 0;
    this.heat = 0;
    this.overheat = false;
    this.cool = 0;
    this.zoom = false;
  }

  enter() {}
  exit() {
    this.reload = 0;
  }

  update(dt, input, active) {
    const g = this.game;
    const w = this.w;
    this.cool = Math.max(0, this.cool - dt);
    this.heat = Math.max(0, this.heat - dt * 5);
    if (this.overheat && this.heat < 45) {
      this.overheat = false;
      g.message('槍管已冷卻');
    }
    if (active) {
      const sens = this.zoom ? 0.0009 : 0.0018;
      const dyaw = clamp(-input.mouseDX * sens, -w.traverseRate * dt, w.traverseRate * dt);
      const dp = clamp(-input.mouseDY * sens, -w.elevRate * dt, w.elevRate * dt);
      this.yaw = clamp(this.yaw + dyaw, -this.mg.arc, this.mg.arc);
      this.pitch = clamp(this.pitch + dp, w.elevMin, w.elevMax);
      if (input.btnHit(2)) {
        this.zoom = !this.zoom;
        this.game.emit('zoom', { station: this, zoom: this.zoom });
      }

      if (input.down('KeyR') && this.strip < w.stripSize && this.pool.rounds > 0) {
        if (this.reload === 0) g.audio.play('clank', this.mg.sight.getWorldPosition(_v), 0.5);
        this.reload += dt / w.reloadTime;
        if (this.reload >= 1) {
          const need = Math.min(w.stripSize, this.pool.rounds + this.strip) - this.strip;
          this.pool.rounds -= need;
          this.strip += need;
          g.emit('mgReload', { station: this });
          this.reload = 0;
        }
      } else {
        this.reload = 0;
      }

      if (input.btn(0) && this.cool <= 0) {
        if (this.overheat) {
          if (input.btnHit(0)) g.message('槍管過熱！', 'alert');
        } else if (this.strip <= 0) {
          if (input.btnHit(0)) g.audio.play('click', this.mg.sight.getWorldPosition(_v));
        } else {
          this.shoot();
          this.cool += 60 / w.rpm;
        }
      }
    }
    this.mg.yawG.rotation.y = this.yaw;
    this.mg.pitchG.rotation.z = this.pitch;
  }

  shoot() {
    const g = this.game;
    const muzzle = this.mg.muzzle.getWorldPosition(new THREE.Vector3());
    this.mg.pitchG.getWorldQuaternion(_q);
    const dir = X_AXIS.clone().applyQuaternion(_q);
    const blocker = g.train.rayBlocked(muzzle, dir, this.car, 60);
    if (blocker) {
      if (this.cool <= 0 && !this.silent) g.message(`射界受阻：${blocker.name}`, 'alert');
      this.cool = 0.5;
      return;
    }
    const spread = this.w.dispersionMil * (1 + this.heat / 60);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(_q);
    const side = new THREE.Vector3().crossVectors(dir, up);
    dir.addScaledVector(up, fromMil(gaussian() * spread)).addScaledVector(side, fromMil(gaussian() * spread)).normalize();
    const shell = this.w.shells[0];
    const vel = dir.clone().multiplyScalar(shell.v0).add(g.train.velocity(_d));
    g.projectiles.spawn({ pos: muzzle, vel, k: this.w.C, kind: 'bullet', shell, weapon: this.w, tracer: true, source: this });
    g.emit('mgShot', { station: this });
    g.effects.muzzleFlash(muzzle, dir, 0.25);
    g.audio.play('mg', muzzle, 1);
    this.strip--;
    this.heat += 1.15;
    if (this.heat >= 100) {
      this.overheat = true;
      g.message('槍管過熱！停止射擊冷卻', 'alert');
    }
  }

  applyCamera(camera) {
    this.mg.sight.getWorldPosition(camera.position);
    viewQuat(this.mg.yawG, this.pitch, 0, camera.quaternion);
    camera.fov = this.zoom ? 22 : 48;
    if (this.cool > 0 && this.game.input.btn(0) && this.strip > 0) shake(camera, 0.003);
  }

  // 槍口方位（密位）
  azimuthMil() {
    this.mg.pitchG.getWorldQuaternion(_q);
    _v.set(1, 0, 0).applyQuaternion(_q);
    return bearingMil(_v.x, _v.z);
  }

  drawOverlay(g, W, H, camera) {
    const cx = W / 2;
    const cy = H / 2;
    bearingTape(g, W, camera);
    g.strokeStyle = 'rgba(20,20,15,0.9)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy, 34, 0, Math.PI * 2);
    g.moveTo(cx - 70, cy);
    g.lineTo(cx - 34, cy);
    g.moveTo(cx + 34, cy);
    g.lineTo(cx + 70, cy);
    g.moveTo(cx, cy + 34);
    g.lineTo(cx, cy + 70);
    g.stroke();
    g.fillStyle = 'rgba(20,20,15,0.95)';
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx - 4, cy + 10);
    g.lineTo(cx + 4, cy + 10);
    g.fill();
  }

  hud() {
    const heatCls = this.overheat ? 'warn' : this.heat > 70 ? 'acc' : 'k';
    return `
      <div class="acc">${this.label}（九二式重機関銃）</div>
      <div><span class="k">方位</span> <b>${fmtMil(this.azimuthMil())}</b> 密位</div>
      <div><span class="k">保彈板</span> <b>${this.strip}</b>/${this.w.stripSize}　<span class="k">本車存彈</span> ${this.pool.rounds}</div>
      ${this.reload > 0 ? `換彈中 <div class="bar"><i style="width:${(this.reload * 100).toFixed(0)}%"></i></div>` : ''}
      <div><span class="${heatCls}">槍管溫度 ${Math.round(this.heat)}%${this.overheat ? '（過熱）' : ''}</span></div>
      <div class="k">左鍵：射擊　按住 R：換保彈板　右鍵：倍率　E：離開</div>`;
  }
}

// ─────────────────────────────── 指揮台 ───────────────────────────────
export class ConsoleStation {
  constructor(game, car, ref) {
    this.type = 'console';
    this.game = game;
    this.car = car;
    this.anchor = ref.anchor;
    this.label = '指揮車 指揮台';
    this.yaw = 0;
    this.pitch = 0;
    this.zoom = false;
  }

  enter() {}
  exit() {}

  view(out) {
    return viewQuat(this.car.group, this.pitch, this.yaw, out);
  }

  update(dt, input, active) {
    if (!active) return;
    const g = this.game;
    const sens = this.zoom ? 0.00025 : 0.0022;
    this.yaw -= input.mouseDX * sens;
    // 指揮塔的觀察窗是水平一圈：只能略為俯仰（往下會看進車內）
    this.pitch = clamp(this.pitch - input.mouseDY * sens, -0.2, 0.5);
    if (input.btnHit(2)) {
        this.zoom = !this.zoom;
        this.game.emit('zoom', { station: this, zoom: this.zoom });
      }
    if (input.hit('KeyW') || input.hit('ArrowUp')) g.train.order(g.train.ordered + 1);
    if (input.hit('KeyS') || input.hit('ArrowDown')) g.train.order(g.train.ordered - 1);
    if (input.btnHit(0) && this.zoom) this.mark();
  }

  // 觀測鏡只能精確標方位，距離為目測估計（誤差約 ±12%）
  mark() {
    const g = this.game;
    const origin = this.anchor.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.view(new THREE.Quaternion()));
    const hit = g.pick(origin, dir);
    if (!hit) {
      g.message('觀測鏡：無法判定（天空或超出視界）', 'alert');
      return;
    }
    const est = clamp(hit.dist * (1 + gaussian() * 0.12), hit.dist * 0.75, hit.dist * 1.25);
    const e = g.targetBook.add({ bearing: bearingMil(dir.x, dir.z), range: Math.round(est / 50) * 50, method: '目測', point: origin.clone().addScaledVector(dir, hit.dist) });
    g.emit('mark', { entry: e, target: hit.target });
    g.message(`目標簿 ${e.id}：方位 ${fmtMil(e.bearing)}，目測距離約 ${e.range} m`);
  }

  applyCamera(camera) {
    this.anchor.getWorldPosition(camera.position);
    this.view(camera.quaternion);
    camera.fov = this.zoom ? 8.5 : 68;
  }

  drawOverlay(g, W, H, camera) {
    const cx = W / 2;
    const cy = H / 2;
    if (this.zoom) {
      // 雙眼望遠鏡遮罩
      const r = Math.min(W, H) * 0.36;
      maskWithHoles(g, W, H, 0.93, (c) => {
        for (const ox of [-r * 0.62, r * 0.62]) {
          c.moveTo(cx + ox + r, cy);
          c.arc(cx + ox, cy, r, 0, Math.PI * 2);
        }
      });
      const ppm = pxPerMil(camera, H);
      g.strokeStyle = 'rgba(10,10,8,0.9)';
      g.fillStyle = 'rgba(10,10,8,0.9)';
      g.lineWidth = 1.2;
      g.font = '11px sans-serif';
      g.textAlign = 'center';
      g.beginPath();
      g.moveTo(cx - 100 * ppm, cy);
      g.lineTo(cx + 100 * ppm, cy);
      for (let m = -100; m <= 100; m += 10) {
        const l = m % 50 === 0 ? 9 : 5;
        g.moveTo(cx + m * ppm, cy - l);
        g.lineTo(cx + m * ppm, cy + l);
      }
      g.stroke();
    }
    // 方位刻度帶
    const dir = _d.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const b = bearingMil(dir.x, dir.z);
    g.fillStyle = 'rgba(18,20,14,0.75)';
    g.fillRect(cx - 160, 10, 320, 30);
    g.fillStyle = '#e8e3cf';
    g.font = '14px sans-serif';
    g.textAlign = 'center';
    g.fillText(`方位 ${fmtMil(b)} 密位`, cx, 31);

    // 傳令鐘
    const t = this.game.train;
    const bw = 360;
    const bx = cx - bw / 2;
    const by = H - 70;
    g.fillStyle = 'rgba(18,20,14,0.8)';
    g.fillRect(bx, by, bw, 52);
    NOTCHES.forEach((n, i) => {
      const x = bx + 12 + i * ((bw - 24) / NOTCHES.length);
      const wcell = (bw - 24) / NOTCHES.length - 6;
      const ordered = i === t.ordered;
      const ack = i === t.acknowledged;
      g.fillStyle = ack ? '#e0b25a' : ordered ? 'rgba(224,178,90,0.35)' : 'rgba(255,255,255,0.08)';
      g.fillRect(x, by + 8, wcell, 26);
      g.fillStyle = ack ? '#1b1d15' : '#e8e3cf';
      g.font = '14px sans-serif';
      g.fillText(n.name, x + wcell / 2, by + 26);
    });
    g.fillStyle = '#a9a48f';
    g.font = '11px sans-serif';
    g.fillText(t.pending ? `傳令中… → ${NOTCHES[t.pending.notch].name}` : '司機已確認', cx, by + 47);
  }

  hud() {
    const t = this.game.train;
    return `
      <div class="acc">指揮車 指揮台</div>
      <div><span class="k">傳令鐘</span> ${NOTCHES[t.ordered].name}${t.pending ? '（傳令中）' : ''}　<span class="k">速度</span> ${(t.speed * 3.6).toFixed(0)} km/h</div>
      <div class="k">W/S：傳令鐘加減速　右鍵：觀測鏡　左鍵（觀測鏡中）：標記方位、目測距離　E：離開</div>`;
  }
}

// ─────────────────────────────── 測距儀 ───────────────────────────────
export class RangefinderStation {
  constructor(game, car, ref) {
    this.type = 'rangefinder';
    this.game = game;
    this.car = car;
    this.yawG = ref.yawG;
    this.anchor = ref.anchor;
    this.label = '火砲車乙 測距儀';
    this.yaw = Math.PI / 2;
    this.pitch = 0;
    this.zoom = true;
    this.reading = null;
  }

  enter() {}
  exit() {}

  view(out) {
    return viewQuat(this.car.group, this.pitch, this.yaw, out);
  }

  update(dt, input, active) {
    this.yawG.rotation.y = this.yaw;
    if (this.reading) this.reading.t -= dt;
    if (!active) return;
    const sens = this.zoom ? 0.00009 : 0.0018;
    this.yaw -= input.mouseDX * sens;
    this.pitch = clamp(this.pitch - input.mouseDY * sens, -0.2, 0.35);
    if (input.btnHit(2)) {
        this.zoom = !this.zoom;
        this.game.emit('zoom', { station: this, zoom: this.zoom });
      }
    if (input.btnHit(0)) this.measure();
  }

  // 合像式測距：誤差隨距離平方增加
  measure() {
    const g = this.game;
    const origin = this.anchor.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.view(new THREE.Quaternion()));
    const hit = g.pick(origin, dir);
    if (!hit) {
      this.reading = { text: '— 無法測距 —', t: 4 };
      return;
    }
    const sigma = 1.5 + 1.0e-6 * hit.dist * hit.dist;
    const r = Math.max(10, Math.round((hit.dist + gaussian() * sigma) / 5) * 5);
    const e = g.targetBook.add({ bearing: bearingMil(dir.x, dir.z), range: r, method: '測距', point: origin.clone().addScaledVector(dir, hit.dist) });
    g.emit('measure', { entry: e, target: hit.target, dist: hit.dist });
    this.reading = { text: `${r.toLocaleString()} m`, t: 6 };
    g.audio.play('click', origin, 2);
    g.message(`目標簿 ${e.id}：方位 ${fmtMil(e.bearing)}，測距 ${r} m`);
  }

  applyCamera(camera) {
    this.anchor.getWorldPosition(camera.position);
    this.view(camera.quaternion);
    camera.fov = this.zoom ? 3.2 : 40;
  }

  drawOverlay(g, W, H, camera) {
    const cx = W / 2;
    const cy = H / 2;
    const rw = Math.min(W * 0.8, 900);
    const rh = Math.min(H * 0.42, 300);
    maskWithHoles(g, W, H, 0.93, (c) => {
      c.moveTo(cx + rw / 2, cy);
      c.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2);
    });
    g.strokeStyle = 'rgba(10,10,8,0.85)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(cx - rw / 2, cy);
    g.lineTo(cx - 10, cy);
    g.moveTo(cx + 10, cy);
    g.lineTo(cx + rw / 2, cy);
    g.moveTo(cx, cy - 22);
    g.lineTo(cx, cy - 6);
    g.moveTo(cx, cy + 6);
    g.lineTo(cx, cy + 22);
    g.stroke();
    const dir = _d.set(0, 0, -1).applyQuaternion(camera.quaternion);
    g.fillStyle = '#e8e3cf';
    g.font = '15px sans-serif';
    g.textAlign = 'center';
    g.fillText(`方位 ${fmtMil(bearingMil(dir.x, dir.z))}`, cx, cy + rh / 2 + 26);
    if (this.reading && this.reading.t > 0) {
      g.fillStyle = '#e0b25a';
      g.font = 'bold 22px sans-serif';
      g.fillText(this.reading.text, cx, cy - rh / 2 - 14);
    }
  }

  hud() {
    return `
      <div class="acc">火砲車乙 測距儀</div>
      <div class="k">滑鼠：轉向　左鍵：測距並記入目標簿　右鍵：倍率　E：離開</div>`;
  }
}

// ─────────────────────────────── 目標簿 ───────────────────────────────
export class TargetBook {
  constructor(game) {
    this.game = game;
    this.entries = [];
    this.sel = -1;
    this.next = 1;
  }

  add({ bearing, range, method, point = null }) {
    const e = { id: `T${this.next++}`, bearing, range, method, point, time: this.game.time };
    this.entries.push(e);
    if (this.entries.length > 12) this.entries.shift();
    this.sel = this.entries.length - 1;
    return e;
  }

  selected() {
    return this.entries[this.sel] ?? null;
  }

  cycle(d) {
    if (!this.entries.length) return;
    this.sel = (this.sel + d + this.entries.length) % this.entries.length;
    const e = this.selected();
    this.game.message(`選定目標 ${e.id}：方位 ${fmtMil(e.bearing)}，${e.range} m`);
  }
}
