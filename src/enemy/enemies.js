import * as THREE from 'three';
import { Soldier } from '../crew/soldier.js';
import { Horse } from './horse.js';
import { trackZ, trackDZDX, TRACK_X0, TRACK_X1 } from '../world/track.js';
import { WEAPONS } from '../data/weapons.js';
import { clamp, gaussian, fromMil } from '../core/math.js';
import { elevationForRange } from '../weapons/ballistics.js';

const RUN = 2.8;          // 步兵跑步 m/s
const GALLOP = 13;        // 騎兵襲步 m/s
const RIFLE_RANGE = 850;  // 步槍有效射擊距離
const UP = new THREE.Vector3(0, 1, 0);
const to = (from, dir, dist) => from.clone().addScaledVector(dir, dist);

// 架空敵軍的步槍彈（不打穿 10 mm 側面裝甲；近距離偶爾打穿 6 mm 車頂）
const ENEMY_RIFLE = { name: '敵步槍', short: '步槍', shells: [{ id: 'BALL', name: '步槍彈', v0: 760, form: 1, he: false, mass: 0.0105 }] };

// 敵軍：步兵班、騎兵隊；規則式狀態機（前進、射擊、壓制、撤退）
export class Enemies {
  constructor(scene, terrain, train, templates, game) {
    this.scene = scene;
    this.terrain = terrain;
    this.train = train;
    this.tpl = templates;
    this.game = game;
    this.units = [];
    this.members = [];
    this.killed = 0;
    this.repelled = 0;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
  }

  get alive() {
    return this.members.filter((m) => m.alive).length;
  }

  // ── 生成 ──
  trackPoint(x, side, dist) {
    const cx = clamp(x, TRACK_X0, TRACK_X1);
    const s = trackDZDX(cx);
    const n = Math.sqrt(1 + s * s);
    // 鐵道法線 (-s, 1)/n；side = -1 北、+1 南
    return { x: cx - (side * dist * s) / n, z: trackZ(cx) + (side * dist) / n, tx: 1 / n, tz: s / n };
  }

  makeSoldier(pose) {
    const s = new Soldier(this.tpl.npc_enemy, { pose, variant: 'enemy' });
    this.scene.add(s.root);
    return s;
  }

  // fixed：固守生成處的陣地，不隨列車移動
  spawnInfantry({ x, side, dist, count = 8, lmg = 1, name = '敵步兵班', approach = 150, fixed = false }) {
    const unit = { type: 'infantry', name, side, dist, members: [], state: 'advance', t: 0, initial: count, fixed };
    const anchor = this.trackPoint(x, side, dist);
    for (let i = 0; i < count; i++) {
      const along = (i - (count - 1) / 2) * 7 + gaussian() * 1.5;
      const slot = { x: anchor.x + anchor.tx * along, z: anchor.z + anchor.tz * along };
      const start = this.trackPoint(x + along * anchor.tx, side, dist + approach + Math.random() * 60);
      const m = this.addMember(unit, 'stand', start.x, start.z);
      m.slot = slot;
      m.along = along + (anchor.x - x);
      m.lmg = i < lmg;
      m.fireT = 2 + Math.random() * 5;
    }
    this.units.push(unit);
    return unit;
  }

  spawnCavalry({ x, side, dist = 1000, count = 8, name = '敵騎兵隊', harass = 230 }) {
    const unit = { type: 'cavalry', name, side, members: [], state: 'charge', t: 0, initial: count, harass, x };
    for (let i = 0; i < count; i++) {
      const p = this.trackPoint(x + (i - count / 2) * 9, side, dist + Math.random() * 80);
      const m = this.addMember(unit, 'ride', p.x, p.z);
      const horse = new Horse(this.tpl.horse);
      this.scene.add(horse.root);
      horse.root.position.set(p.x, this.terrain.heightAt(p.x, p.z), p.z);
      horse.saddle.add(m.s.root);
      m.s.baseY = 0;
      m.s.root.position.set(0, 0, 0);
      m.horse = horse;
      m.fireT = 3 + Math.random() * 4;
      m.lane = (i - count / 2) * 6;
    }
    this.units.push(unit);
    return unit;
  }

  addMember(unit, pose, x, z) {
    const s = this.makeSoldier(pose);
    const m = { unit, s, x, z, heading: 0, alive: true, state: 'move', fireT: 3, suppressed: 0, aimT: 0, center: new THREE.Vector3(), radius: 0.45, deadT: 0 };
    unit.members.push(m);
    this.members.push(m);
    return m;
  }

  // ── 每幀更新 ──
  update(dt) {
    const trainC = this.trainCenter(this._v);
    for (const u of this.units) {
      if (u.state === 'gone') continue;
      u.t += dt;
      const alive = u.members.filter((m) => m.alive);
      if (!alive.length) {
        u.state = 'gone';
        this.game.emit('unitDestroyed', { unit: u });
        continue;
      }
      const losses = 1 - alive.length / u.initial;
      if (u.state !== 'retreat') {
        const far = alive.every((m) => Math.hypot(m.x - trainC.x, m.z - trainC.z) > 1500);
        if ((u.type === 'infantry' && losses >= 0.5) || (u.type === 'cavalry' && (losses >= 0.6 || (u.harassT ?? 0) > 60 || u.t > 150)) || (far && u.t > 30)) {
          u.state = 'retreat';
          u.retreatT = 0;
          this.game.message(`${u.name}${far ? '脫離接觸' : '開始撤退'}！`, 'radio');
          this.game.emit('unitRetreat', { unit: u });
        }
      }
      if (u.state === 'retreat') {
        u.retreatT += dt;
        if (u.retreatT > 35) {
          u.state = 'gone';
          this.repelled++;
          for (const m of alive) this.remove(m);
          continue;
        }
      }
      for (const m of u.members) {
        if (m.alive) {
          if (u.type === 'infantry') this.updateInfantry(m, u, dt, trainC);
          else this.updateCavalry(m, u, dt, trainC);
        } else {
          this.updateDead(m, dt);
        }
      }
    }
  }

  updateInfantry(m, u, dt, trainC) {
    const s = m.s;
    m.suppressed = Math.max(0, m.suppressed - dt);
    let speed = 0;
    if (u.state === 'retreat') {
      const away = this.awayDir(m);
      m.x += away.x * RUN * dt;
      m.z += away.z * RUN * dt;
      m.heading = Math.atan2(-away.z, away.x);
      speed = RUN;
      s.setPose('stand');
    } else if (m.state === 'move') {
      // 射擊位置跟著列車目前的位置移動；距離 600 m 內就地展開
      m.reslot = (m.reslot ?? 0) - dt;
      if (m.reslot <= 0 && !u.fixed) {
        m.reslot = 3;
        m.slot = this.findSlot(trainC, m.along, u.side, u.dist);
      }
      m.holdEngage = (m.holdEngage ?? 0) - dt;
      if (m.holdEngage <= 0 && Math.hypot(m.x - trainC.x, m.z - trainC.z) < 720) m.state = 'engage';
      // 躍進：跑 5 秒、臥倒 3 秒（臥倒時也會射擊）
      m.boundT = (m.boundT ?? Math.random() * 5) - dt;
      if (m.boundT < -3) m.boundT = 5;
      if (m.boundT < 0) {
        s.setPose('prone');
        m.heading = Math.atan2(-(trainC.z - m.z), trainC.x - m.x);
        m.fireT -= dt;
        if (m.fireT <= 0) {
          this.fireAt(m, m.lmg);
          m.fireT = 4 + Math.random() * 4;
        }
        this.place(m, dt, 0);
        return;
      }
      const dx = m.slot.x - m.x;
      const dz = m.slot.z - m.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) {
        m.state = 'engage';
      } else {
        const v = m.suppressed > 0 ? 0 : RUN;
        m.x += (dx / d) * v * dt;
        m.z += (dz / d) * v * dt;
        m.heading = Math.atan2(-dz, dx);
        speed = v;
        s.setPose(m.suppressed > 0 ? 'prone' : 'stand');
      }
    } else {
      // 射擊位置：面向列車，交替臥姿與跪姿射擊
      m.heading = Math.atan2(-(trainC.z - m.z), trainC.x - m.x);
      m.fireT -= dt;
      m.aimT -= dt;
      const pose = m.suppressed > 0 ? 'prone' : m.lmg ? 'prone' : m.aimT > 0 ? 'crouchAim' : 'prone';
      s.setPose(pose);
      if (m.fireT <= 0 && m.suppressed <= 0) {
        if (this.fireAt(m, m.lmg)) {
          m.aimT = 1.2;
          m.noLos = 0;
        } else if ((m.noLos = (m.noLos ?? 0) + 1) >= 2) {
          // 看不到列車：換位置
          m.noLos = 0;
          m.state = 'move';
          m.reslot = 0;
          m.holdEngage = 12;
        }
        m.fireT = m.lmg ? 2.5 + Math.random() * 2 : 3 + Math.random() * 3.5;
      }
    }
    this.place(m, dt, speed);
  }

  updateCavalry(m, u, dt, trainC) {
    const t = this.train;
    let vx = 0;
    let vz = 0;
    let speed = GALLOP;
    if (u.state === 'retreat') {
      const a = this.awayDir(m);
      vx = a.x;
      vz = a.z;
      speed = GALLOP * 1.1;
    } else {
      // 衝向列車前方的騷擾位置（攔截），到了之後與列車平行奔馳
      const aheadX = u.state === 'charge' ? trainC.x + Math.sign(t.speed || 1) * 120 + m.lane * 2 : m.x;
      const ref = this.trackPoint(clamp(aheadX, TRACK_X0, TRACK_X1), u.side, u.harass + m.lane);
      const dx = ref.x - m.x;
      const dz = ref.z - m.z;
      const d = Math.hypot(dx, dz);
      if (d > 30 && u.state === 'charge') {
        vx = dx / d;
        vz = dz / d;
      } else {
        if (u.state !== 'harass') u.harassT = 0;
        u.state = 'harass';
        u.harassT += dt / Math.max(1, u.members.filter((x) => x.alive).length);
        // 朝列車方向前進，保持在騷擾距離
        const dir = Math.sign(trainC.x - m.x) || 1;
        vx = ref.tx * dir + (dx / Math.max(d, 1)) * 0.4;
        vz = ref.tz * dir + (dz / Math.max(d, 1)) * 0.4;
        const n = Math.hypot(vx, vz);
        vx /= n;
        vz /= n;
        speed = clamp(Math.abs(t.speed) + (Math.abs(trainC.x - m.x) > 60 ? 4 : 0), 4, GALLOP);
      }
      m.fireT -= dt;
      m.aimT -= dt;
      const near = Math.hypot(m.x - trainC.x, m.z - trainC.z) < 550;
      if ((u.state === 'harass' || near) && m.fireT <= 0) {
        if (this.fireAt(m, false)) m.aimT = 1;
        m.fireT = 4 + Math.random() * 4;
      }
    }
    m.x += vx * speed * dt;
    m.z += vz * speed * dt;
    m.heading = Math.atan2(-vz, vx);
    m.s.setPose(m.aimT > 0 ? 'rideAim' : 'ride');
    const h = m.horse;
    const y = this.terrain.heightAt(m.x, m.z);
    h.baseY = y;
    h.root.position.set(m.x, y, m.z);
    const dh = Math.atan2(Math.sin(m.heading - h.root.rotation.y), Math.cos(m.heading - h.root.rotation.y));
    h.root.rotation.y += dh * Math.min(1, dt * 4);
    h.update(dt, speed);
    // 騎手在馬上時，上身轉向列車
    if (m.aimT > 0) m.s.lookTarget = new THREE.Vector3(trainC.x, trainC.y, trainC.z);
    else m.s.lookTarget = null;
    m.s.update(dt, 0);
    h.saddle.getWorldPosition(m.center);
    m.center.y += 0.55;
    m.radius = 0.45;
    m.horseCenter = h.root.position.clone().setY(y + 1.2);
  }

  updateDead(m, dt) {
    m.deadT += dt;
    if (m.horse && m.horse.dead > 0) {
      m.horse.dead += dt * 1.5;
      m.horse.update(dt, 0);
    } else if (m.horse) {
      // 失去騎手的馬跑走
      m.x += Math.cos(m.horse.root.rotation.y) * 11 * dt;
      m.z -= Math.sin(m.horse.root.rotation.y) * 11 * dt;
      const y = this.terrain.heightAt(m.x, m.z);
      m.horse.baseY = y;
      m.horse.root.position.set(m.x, y, m.z);
      m.horse.update(dt, 11);
      if (m.deadT > 8) {
        this.scene.remove(m.horse.root);
        m.horse = null;
      }
    }
    if (m.s.root.parent === this.scene) m.s.update(dt, 0);
    if (m.deadT > 90) this.remove(m);
  }

  place(m, dt, speed) {
    const s = m.s;
    const y = this.terrain.heightAt(m.x, m.z);
    s.baseY = y;
    s.root.position.x = m.x;
    s.root.position.z = m.z;
    const dh = Math.atan2(Math.sin(m.heading - s.root.rotation.y), Math.cos(m.heading - s.root.rotation.y));
    s.root.rotation.y += dh * Math.min(1, dt * 5);
    s.update(dt, speed);
    const pose = s.pose;
    m.center.set(m.x, y + (pose === 'prone' ? 0.25 : pose === 'crouchAim' ? 0.7 : 1.0), m.z);
    m.radius = pose === 'prone' ? 0.55 : 0.45;
  }

  // 視線檢查：忽略槍口前 35 m 的地面起伏（射手會選稍高處或越過小土丘射擊）
  hasLos(from, dir, dist) {
    if (dist < 40) return true;
    const o = from.clone().addScaledVector(dir, 35);
    o.y = Math.max(o.y, this.terrain.heightAt(o.x, o.z) + 0.8);
    const d2 = to(from, dir, dist).sub(o);
    const len = d2.length();
    const hit = this.terrain.raycast(o, d2.normalize(), len);
    return hit == null || hit > len - 8;
  }

  // 找看得到列車的射擊位置：在預定距離前後試幾個點
  findSlot(trainC, along, side, dist) {
    for (const dd of [0, -60, 60, -120, 120, -180]) {
      const p = this.trackPoint(trainC.x + along, side, Math.max(250, dist + dd));
      const eye = new THREE.Vector3(p.x, this.terrain.heightAt(p.x, p.z) + 0.6, p.z);
      const dir = trainC.clone().sub(eye);
      const len = dir.length();
      if (this.hasLos(eye, dir.normalize(), len)) return { x: p.x, z: p.z };
    }
    const p = this.trackPoint(trainC.x + along, side, dist);
    return { x: p.x, z: p.z };
  }

  awayDir(m) {
    const cx = clamp(m.x, TRACK_X0, TRACK_X1);
    const dz = m.z - trackZ(cx);
    return { x: 0.25, z: Math.sign(dz) || 1 };
  }

  trainCenter(out) {
    const t = this.train;
    const mid = t.cars[4].group.position;
    return out.copy(mid).setY(mid.y + 2);
  }

  // ── 射擊 ──
  // 目標：暴露在外的玩家（較優先）或最近的車廂
  fireAt(m, burst) {
    const g = this.game;
    const s = m.s;
    const from = this._w.set(m.x, 0, m.z);
    let car = null;
    let best = 1e9;
    for (const c of this.train.cars) {
      const d = c.group.position.distanceTo(from.setY(c.group.position.y));
      if (d < best) {
        best = d;
        car = c;
      }
    }
    if (best > RIFLE_RANGE) return false;
    const muzzle = new THREE.Vector3();
    if (m.horse) m.horse.saddle.getWorldPosition(muzzle).add(new THREE.Vector3(0, 0.9, 0));
    else muzzle.set(m.x, s.baseY + (s.pose === 'prone' ? 0.55 : s.pose === 'crouchAim' ? 1.05 : 1.45), m.z);
    let aim;
    let aimPlayer = false;
    const p = g.player;
    const r = Math.random();
    const exposedCrew = g.crew.members.filter((c) => c.alive && c.exposed);
    if (p.exposed && g.mode === 'walk' && r < 0.55) {
      aim = g.camera.position.clone().add(new THREE.Vector3(0, -0.4, 0));
      aimPlayer = true;
    } else if (r < (burst ? 0.6 : 0.35) && car.mgs.length) {
      // 瞄準槍眼（機槍球形槍架）
      const mg = car.mgs[Math.floor(Math.random() * car.mgs.length)];
      aim = mg.base.getWorldPosition(new THREE.Vector3());
    } else if (r < 0.6 && exposedCrew.length) {
      // 瞄準敞頂砲座裡的乘員
      const c = exposedCrew[Math.floor(Math.random() * exposedCrew.length)];
      aim = g.crew.sphere(c, new THREE.Vector3());
    } else {
      aim = new THREE.Vector3((Math.random() - 0.5) * car.len * 0.8, 1.6 + Math.random() * 1.6, 0).applyMatrix4(car.group.matrixWorld);
    }
    const dir = aim.clone().sub(muzzle);
    const dist = dir.length();
    dir.normalize();
    // 地形遮蔽
    if (!this.hasLos(muzzle, dir, dist)) return false;
    const shots = burst ? 8 : 1;
    // 瞄準車外的人時較專注（散布較小）
    const spread = ((m.horse ? 7 : burst ? 4.5 : 2.5) + dist / 300) * (aimPlayer && p.level === 'ground' ? 0.6 : 1);
    const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
    // 彈道下墜補償：依步槍彈的彈道解（每 50 m 一格的表）
    const lift = this.elevation(dist);
    for (let i = 0; i < shots; i++) {
      const d = dir.clone().addScaledVector(UP, lift + fromMil(gaussian() * spread)).addScaledVector(side, fromMil(gaussian() * spread)).normalize();
      const delay = i * 0.12;
      const fire = () => {
        g.projectiles.spawn({ pos: muzzle, vel: d.multiplyScalar(ENEMY_RIFLE.shells[0].v0), k: WEAPONS.type92.C, kind: 'bullet', shell: ENEMY_RIFLE.shells[0], weapon: ENEMY_RIFLE, tracer: burst ? 'enemy' : false, side: 'enemy', source: m });
        g.effects.muzzleFlash(muzzle, d.clone().normalize(), 0.18);
        g.audio.play(burst ? 'mg' : 'rifle', muzzle, 0.9);
      };
      if (delay) setTimeout(() => this.members.includes(m) && m.alive && fire(), delay * 1000);
      else fire();
    }
    return true;
  }

  elevation(dist) {
    if (!this.elevTable) {
      this.elevTable = [];
      for (let r = 0; r <= 1500; r += 50) {
        this.elevTable.push(r === 0 ? 0 : elevationForRange(r, ENEMY_RIFLE.shells[0].v0, WEAPONS.type92.C, { dt: 0.01 }) ?? 0.05);
      }
    }
    const f = clamp(dist / 50, 0, this.elevTable.length - 1.001);
    const i = Math.floor(f);
    return this.elevTable[i] + (this.elevTable[i + 1] - this.elevTable[i]) * (f - i);
  }

  // ── 命中 ──
  segmentHit(a, b) {
    const ab = this._w.subVectors(b, a);
    const len2 = ab.lengthSq();
    let best = null;
    const test = (m, c, r, part) => {
      if (Math.min(a.x, b.x) > c.x + r + 1 || Math.max(a.x, b.x) < c.x - r - 1) return;
      if (Math.min(a.z, b.z) > c.z + r + 1 || Math.max(a.z, b.z) < c.z - r - 1) return;
      const k = len2 > 0 ? clamp(new THREE.Vector3().subVectors(c, a).dot(ab) / len2, 0, 1) : 0;
      const p = a.clone().addScaledVector(ab, k);
      if (p.distanceTo(c) <= r && (!best || k < best.k)) best = { target: m, point: p, k, part };
    };
    for (const m of this.members) {
      if (!m.alive) continue;
      test(m, m.center, m.radius, 'man');
      if (m.horse && m.horseCenter) test(m, m.horseCenter, 0.75, 'horse');
    }
    return best;
  }

  raycast(origin, dir, maxDist) {
    let best = null;
    const oc = new THREE.Vector3();
    for (const m of this.members) {
      if (!m.alive) continue;
      oc.subVectors(m.center, origin);
      const along = oc.dot(dir);
      if (along < 0 || along > maxDist) continue;
      const d2 = oc.lengthSq() - along * along;
      const r = m.horse ? 1.2 : m.radius + 0.3;
      if (d2 > r * r) continue;
      if (!best || along < best.dist) best = { dist: along, target: m };
    }
    return best;
  }

  // 砲彈爆炸：殺傷半徑與壓制
  applyImpact(point, proj, direct, part) {
    const out = { hit: false, killed: [] };
    if (direct && direct.alive) {
      out.hit = true;
      this.kill(direct, part === 'horse', out);
    }
    if (proj.kind === 'shell') {
      const he = proj.shell.he;
      const big = proj.weapon?.id === 'type14';
      const lethal = he ? (big ? 7 : 5) : 1.5;
      const reach = he ? (big ? 20 : 14) : 3;
      for (const m of this.members) {
        if (!m.alive || m === direct) continue;
        const c = m.horse ? m.horseCenter ?? m.center : m.center;
        const d = c.distanceTo(point);
        if (d < 35) m.suppressed = Math.max(m.suppressed, 6);
        const prone = m.s.pose === 'prone';
        const p = d < lethal ? 1 : d < reach ? (1 - (d - lethal) / (reach - lethal)) * (prone ? 0.45 : 0.8) : 0;
        if (p > 0 && Math.random() < p) {
          out.hit = true;
          this.kill(m, !!m.horse && Math.random() < 0.5, out);
        }
      }
    } else if (!direct) {
      // 機槍彈落在附近也有壓制效果
      for (const m of this.members) {
        if (m.alive && m.center.distanceTo(point) < 7) m.suppressed = Math.max(m.suppressed, 3.5);
      }
    }
    return out;
  }

  kill(m, horseHit, out) {
    m.alive = false;
    m.deadT = 0;
    this.killed++;
    out.killed.push(m);
    const s = m.s;
    if (m.horse) {
      // 騎手落馬：放到地上
      const p = new THREE.Vector3();
      m.horse.saddle.getWorldPosition(p);
      this.scene.attach(s.root);
      const y = this.terrain.heightAt(p.x, p.z);
      s.root.position.set(p.x + (Math.random() - 0.5) * 2, y, p.z + (Math.random() - 0.5) * 2);
      s.root.rotation.set(0, Math.random() * 6.28, 0);
      s.baseY = y;
      m.x = m.horse.root.position.x;
      m.z = m.horse.root.position.z;
      if (horseHit) m.horse.dead = 0.01;
    }
    s.setPose('dead');
    this.game.emit('enemyKilled', { member: m, unit: m.unit });
  }

  remove(m) {
    if (m.s.root.parent) m.s.root.parent.remove(m.s.root);
    if (m.horse) this.scene.remove(m.horse.root);
    m.alive = false;
    const i = this.members.indexOf(m);
    if (i >= 0) this.members.splice(i, 1);
  }

  // 給 AI 軍士找目標
  targetsNear(pos, maxDist) {
    return this.members.filter((m) => m.alive && m.center.distanceTo(pos) < maxDist);
  }

  clear() {
    for (const m of [...this.members]) this.remove(m);
    this.units = [];
  }
}
