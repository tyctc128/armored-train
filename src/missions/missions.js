// 關卡定義與任務流程。第一關是教學（src/tutorial），第二關起由 MissionRunner 執行。
import * as THREE from 'three';
import { bearingMil, fmtMil } from '../core/math.js';

export const LEVELS = [
  { id: 1, name: '試驗運行', sub: '教學關：學會移動、指揮、機槍、測距與主砲', ready: true },
  { id: 2, name: '沿線巡邏', sub: '指揮軍士擊退騎兵與步兵的襲擾，抵達終點站', ready: true },
  { id: 3, name: '斷軌', sub: '工兵炸毀鐵軌，在敵火下下車搶修', ready: true },
  { id: 4, name: '山谷伏擊', sub: '敵軍躲在稜線後，以迫砲與觀測修正反擊', ready: true },
  { id: 5, name: '鋼鐵對決', sub: '迎戰敵方裝甲列車', ready: true },
];

const PROGRESS_KEY = 'armoredTrain.progress';

export function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY)) ?? { cleared: {} };
  } catch {
    return { cleared: {} };
  }
}

export function saveCleared(id, rank) {
  try {
    const p = loadProgress();
    const order = 'DCBAS';
    if (!p.cleared[id] || order.indexOf(rank) > order.indexOf(p.cleared[id])) p.cleared[id] = rank;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* 無法存檔時忽略 */
  }
}

const km = (c) => c.train.sFront / 1000;
const trainX = (c) => c.train.cars[4].group.position.x;
const unitDone = (u) => u && (u.state === 'retreat' || u.state === 'gone');
const unitText = (u) => (u ? `（擊斃 ${u.initial - u.members.filter((m) => m.alive).length}／${u.initial}）` : '');

// ── 第二關：沿線巡邏 ──
export const LEVEL2 = {
  id: 2,
  title: '沿線巡邏',
  intro: [
    ['本部', '第一裝甲列車隊注意：試驗線沿線出現敵軍騎兵與步兵襲擾，命你部巡邏至終點站。'],
    ['副官', '各崗位軍士已就位，機槍手會自行對射界內的敵人射擊。'],
    ['副官', '按 C 可以對乘員下令：例如讓十糎砲「自由射擊」或「砲擊選定目標」。'],
  ],
  phases: [
    {
      text: '以傳令鐘下令「半速」以上，向東出發巡邏',
      done: (c) => c.train.acknowledged >= 3,
    },
    {
      text: '巡邏前進至里程 0.7 km',
      done: (c) => km(c) >= 0.7,
    },
    {
      enter: (c, st) => {
        c.radio('觀測哨', '北方約 1 公里發現敵騎兵一個小隊，正朝鐵道衝來！');
        st.unit = c.enemies.spawnCavalry({ x: trainX(c) + 450, side: -1, dist: 750, count: 12, name: '北方敵騎兵' });
      },
      text: (c, st) => `擊退北方騎兵${unitText(st.unit)}`,
      hint: '機槍手會自動射擊；你也可以親自操作左側機槍，或下令十糎砲自由射擊。',
      done: (c, st) => unitDone(st.unit),
    },
    {
      enter: (c, st) => {
        c.radio('本部', '南側村落附近有敵步兵一個班，配有輕機槍。建議停車，以主砲掃蕩。');
        st.unit = c.enemies.spawnInfantry({ x: Math.min(trainX(c) + 650, 1300), side: 1, dist: 520, count: 12, lmg: 2, name: '南側敵步兵班' });
      },
      text: (c, st) => `殲滅或擊退南側敵步兵班${unitText(st.unit)}`,
      hint: '先在指揮台用觀測鏡標記敵群（測距手會補上精確距離），再按 C 下令十糎砲「砲擊選定目標」。',
      done: (c, st) => unitDone(st.unit),
    },
    {
      text: '繼續巡邏前進至里程 2.0 km',
      done: (c) => km(c) >= 2.0,
    },
    {
      enter: (c, st) => {
        c.radio('觀測哨', '注意！南方騎兵、北方步兵同時接近，敵軍企圖夾擊！');
        st.a = c.enemies.spawnCavalry({ x: Math.min(trainX(c) + 400, 1450), side: 1, dist: 750, count: 10, name: '南方敵騎兵' });
        st.b = c.enemies.spawnInfantry({ x: Math.min(trainX(c) + 700, 1450), side: -1, dist: 450, count: 10, lmg: 2, name: '北方敵步兵' });
      },
      text: (c, st) => `擊退南北夾擊：騎兵${unitText(st.a)}、步兵${unitText(st.b)}`,
      done: (c, st) => unitDone(st.a) && unitDone(st.b),
    },
    {
      enter: (c) => c.radio('本部', '辛苦了。請駛抵終點站並停車。'),
      text: '抵達終點站（里程 3.0 km 以後）並停車',
      done: (c) => c.train.sFront >= c.train.track.length - 260 && Math.abs(c.train.speed) < 0.2,
    },
  ],
  rank(stats) {
    let score = 100;
    score -= stats.crewLost * 8;
    score -= stats.reservesUsed * 15;
    score -= Math.max(0, stats.minutes - 8) * 4;
    return score >= 94 ? 'S' : score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';
  },
  rankNote: '評等依乘員傷亡、預備士兵使用與完成時間計算（8 分鐘內、零傷亡才有 S）。',
};

// ── 第三關：斷軌 ──
const BREAK_S = 1850; // 斷軌位置（弧長，約里程 1.85 km）
const toBreak = (c) => BREAK_S - c.train.sFront;

export const LEVEL3 = {
  id: 3,
  title: '斷軌',
  intro: [
    ['本部', '第一裝甲列車隊注意：有情報指出敵工兵潛入試驗線沿線，企圖破壞鐵道。命你部巡邏至終點站。'],
    ['副官', '鐵軌一旦被炸斷，司機要到 150 m 內才看得清楚斷口；車速太快會來不及停車而出軌。'],
    ['副官', '列車停下後，在車廂連接處按 E 就能下車。修軌只能靠指揮官親自動手，請先讓機槍和十糎砲壓制敵人。'],
  ],
  phases: [
    {
      text: '以傳令鐘下令「微速」以上，向東出發巡邏',
      done: (c) => c.train.acknowledged >= 2,
    },
    {
      text: '巡邏前進，注意前方鐵道',
      hint: '建議以「半速」前進：全速時，司機發現斷軌也來不及停車。',
      done: (c) => toBreak(c) < 700,
    },
    {
      enter: (c, st) => {
        c.railBreak.blow(BREAK_S);
        c.train.setBlock(BREAK_S);
        const p = c.railBreak.pos;
        st.eng = c.enemies.spawnInfantry({ x: p.x, side: -1, dist: 25, count: 4, lmg: 0, name: '敵工兵', approach: 0 });
        st.eng.members.forEach((m, i) => {
          m.x = p.x + (i - 1.5) * 4;
          m.z = p.z - 12 - Math.random() * 8;
        });
        st.eng.state = 'retreat';
        st.eng.retreatT = 0;
        setTimeout(() => c.radio('觀測哨', '前方約 700 m 發生爆炸！鐵軌被炸斷了，敵工兵正往北方逃離！'), 900);
        setTimeout(() => c.radio('副官', '立即減速停車！'), 4200);
      },
      text: (c) => `在斷軌處前停車（距斷口 ${Math.max(0, Math.round(toBreak(c)))} m）`,
      hint: '用傳令鐘下令「停止」或「微速」：司機看到斷口後會自行煞車，停在斷口前約 15 m。停在 200 m 以內，才不用在敵火下走太遠。',
      done: (c) => Math.abs(c.train.speed) < 0.2 && toBreak(c) < 200,
    },
    {
      enter: (c, st) => {
        const p = c.railBreak.pos;
        c.radio('觀測哨', '伏擊！南北兩側都有敵步兵，正朝斷軌處接近！');
        st.a = c.enemies.spawnInfantry({ x: p.x - 80, side: -1, dist: 430, count: 10, lmg: 2, name: '北側伏兵' });
        st.b = c.enemies.spawnInfantry({ x: p.x + 40, side: 1, dist: 560, count: 8, lmg: 1, name: '南側伏兵' });
        setTimeout(() => c.radio('副官', '在車廂連接處按 E 下車，到紅旗標示的斷口按住 E 修理。修理時你完全暴露，請先壓制敵人！'), 4000);
      },
      text: (c) => `下車修復斷軌（進度 ${Math.round(c.railBreak.progress * 100)}%）`,
      hint: '先按 C 讓機槍、十糎砲壓制伏兵（也可以在指揮台標記目標）。再走到車廂連接處（車廂之間）按 E 下車，到斷口按住 E 修理。受傷時修理變慢。',
      done: (c, st) => {
        // 修到三成時敵軍反撲：步兵在鐵道正前方占領陣地，只有車頭的機槍射得到
        if (!st.c && c.railBreak.progress >= 0.35) {
          const p = c.railBreak.pos;
          c.radio('觀測哨', '鐵道正前方約 400 m 又有敵步兵占領陣地，目標是修軌的人！');
          setTimeout(() => c.radio('副官', '指揮官，先放開工具躲到車廂後面！等警戒車的機槍壓制他們再修！'), 3000);
          st.c = c.enemies.spawnInfantry({ x: p.x + 370, side: -1, dist: 35, count: 12, lmg: 3, name: '前方反撲敵兵', approach: 30, fixed: true });
        }
        return !c.railBreak.broken;
      },
    },
    {
      enter: (c) => {
        c.train.setBlock(null);
        c.radio('副官', '鐵軌修好了！請盡快回到車上。');
      },
      text: '回到列車上（在車廂連接處旁按 E 上車）',
      done: (c) => c.player.level !== 'ground',
    },
    {
      enter: (c) => c.radio('本部', '辛苦了。繼續巡邏，向終點站前進。'),
      text: '以傳令鐘下令前進，通過修好的路段',
      done: (c) => c.train.sFront > BREAK_S + 60,
    },
    {
      enter: (c, st) => {
        c.radio('觀測哨', '南方發現敵騎兵，正朝鐵道衝來！');
        st.unit = c.enemies.spawnCavalry({ x: Math.min(trainX(c) + 380, 1450), side: 1, dist: 750, count: 10, name: '南方敵騎兵' });
      },
      text: (c, st) => `擊退南方騎兵${unitText(st.unit)}`,
      done: (c, st) => unitDone(st.unit),
    },
    {
      enter: (c) => c.radio('本部', '請駛抵終點站並停車。'),
      text: '抵達終點站（里程 3.0 km 以後）並停車',
      done: (c) => c.train.sFront >= c.train.track.length - 260 && Math.abs(c.train.speed) < 0.2 && c.player.level !== 'ground',
    },
  ],
  rank(stats) {
    let score = 100;
    score -= stats.crewLost * 8;
    score -= stats.reservesUsed * 15;
    score -= Math.max(0, stats.minutes - 10) * 4;
    return score >= 94 ? 'S' : score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';
  },
  rankNote: '評等依乘員傷亡、預備士兵使用與完成時間計算（10 分鐘內、零傷亡才有 S）。',
};

// ── 第四關：山谷伏擊 ──
// 敵迫砲陣地在鐵道北方約 1.4 km 的稜線後方（從鐵道看不到）
const BATTERY = [
  { x: 340, z: -1320 },
  { x: 362, z: -1315 },
];
const batteryText = (c) => `（擊毀 ${c.battery.destroyed}／${c.battery.total}）`;

// 觀測哨回報彈著偏差：以「迫砲→目標」為射向，遠近、左右（公尺），並換算方位密位
function spotReport(c, point) {
  const st = c.mortar;
  const m = st.ref.node.getWorldPosition(new THREE.Vector3());
  let tgt = null;
  let best = 1e9;
  for (const g of c.battery.guns) {
    if (!g.alive) continue;
    const d = Math.hypot(point.x - g.pos.x, point.z - g.pos.z);
    if (d < best) {
      best = d;
      tgt = g;
    }
  }
  if (!tgt) return null;
  if (best > 600) return '彈著不明，未能觀測';
  const ux = tgt.pos.x - m.x;
  const uz = tgt.pos.z - m.z;
  const L = Math.hypot(ux, uz);
  const ex = point.x - tgt.pos.x;
  const ez = point.z - tgt.pos.z;
  const over = (ex * ux + ez * uz) / L;
  const right = (ex * -uz + ez * ux) / L;
  const r10 = (v) => Math.round(Math.abs(v) / 10) * 10;
  if (Math.hypot(over, right) < 12) return '彈著良好，就在目標附近！保持諸元，繼續射擊！';
  const mil = Math.round(Math.abs(right) / (L / 1000));
  return `${over > 0 ? '遠' : '近'} ${r10(over)} m、${right > 0 ? '右' : '左'} ${r10(right)} m（方位約 ${mil} 密位）`;
}

export const LEVEL4 = {
  id: 4,
  title: '山谷伏擊',
  intro: [
    ['本部', '第一裝甲列車隊注意：前方山谷一帶有敵軍活動，命你部巡邏至終點站。'],
    ['副官', '山谷北側是連綿的稜線，敵人若躲在後面，十糎砲直接瞄準打不到。'],
    ['副官', '電源車後段的九七式曲射歩兵砲可以曲射越過稜線。友軍觀測哨在高地上，會回報彈著。'],
  ],
  phases: [
    {
      text: '以傳令鐘下令「微速」以上，向東出發巡邏',
      done: (c) => c.train.acknowledged >= 2,
    },
    {
      text: '巡邏前進，進入山谷',
      done: (c) => c.train.sFront >= 1450,
    },
    {
      enter: (c, st) => {
        c.battery.spawn(BATTERY, { interval: 22, firstDelay: 3 });
        c.radio('觀測哨', '注意！北方稜線後方有敵迫砲陣地，正在對列車試射！');
        st.intelT = 7;
      },
      text: (c) => `停車，以迫砲擊毀稜線後的敵迫砲陣地${batteryText(c)}`,
      hint: '① 停車　② 按 8 走到電源車後段迫砲座，按 E 上崗　③ 用 [ ] 選目標簿的「觀測哨」目標，按 F 裝定　④ 左鍵發射　⑤ 依觀測哨回報修正：遠就按 S 減距離、右就按 A 往左修方位。列車移動時敵人要重新試射，但迫砲只能停車射擊。',
      done: (c, st, dt) => {
        // 觀測哨報告敵陣位置（記入目標簿；誤差約 ±60 m）
        if (st.intelT != null) {
          st.intelT -= dt;
          if (st.intelT <= 0) {
            st.intelT = null;
            const cx = (BATTERY[0].x + BATTERY[1].x) / 2 + (Math.random() - 0.5) * 120;
            const cz = (BATTERY[0].z + BATTERY[1].z) / 2 + (Math.random() - 0.5) * 120;
            const m = c.mortar.ref.node.getWorldPosition(new THREE.Vector3());
            const e = c.game.targetBook.add({ bearing: bearingMil(cx - m.x, cz - m.z), range: Math.round(Math.hypot(cx - m.x, cz - m.z) / 50) * 50, method: '觀測哨', point: new THREE.Vector3(cx, 0, cz) });
            c.radio('觀測哨', `敵迫砲陣地：自迫砲座方位約 ${fmtMil(e.bearing)}、距離約 ${e.range} m。已記入目標簿 ${e.id}。`);
          }
        }
        // 第一門被毀或交戰 90 秒後，南側步兵前來牽制
        if (!st.inf && (c.battery.destroyed >= 1 || (st.t = (st.t ?? 0) + dt) > 90)) {
          c.radio('觀測哨', '南側山坡有敵步兵一個班下來了！');
          st.inf = c.enemies.spawnInfantry({ x: Math.min(trainX(c) + 200, 1400), side: 1, dist: 520, count: 10, lmg: 2, name: '南側敵步兵' });
        }
        return c.battery.destroyed >= c.battery.total;
      },
    },
    {
      enter: (c) => c.radio('觀測哨', '敵迫砲陣地全部沉默！幹得好！'),
      text: '抵達終點站（里程 3.0 km 以後）並停車',
      done: (c) => c.train.sFront >= c.train.track.length - 260 && Math.abs(c.train.speed) < 0.2 && c.player.level !== 'ground',
    },
  ],
  onEvent(c, type, data) {
    if (type === 'mortarImpact' && c.battery.active) {
      const text = data.destroyed ? '命中！敵迫砲一門被擊毀！' : spotReport(c, data.point);
      if (!text) return;
      c.mortar.report = text;
      setTimeout(() => c.radio('觀測哨', text), 1200);
    }
    if (type === 'batteryLost') c.game.message('列車移動了，敵迫砲需要重新試射', 'radio');
  },
  fail: (c) => (c.damage.penetrations >= 12 ? '列車遭敵砲火重創，無法繼續作戰' : null),
  rank(stats) {
    let score = 100;
    score -= stats.crewLost * 8;
    score -= stats.reservesUsed * 15;
    score -= stats.penetrations * 3;
    score -= Math.max(0, stats.minutes - 12) * 4;
    return score >= 94 ? 'S' : score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';
  },
  rankNote: '評等依乘員傷亡、預備士兵、車廂被擊穿次數與完成時間計算（12 分鐘內、零傷亡、未被擊穿才有 S）。',
};

// ── 第五關：鋼鐵對決 ──
export const LEVEL5 = {
  id: 5,
  title: '鋼鐵對決',
  intro: [
    ['本部', '急電！敵方裝甲列車一列自東方沿試驗線駛來，命你部迎擊，確保鐵道。'],
    ['副官', '敵車也有十糎級火砲。榴弾打不穿裝甲，對付敵車要用尖鋭弾；砲手接到砲擊敵車的命令時會自動改用尖鋭弾。'],
    ['副官', '先用測距儀或觀測鏡標記敵車，再按 C 下令兩門十糎砲「砲擊選定目標」。也可以親自上砲。'],
  ],
  phases: [
    {
      text: '以傳令鐘下令「微速」以上，向東出發',
      done: (c) => c.train.acknowledged >= 2,
    },
    {
      text: '前進至里程 0.9 km',
      done: (c) => c.train.sFront >= 900,
    },
    {
      enter: (c) => {
        c.enemyTrain.spawn({ s: c.train.track.length - 60, standoff: 1700 });
        c.radio('觀測哨', '東方鐵道上出現敵裝甲列車！距離約 2,300 m，正向我方駛來！');
        setTimeout(() => c.radio('副官', '建議停車迎戰：行進間射擊很難命中。'), 3500);
      },
      text: (c) => `擊毀敵裝甲列車（砲車 ${c.enemyTrain.gunsDestroyed}／2・全車 ${c.enemyTrain.carsDestroyed}／4）`,
      hint: '① 停車　② 到火砲車乙測距儀（按 3）測距，或在指揮台觀測鏡標記敵車　③ 按 C 下令甲砲、乙砲「砲擊選定目標」，或親自操作十糎砲（1 鍵尖鋭弾）　④ 兩節砲車都擊毀、或任意 3 節被毀，敵車就失去戰鬥力。正面對峙時後砲車會被前面的車擋住；擊毀敵指揮車可降低敵砲修正速度。目標被毀後要重新標記下一節。我方移動 50 m 以上，敵砲要重新試射。',
      done: (c, st, dt) => {
        // 第一節砲車被毀後，敵騎兵從南方襲擾
        if (!st.cav && c.enemyTrain.gunsDestroyed >= 1) {
          c.radio('觀測哨', '南方有敵騎兵趁機逼近！');
          st.cav = c.enemies.spawnCavalry({ x: Math.min(trainX(c) + 300, 1450), side: 1, dist: 750, count: 10, name: '南方敵騎兵' });
        }
        return c.enemyTrain.beaten;
      },
    },
    {
      enter: (c) => c.radio('本部', '敵裝甲列車已失去戰鬥力！幹得好！請擊退殘敵後停車待命。'),
      text: (c, st) => `肅清殘敵，停車待命${c.enemies.units.some((u) => !unitDone(u)) ? '（仍有敵部隊）' : ''}`,
      done: (c) => c.enemies.units.every((u) => unitDone(u)) && Math.abs(c.train.speed) < 0.2,
    },
  ],
  fail: (c) => (c.damage.penetrations >= 16 ? '列車遭敵砲擊穿過多，失去戰鬥力' : null),
  rank(stats) {
    let score = 100;
    score -= stats.crewLost * 6;
    score -= stats.reservesUsed * 15;
    score -= stats.penetrations * 3;
    score -= Math.max(0, stats.minutes - 12) * 4;
    return score >= 94 ? 'S' : score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';
  },
  rankNote: '評等依乘員傷亡、預備士兵、車廂被擊穿次數與完成時間計算（12 分鐘內、零傷亡、被擊穿 2 次以下才有 S）。',
};

// 任務執行：依序推進階段，顯示目標，判定成功與失敗
export class MissionRunner {
  constructor(ctx) {
    this.ctx = ctx;
    this.panel = document.getElementById('tutorial');
    this.active = false;
  }

  start(def) {
    const c = this.ctx;
    this.def = def;
    this.active = true;
    this.index = -1;
    this.startTime = c.game.time;
    this.startReserves = c.damage.reserves;
    this.panel.classList.remove('hidden');
    def.intro.forEach(([who, text], i) => setTimeout(() => c.radio(who, text), 800 + i * 3500));
    this.next();
  }

  next() {
    this.index++;
    const ph = this.def.phases[this.index];
    if (!ph) return this.finish(true);
    this.state = {};
    ph.enter?.(this.ctx, this.state);
    this.render();
  }

  onEvent(type, data) {
    if (!this.active) return;
    this.def.onEvent?.(this.ctx, type, data);
    if (type === 'playerDead' && data.final) this.finish(false, '指揮官陣亡');
    if (type === 'derailed') this.finish(false, '列車衝過斷軌處而出軌');
  }

  update(dt = 1 / 60) {
    if (!this.active) return;
    const reason = this.def.fail?.(this.ctx);
    if (reason) return this.finish(false, reason);
    const ph = this.def.phases[this.index];
    if (ph.done(this.ctx, this.state, dt)) {
      this.ctx.game.audio.play('bell', null, 0.35);
      this.next();
      return;
    }
    const text = typeof ph.text === 'function' ? ph.text(this.ctx, this.state) : ph.text;
    if (text !== this.lastText) this.render();
  }

  render() {
    const ph = this.def.phases[this.index];
    const text = typeof ph.text === 'function' ? ph.text(this.ctx, this.state) : ph.text;
    this.lastText = text;
    const list = this.def.phases
      .map((p, i) => {
        if (i > this.index) return '';
        const t = i === this.index ? text : typeof p.text === 'function' ? p.text(this.ctx, {}) .replace(/（.*）/, '') : p.text;
        return `<li class="${i < this.index ? 'ok' : 'now'}">${t}</li>`;
      })
      .join('');
    this.panel.innerHTML = `
      <div class="t-head"><span class="t-badge mission">任務</span>
        <div><b>第 ${this.def.id} 關　${this.def.title}</b><small>目標 ${this.index + 1}／${this.def.phases.length}</small></div></div>
      <div class="t-progress"><i style="width:${((this.index / this.def.phases.length) * 100).toFixed(1)}%"></i></div>
      <div class="t-step"><div class="t-num">目前目標</div><h3>${text}</h3>${ph.hint ? `<p>${ph.hint}</p>` : ''}</div>
      <ol class="t-list">${list}</ol>
      <div class="t-foot"><kbd>C</kbd> 乘員命令　<kbd>B</kbd> 目標簿　<kbd>H</kbd> 說明</div>`;
  }

  finish(success, reason = '') {
    if (!this.active) return;
    const c = this.ctx;
    this.active = false;
    const secs = Math.round(c.game.time - this.startTime);
    const stats = {
      minutes: secs / 60,
      crewLost: c.crew.casualties,
      reservesUsed: this.startReserves - c.damage.reserves,
      killed: c.enemies.killed,
      penetrations: c.damage.penetrations,
    };
    const rank = success ? this.def.rank(stats) : '—';
    if (success) saveCleared(this.def.id, rank);
    c.showDebrief(`
      <h2>第 ${this.def.id} 關　${this.def.title}　${success ? '任務完成' : '任務失敗'}</h2>
      <div class="t-rank${success ? '' : ' fail'}">${success ? rank : '✕'}</div>
      ${reason ? `<p style="text-align:center">${reason}</p>` : ''}
      <table class="t-stats">
        <tr><th>完成時間</th><td>${Math.floor(secs / 60)} 分 ${secs % 60} 秒</td></tr>
        <tr><th>擊斃敵軍</th><td>${stats.killed}</td></tr>
        <tr><th>擊退敵部隊</th><td>${c.enemies.units.filter((u) => u.state === 'gone' || u.state === 'retreat').length}／${c.enemies.units.length}</td></tr>
        <tr><th>我方乘員傷亡</th><td>${stats.crewLost}</td></tr>
        <tr><th>車廂被擊穿</th><td>${c.damage.penetrations} 次</td></tr>
        <tr><th>使用預備士兵</th><td>${stats.reservesUsed}</td></tr>
        <tr><th>${this.def.id === 4 ? '砲彈發射（十糎砲＋迫砲）' : '十糎砲發射'}</th><td>${c.game.stats.shots}</td></tr>
        ${this.def.id === 4 ? `<tr><th>擊毀敵迫砲</th><td>${c.battery.destroyed}／${c.battery.total}</td></tr>` : ''}
        ${this.def.id === 5 ? `<tr><th>敵裝甲列車</th><td>${c.enemyTrain.statusText()}</td></tr>` : ''}
      </table>
      <p class="note">${this.def.rankNote}</p>
      <div class="brief-btns">
        <button class="start-btn" data-goto="level:${this.def.id}">重新挑戰</button>
        <button class="start-btn secondary" data-goto="menu">回到關卡選單</button>
      </div>`);
  }
}
