import * as THREE from 'three';
import { Soldier } from './soldier.js';
import { FLOOR_Y } from '../train/carModels.js';

const L = Math.PI / 2; // 面向左側牆（-Z）
const R = -Math.PI / 2; // 面向右側牆（+Z）

// 各車廂的乘員配置（車廂本地座標）。目前只有指揮車；之後 AI 軍士會接手各崗位。
const ROSTER = {
  command: [
    { variant: 'officer', name: '副官 山田中尉', x: 1.25, z: -0.55, yaw: L, pose: 'map',
      lines: ['報告指揮官，路線圖已標好試驗區。', '本日風向穩定，適合試射。', '各車回報已就位！'] },
    { variant: 'crew', name: '傳令兵 佐藤一等兵', x: 4.0, z: 0.85, yaw: 0, pose: 'telegraph',
      lines: ['傳令鐘待命中！', '司機回報鍋爐壓力正常。'] },
    { variant: 'crew', name: '通信兵 鈴木上等兵', x: -1.6, z: -1.02, yaw: L + 0.6, pose: 'sitWork',
      lines: ['各車電話線路正常。', '火砲車丙回報：測距儀已校正。'] },
    { variant: 'crew', name: '無線電兵 高橋一等兵', x: -3.6, z: 0.72, yaw: R, pose: 'operate',
      lines: ['本部暫無新電報。', '收訊良好！'] },
    { variant: 'soldier', name: '機槍手 伊藤上等兵', x: -4.0, z: -0.92, yaw: L, pose: 'operate', station: { type: 'mg' },
      lines: ['左側無異狀！', '保彈板已備妥。'] },
    { variant: 'soldier', name: '哨兵 中村二等兵', walker: { x0: -5.6, x1: 5.2, z: 0.32 }, pose: 'stand',
      lines: ['指揮官好！', '巡視車內，一切正常！'] },
  ],
};

export class Crew {
  constructor(train, templates, game) {
    this.train = train;
    this.game = game;
    this.members = [];
    this._v = new THREE.Vector3();
    for (const car of train.cars) {
      for (const def of ROSTER[car.kind] ?? []) {
        const tpl = templates[`npc_${def.variant}`];
        if (!tpl) continue;
        const s = new Soldier(tpl, { pose: def.pose, name: def.name, variant: def.variant });
        const m = { def, car, s, x: def.walker ? def.walker.x0 : def.x, z: def.walker ? def.walker.z : def.z, dir: 1, wait: 0, cooldown: 0, near: false };
        if (def.station) m.station = car.stations.find((st) => st.type === def.station.type)?.obj ?? null;
        s.root.position.set(m.x, FLOOR_Y, m.z);
        s.root.rotation.y = def.yaw ?? 0;
        car.group.add(s.root);
        this.members.push(m);
      }
    }
  }

  update(dt) {
    const g = this.game;
    const player = g.player;
    const w = player.where();
    const eye = this._v;
    this.talkCooldown = (this.talkCooldown ?? 0) - dt;
    for (const m of this.members) {
      const { def, s } = m;
      let speed = 0;
      // 巡視：沿走道來回，兩端停一下
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
        const tz = taken ? Math.sign(def.z) * 0.45 : def.z;
        m.x += (tx - m.x) * Math.min(1, dt * 3);
        m.z += (tz - m.z) * Math.min(1, dt * 3);
        if (Math.abs(tx - m.x) > 0.05) speed = 0.8;
        s.setPose(taken ? 'attention' : def.pose);
      }
      s.root.position.set(m.x, FLOOR_Y, m.z);

      // 指揮官靠近：轉頭注視、敬禮、報告
      m.cooldown -= dt;
      const sameCar = w && w.car === m.car && g.mode === 'walk' && player.level === 'in';
      const dist = sameCar ? Math.hypot(w.x - m.x, player.lat - m.z) : Infinity;
      const near = dist < 2.3;
      if (near) {
        g.camera.getWorldPosition(eye);
        s.lookTarget = eye.clone();
        if (!m.near && m.cooldown <= 0) {
          if (!def.pose.startsWith('sit')) s.salute();
          // 同一時間只讓一人開口，避免訊息洗版
          if (this.talkCooldown <= 0) {
            const line = def.lines[Math.floor(Math.random() * def.lines.length)];
            g.message(`${def.name}：「${line}」`, 'radio');
            this.talkCooldown = 5;
          }
          m.cooldown = 25;
        }
      } else {
        s.lookTarget = null;
      }
      m.near = near;
      s.update(dt, speed);
    }
  }
}
