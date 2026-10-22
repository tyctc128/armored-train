import * as THREE from 'three';
import { Soldier } from './soldier.js';
import { FLOOR_Y } from '../train/carModels.js';

const L = Math.PI / 2; // 面向左側牆（-Z）
const R = -Math.PI / 2; // 面向右側牆（+Z）

// 指揮車的固定乘員（車廂本地座標）
const COMMAND_ROSTER = [
  { variant: 'officer', name: '副官 山田中尉', x: 1.25, z: -0.55, yaw: L, pose: 'map',
    lines: ['報告指揮官，路線圖已標好。', '各車回報已就位！', '請指揮官下令。'] },
  { variant: 'crew', name: '傳令兵 佐藤一等兵', x: 4.0, z: 0.85, yaw: 0, pose: 'telegraph',
    lines: ['傳令鐘待命中！', '司機回報鍋爐壓力正常。'] },
  { variant: 'crew', name: '通信兵 鈴木上等兵', x: -1.6, z: -1.02, yaw: L + 0.6, pose: 'sitWork',
    lines: ['各車電話線路正常。', '火砲車丙回報：測距儀已校正。'] },
  { variant: 'crew', name: '無線電兵 高橋一等兵', x: -3.6, z: 0.72, yaw: R, pose: 'operate',
    lines: ['本部暫無新電報。', '收訊良好！'] },
  { variant: 'soldier', name: '哨兵 中村二等兵', walker: { x0: -5.6, x1: 5.2, z: 0.32 }, pose: 'stand',
    lines: ['指揮官好！', '巡視車內，一切正常！'] },
];

const SURNAMES = ['小林', '加藤', '吉田', '山口', '松本', '井上', '木村', '林', '清水', '山崎', '森', '池田', '橋本', '阿部', '石川', '前田', '藤田', '岡田', '後藤', '長谷川'];
const RANKS = ['二等兵', '一等兵', '上等兵', '伍長'];

// 列車乘員：各崗位的軍士（由 CrewAI 操作）＋指揮車人員
export class Crew {
  constructor(train, templates, game) {
    this.train = train;
    this.game = game;
    this.tpl = templates;
    this.members = [];
    this.reserves = 6;   // 預備兵（可遞補陣亡的崗位）
    this.casualties = 0;
    this._v = new THREE.Vector3();
    let nameIdx = 0;
    const nextName = (role) => `${role} ${SURNAMES[nameIdx++ % SURNAMES.length]}${RANKS[nameIdx % RANKS.length]}`;

    for (const car of train.cars) {
      if (car.kind === 'command') for (const def of COMMAND_ROSTER) this.add(car, def);
      for (const st of car.stations) {
        if (!st.obj && st.type !== 'locked') continue;
        const side = Math.sign(st.lat) || -1;
        if (st.type === 'mg') {
          // 機槍手站在槍架內側，面向射擊方向
          const yaw = st.ref.center;
          const bp = st.ref.base.position;
          this.add(car, { variant: 'soldier', name: nextName('機槍手'), x: bp.x - Math.cos(yaw) * 0.62, z: bp.z + Math.sin(yaw) * 0.62, yaw, pose: 'operate', station: st.obj,
            lines: ['射界內無敵蹤！', '保彈板充足！', '隨時可以射擊！'] });
        } else if (st.type === 'gun') {
          this.add(car, { variant: 'crew', name: nextName('砲手'), x: st.x - 0.25, z: -0.55, yaw: 0, pose: 'lookUp', station: st.obj,
            lines: ['十糎砲待命！', '榴弾已備妥！'] });
          this.add(car, { variant: 'crew', name: nextName('裝填手'), x: st.x + 2.2, z: 0.62, yaw: 0, pose: 'carry', loader: st.obj,
            lines: ['砲彈搬運中！'] });
        } else if (st.type === 'rangefinder') {
          this.add(car, { variant: 'crew', name: nextName('測距手'), x: st.x - 0.1, z: 0.45, yaw: 0, pose: 'lookUp', station: st.obj,
            lines: ['測距儀已校正！', '標記目標後我會精確測距。'] });
        } else if (st.type === 'locked' && car.kind === 'gunC') {
          // 敞頂七糎砲塔內的砲組（暴露位置）
          for (const dz of [-0.7, 0.7]) {
            this.add(car, { variant: 'soldier', name: nextName('七糎砲手'), x: st.x + 0.4, z: dz, y: car.roofY + 0.22, yaw: Math.PI, pose: 'operate', exposed: true,
              lines: ['七糎砲待命！'] });
          }
        } else if (st.type === 'locked' && car.kind === 'power') {
          // 敞頂迫砲座的砲組（暴露位置）
          for (const dz of [-0.75, 0.75]) {
            this.add(car, { variant: 'soldier', name: nextName('迫砲手'), x: st.x + 0.3, z: dz, yaw: Math.PI, pose: 'stand', exposed: true,
              lines: ['迫砲待命！'] });
          }
        }
      }
    }
  }

  add(car, def) {
    const tpl = this.tpl[`npc_${def.variant}`];
    if (!tpl) return null;
    const s = new Soldier(tpl, { pose: def.pose, name: def.name, variant: def.variant });
    const m = {
      def, car, s, name: def.name,
      x: def.walker ? def.walker.x0 : def.x, z: def.walker ? def.walker.z : def.z, y: def.y ?? FLOOR_Y,
      dir: 1, wait: 0, cooldown: 0, near: false, alive: true, exposed: !!def.exposed,
      station: def.station ?? null, loader: def.loader ?? null, deadT: 0,
    };
    s.baseY = m.y;
    s.root.position.set(m.x, m.y, m.z);
    s.root.rotation.y = def.yaw ?? 0;
    car.group.add(s.root);
    this.members.push(m);
    return m;
  }

  // 崗位上的軍士（活著才算）
  operatorOf(station) {
    return this.members.find((m) => m.station === station && m.alive) ?? null;
  }

  // 世界座標的命中球（給敵彈判定）
  sphere(m, out) {
    out.set(m.x, m.y + 1.1, m.z).applyMatrix4(m.car.group.matrixWorld);
    return out;
  }

  // 車廂被擊穿時，附近的乘員可能傷亡
  woundNear(car, local, radius, chance) {
    const hit = this.members.filter((m) => m.alive && m.car === car && Math.hypot(m.x - local.x, m.z - local.z) < radius);
    for (const m of hit) if (Math.random() < chance) this.kill(m);
    return hit.length;
  }

  kill(m) {
    if (!m.alive) return;
    m.alive = false;
    m.deadT = 0;
    this.casualties++;
    m.s.setPose(m.exposed ? 'dead' : 'wounded');
    this.game.message(`${m.name} 中彈倒下！`, 'alert');
    this.game.emit('crewDown', { member: m });
    // 預備兵遞補（約 25 秒）
    if ((m.station || m.exposed) && this.reserves > 0) {
      this.reserves--;
      m.replaceT = 25;
    }
  }

  update(dt) {
    const g = this.game;
    const player = g.player;
    const w = player.where();
    const eye = this._v;
    const pIdx = w ? this.train.cars.indexOf(w.car) : -1;
    this.talkCooldown = (this.talkCooldown ?? 0) - dt;
    for (const m of this.members) {
      const { def, s } = m;
      // 只在玩家附近的車廂顯示（車內的人從外面看不到），暴露位置的人永遠顯示
      const idx = this.train.cars.indexOf(m.car);
      s.root.visible = m.exposed || (g.mode === 'walk' && Math.abs(idx - pIdx) <= 1);
      if (!m.alive) {
        m.deadT += dt;
        if (m.replaceT != null) {
          m.replaceT -= dt;
          if (m.replaceT <= 0) {
            m.replaceT = null;
            m.alive = true;
            m.name = m.name.replace(/\S+$/, '預備兵');
            s.setPose(def.pose);
            g.message(`預備兵遞補：${m.car.name} ${def.name.split(' ')[0]}`, 'radio');
          }
        }
        s.update(dt, 0);
        continue;
      }
      let speed = 0;
      if (def.walker) {
        if (m.wait > 0) {
          m.wait -= dt;
          if (m.wait <= 0) m.dir = -m.dir;
        } else {
          const goal = m.dir > 0 ? def.walker.x1 : def.walker.x0;
          const step = 1.1 * dt;
          if (Math.abs(goal - m.x) <= step) {
            m.x = goal;
            m.wait = 2.5;
          } else {
            m.x += Math.sign(goal - m.x) * step;
            speed = 1.1;
          }
        }
        const face = m.wait > 0 ? (m.dir > 0 ? Math.PI : 0) : m.dir > 0 ? 0 : Math.PI;
        s.root.rotation.y += Math.atan2(Math.sin(face - s.root.rotation.y), Math.cos(face - s.root.rotation.y)) * Math.min(1, dt * 5);
      }
      // 玩家接手崗位時讓位、立正待命
      if (m.station) {
        const taken = g.mode === 'station' && g.station === m.station;
        const tx = taken ? def.x + 0.9 : def.x;
        const tz = taken ? Math.sign(def.z || 1) * 0.45 : def.z;
        m.x += (tx - m.x) * Math.min(1, dt * 3);
        m.z += (tz - m.z) * Math.min(1, dt * 3);
        if (Math.abs(tx - m.x) > 0.05) speed = 0.8;
        s.setPose(taken ? 'attention' : m.firing ? def.pose : def.pose);
      }
      s.root.position.set(m.x, m.y, m.z);
      s.baseY = m.y;

      // 指揮官靠近：轉頭注視、敬禮、報告
      m.cooldown -= dt;
      const sameCar = w && w.car === m.car && g.mode === 'walk' && player.level === 'in';
      const dist = sameCar ? Math.hypot(w.x - m.x, player.lat - m.z) : Infinity;
      const near = dist < 2.3;
      if (near) {
        g.camera.getWorldPosition(eye);
        s.lookTarget = eye.clone();
        if (!m.near && m.cooldown <= 0) {
          if (!def.pose.startsWith('sit') && !m.station) s.salute();
          if (this.talkCooldown <= 0) {
            const line = def.lines[Math.floor(Math.random() * def.lines.length)];
            g.message(`${m.name}：「${line}」`, 'radio');
            this.talkCooldown = 5;
          }
          m.cooldown = 25;
        }
      } else {
        s.lookTarget = null;
      }
      m.near = near;
      if (s.root.visible) s.update(dt, speed);
    }
  }
}
