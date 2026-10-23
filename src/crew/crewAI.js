import * as THREE from 'three';
import { lookupElevation } from '../weapons/firingTable.js';
import { DEG, clamp, gaussian, fromMil, bearingMil, wrapAngle } from '../core/math.js';

const MG_RANGE = 900;
const GUN_MODES = ['hold', 'free', 'target'];
const GUN_MODE_NAME = { hold: '待命', free: '自由射擊', target: '砲擊選定目標' };
const X_AXIS = new THREE.Vector3(1, 0, 0);

// AI 軍士操作崗位：機槍自動接戰、十糎砲依命令射擊與修正、測距手精確測距
export class CrewAI {
  constructor(game, crew, stations, enemies, terrain) {
    this.game = game;
    this.crew = crew;
    this.enemies = enemies;
    this.terrain = terrain;
    this.mgs = stations.filter((s) => s.type === 'mg');
    this.guns = stations.filter((s) => s.type === 'gun');
    this.rf = stations.find((s) => s.type === 'rangefinder');
    this.orders = { mg: 'free', guns: Object.fromEntries(this.guns.map((g) => [g.car.kind, 'hold'])), rf: true };
    this.enabled = true;
    this.menuOpen = false;
    this.gunTargets = {};
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._d = new THREE.Vector3();
    for (const s of [...this.mgs, ...this.guns]) s.ai = { t: 0 };
  }

  // ── 命令選單（C）──
  handleInput(input) {
    if (input.hit('KeyC')) {
      this.menuOpen = !this.menuOpen;
      return true;
    }
    if (!this.menuOpen) return false;
    const g = this.game;
    if (input.hit('Escape')) this.menuOpen = false;
    if (input.hit('Digit1')) {
      this.orders.mg = this.orders.mg === 'free' ? 'hold' : 'free';
      g.message(`命令：機槍${this.orders.mg === 'free' ? '自由射擊' : '停止射擊'}`, 'radio');
    }
    this.guns.forEach((st, i) => {
      if (!input.hit(`Digit${i + 2}`)) return;
      const k = st.car.kind;
      const next = GUN_MODES[(GUN_MODES.indexOf(this.orders.guns[k]) + 1) % GUN_MODES.length];
      if (next === 'target') {
        const e = g.targetBook.selected();
        if (!e) {
          g.message('目標簿沒有選定的目標（先用觀測鏡或測距儀標記）', 'alert');
          this.orders.guns[k] = 'hold';
          return;
        }
        this.gunTargets[k] = { entry: e, corr: 0 };
        g.message(`命令：${st.car.name}砲擊 ${e.id}（方位 ${Math.round(e.bearing)}、${e.range} m）`, 'radio');
      } else {
        g.message(`命令：${st.car.name}${GUN_MODE_NAME[next]}`, 'radio');
      }
      this.orders.guns[k] = next;
      st.ai.phase = 'idle';
    });
    if (input.hit(`Digit${this.guns.length + 2}`)) {
      this.orders.mg = 'hold';
      for (const k of Object.keys(this.orders.guns)) this.orders.guns[k] = 'hold';
      g.message('命令：全員停火！', 'radio');
    }
    if (input.hit(`Digit${this.guns.length + 3}`)) {
      this.orders.rf = !this.orders.rf;
      g.message(`命令：測距手${this.orders.rf ? '自動測距' : '待命'}`, 'radio');
    }
    return true;
  }

  menuHtml() {
    const o = this.orders;
    const rows = [
      ['1', '機槍（全車）', o.mg === 'free' ? '自由射擊' : '停止射擊'],
      ...this.guns.map((st, i) => [String(i + 2), `${st.car.name}十糎砲`, GUN_MODE_NAME[o.guns[st.car.kind]]]),
      [String(this.guns.length + 2), '全員停火', ''],
      [String(this.guns.length + 3), '測距手', o.rf ? '自動測距' : '待命'],
    ];
    return `<div class="cmd-title">乘員命令 <small>按數字切換・C 關閉</small></div>
      <table>${rows.map(([k, n, v]) => `<tr><td><kbd>${k}</kbd></td><td>${n}</td><td class="v">${v}</td></tr>`).join('')}</table>
      <div class="cmd-note">「砲擊選定目標」使用目標簿目前選定的目標（[ ] 切換）。你可以隨時走到任何崗位親自接手。</div>`;
  }

  statusHtml() {
    const o = this.orders;
    const guns = this.guns.map((st) => `${st.car.name.slice(-1)}砲 ${GUN_MODE_NAME[o.guns[st.car.kind]]}${this.gunStatus(st)}`).join('｜');
    const manned = this.mgs.filter((s) => this.crew.operatorOf(s)).length;
    return `<div class="k">乘員命令 <kbd>C</kbd></div>
      <div>機槍 ${o.mg === 'free' ? '<span class="ok">自由射擊</span>' : '停止'}（${manned}/${this.mgs.length} 有人）</div>
      <div>${guns}</div>
      <div class="k">傷亡 ${this.crew.casualties}・預備兵 ${this.crew.reserves}</div>`;
  }

  gunStatus(st) {
    const ai = st.ai;
    if (this.game.station === st) return '（你）';
    if (!this.crew.operatorOf(st)) return '<span class="warn">（無人）</span>';
    if (ai.phase === 'load') return `（裝填 ${Math.round(st.reload * 100)}%）`;
    if (ai.phase === 'lay') return '（瞄準中）';
    if (ai.phase === 'wait') return '（觀測彈著）';
    return '';
  }

  // ── 每幀 ──
  update(dt) {
    if (!this.enabled) return;
    for (const st of this.mgs) this.updateMg(st, dt);
    for (const st of this.guns) this.updateGun(st, dt);
  }

  manned(st) {
    return this.game.station !== st && this.crew.operatorOf(st);
  }

  // 機槍：在射界內找最近的敵人，點放射擊
  updateMg(st, dt) {
    const ai = st.ai;
    if (!this.manned(st) || this.orders.mg !== 'free') {
      ai.target = null;
      return;
    }
    ai.t -= dt;
    // 換保彈板
    if (st.strip <= 0) {
      ai.reload = (ai.reload ?? 0) + dt;
      if (ai.reload > 3.5 && st.pool.rounds > 0) {
        const need = Math.min(30, st.pool.rounds);
        st.pool.rounds -= need;
        st.strip = need;
        ai.reload = 0;
      }
      return;
    }
    const base = st.mg.base;
    base.getWorldQuaternion(this._q);
    const inv = this._q.clone().invert();
    st.mg.muzzle.getWorldPosition(this._p);
    if (ai.t <= 0) {
      ai.t = 0.5;
      ai.target = null;
      let best = 1e9;
      for (const m of this.enemies.targetsNear(this._p, MG_RANGE)) {
        const local = this._d.copy(m.center).sub(this._p).applyQuaternion(inv);
        const yaw = Math.atan2(-local.z, local.x);
        const pitch = Math.atan2(local.y, Math.hypot(local.x, local.z));
        if (Math.abs(yaw) > st.mg.arc || pitch < st.w.elevMin || pitch > st.w.elevMax) continue;
        const d = m.center.distanceTo(this._p);
        if (d >= best) continue;
        const dir = this._d.copy(m.center).sub(this._p).normalize();
        if (!this.enemies.hasLos(this._p, dir, d)) continue;
        best = d;
        ai.target = m;
        const sp = fromMil(2 + d / 180);
        ai.err = [gaussian() * sp, gaussian() * sp];
      }
    }
    const m = ai.target;
    if (!m || !m.alive) return;
    // 提前量：依目標上一幀位移估算速度
    const d = m.center.distanceTo(this._p);
    const tof = d / 650;
    const vel = ai.last ? this._d.copy(m.center).sub(ai.last).divideScalar(Math.max(dt, 1e-3)) : this._d.set(0, 0, 0);
    ai.last = (ai.last ?? new THREE.Vector3()).copy(m.center);
    const aimPt = m.center.clone().addScaledVector(vel, tof);
    const local = aimPt.sub(this._p).applyQuaternion(inv);
    const wantYaw = clamp(Math.atan2(-local.z, local.x) + ai.err[0], -st.mg.arc, st.mg.arc);
    // 下墜補償：依機槍彈的彈道解抬高射角
    const wantPitch = clamp(Math.atan2(local.y, Math.hypot(local.x, local.z)) + this.enemies.elevation(d) + ai.err[1], st.w.elevMin, st.w.elevMax);
    const rate = 70 * DEG * dt;
    st.yaw += clamp(wantYaw - st.yaw, -rate, rate);
    st.pitch += clamp(wantPitch - st.pitch, -rate, rate);
    const aligned = Math.abs(wantYaw - st.yaw) < 1.5 * DEG && Math.abs(wantPitch - st.pitch) < 1.5 * DEG;
    // 點放：每次 6–10 發，間隔 0.7 秒；溫度過高就停
    ai.burstWait = (ai.burstWait ?? 0) - dt;
    if (aligned && ai.burstWait <= 0 && st.cool <= 0 && !st.overheat && st.heat < 80) {
      st.silent = true;
      st.shoot();
      st.silent = false;
      st.cool += 60 / st.w.rpm;
      ai.burst = (ai.burst ?? 0) + 1;
      if (ai.burst >= 6 + Math.random() * 4) {
        ai.burst = 0;
        ai.burstWait = 0.7;
        const sp = fromMil(2 + d / 200);
        ai.err = [gaussian() * sp, gaussian() * sp];
      }
    }
  }

  // 十糎砲：依命令射擊，觀察彈著後修正距離
  updateGun(st, dt) {
    const ai = st.ai;
    const mode = this.orders.guns[st.car.kind];
    if (!this.manned(st) || mode === 'hold') {
      ai.phase = 'idle';
      return;
    }
    const g = this.game;
    // 決定目標點（世界座標）
    let point = null;
    if (mode === 'target') {
      const t = this.gunTargets[st.car.kind];
      if (t?.entry?.point) point = t.entry.point;
    } else {
      ai.pick = (ai.pick ?? 0) - dt;
      if (ai.pick <= 0 || !ai.freeTarget || !ai.freeTarget.alive) {
        ai.pick = 4;
        ai.freeTarget = this.pickGunTarget(st);
      }
      point = ai.freeTarget?.center ?? null;
    }
    if (!point) {
      ai.phase = 'idle';
      return;
    }
    // 裝填：對裝甲列車用尖鋭弾，其餘用榴弾
    const want = g.enemyTrain?.isNear(point) && st.ammo.AP > 0 ? 'AP' : 'HE';
    if (!st.loaded) {
      ai.phase = 'load';
      if (st.ammo[want] <= 0) return;
      st.reload += dt / st.w.reloadTime;
      if (st.reload >= 1) {
        st.reload = 0;
        st.loaded = want;
        st.ammo[want]--;
      }
      return;
    }
    if (ai.phase === 'wait') {
      ai.waitT -= dt;
      if (ai.waitT > 0) return;
    }
    // 瞄準：方位與射角（射表＋修正）
    ai.phase = 'lay';
    st.gun.turret.parent.getWorldQuaternion(this._q);
    const inv = this._q.clone().invert();
    st.gun.elev.getWorldPosition(this._p);
    const to = point.clone().sub(this._p);
    const horiz = Math.hypot(to.x, to.z);
    const key = st.car.kind;
    const corr = (mode === 'target' ? this.gunTargets[key]?.corr : ai.corr) ?? 0;
    // 想要的世界射向（方位＋射角），再換算到砲塔所在車廂的本地座標（車廂在坡道上會前後傾）
    const los = Math.atan2(to.y, horiz);
    const qeWorld = los + fromMil(lookupElevation(st.w.tables[st.loaded], Math.max(50, horiz + corr)));
    const local = this._d.set((to.x / horiz) * Math.cos(qeWorld), Math.sin(qeWorld), (to.z / horiz) * Math.cos(qeWorld)).applyQuaternion(inv);
    const wantYaw = Math.atan2(-local.z, local.x);
    const qe = Math.atan2(local.y, Math.hypot(local.x, local.z));
    const dy = wrapAngle(wantYaw - st.yaw);
    st.yaw = wrapAngle(st.yaw + clamp(dy, -st.w.traverseRate * dt, st.w.traverseRate * dt));
    st.elev = clamp(st.elev + clamp(qe - st.elev, -st.w.elevRate * dt, st.w.elevRate * dt), st.w.elevMin, st.w.elevMax);
    // 開火門檻：射角約為目標處 1.5 m 高、方向約 3 m 寬（遠距離平射要瞄得更準）
    const tolE = clamp(1.5 / horiz, 0.06 * DEG, 0.3 * DEG);
    const tolY = clamp(3 / horiz, 0.1 * DEG, 0.4 * DEG);
    // 目標低於砲的最低射角時，砲壓到最低就照樣射擊
    const elevOk = Math.abs(qe - st.elev) < tolE || (qe < st.w.elevMin && st.elev <= st.w.elevMin + 1e-4);
    if (Math.abs(dy) < tolY && elevOk) {
      // 射線上有自己的車廂就等待
      st.gun.elev.getWorldQuaternion(this._q);
      const dir = X_AXIS.clone().applyQuaternion(this._q);
      const muzzle = st.gun.muzzle.getWorldPosition(new THREE.Vector3());
      if (g.train.rayBlocked(muzzle, dir, st.car)) {
        ai.blocked = (ai.blocked ?? 0) + dt;
        if (ai.blocked > 6) {
          ai.blocked = 0;
          g.message(`${st.car.name}：射界被我方車廂擋住，無法射擊`, 'alert');
        }
        return;
      }
      ai.aimPoint = point.clone();
      st.fire();
      ai.phase = 'wait';
      ai.waitT = 4;
    }
  }

  // 自由射擊：找 400 m 以上、聚在一起或騎兵
  pickGunTarget(st) {
    const muzzle = st.gun.muzzle.getWorldPosition(new THREE.Vector3());
    let best = null;
    let bestScore = 0;
    for (const m of this.enemies.targetsNear(muzzle, 6000)) {
      const d = m.center.distanceTo(muzzle);
      if (d < 350) continue;
      const near = this.enemies.targetsNear(m.center, 25).length;
      const score = near * 2 + (m.horse ? 2 : 0) - d / 1000;
      if (score > bestScore) {
        const dir = m.center.clone().sub(muzzle).normalize();
        if (!this.enemies.hasLos(muzzle, dir, d)) continue;
        bestScore = score;
        best = m;
      }
    }
    return best;
  }

  // 彈著回報：修正距離
  onImpact(p, point) {
    const st = p.source;
    if (!st || st.type !== 'gun' || !st.ai?.aimPoint || this.game.station === st) return;
    const ai = st.ai;
    const from = st.gun.elev.getWorldPosition(new THREE.Vector3());
    const dir = ai.aimPoint.clone().sub(from).setY(0).normalize();
    // 平射打車輛時，彈道稍高就會飛越目標、落在很遠處；每次修正最多 80 m，逐步夾叉
    const err = clamp(point.clone().sub(ai.aimPoint).setY(0).dot(dir), -80, 80);
    const key = st.car.kind;
    if (this.orders.guns[key] === 'target' && this.gunTargets[key]) this.gunTargets[key].corr -= err * 0.85;
    else ai.corr = (ai.corr ?? 0) - err * 0.85;
    ai.waitT = Math.min(ai.waitT ?? 0, 0.5);
  }

  // 測距手：指揮官目測標記後，自動補上精確距離
  onMark(entry) {
    if (!this.orders.rf || !this.rf || !this.manned(this.rf) || !entry.point) return;
    const g = this.game;
    setTimeout(() => {
      if (!this.crew.operatorOf(this.rf)) return;
      const o = this.rf.anchor.getWorldPosition(new THREE.Vector3());
      const d = entry.point.distanceTo(o);
      const sigma = 1.5 + 1.0e-6 * d * d;
      const r = Math.max(10, Math.round((d + gaussian() * sigma) / 5) * 5);
      const e = g.targetBook.add({ bearing: bearingMil(entry.point.x - o.x, entry.point.z - o.z), range: r, method: '測距', point: entry.point.clone() });
      g.message(`測距手：${entry.id} 測得 ${r.toLocaleString()} m，已記為 ${e.id}`, 'radio');
    }, 4000);
  }
}

