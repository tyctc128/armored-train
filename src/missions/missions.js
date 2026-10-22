// 關卡定義與任務流程。第一關是教學（src/tutorial），第二關起由 MissionRunner 執行。

export const LEVELS = [
  { id: 1, name: '試驗運行', sub: '教學關：學會移動、指揮、機槍、測距與主砲', ready: true },
  { id: 2, name: '沿線巡邏', sub: '指揮軍士擊退騎兵與步兵的襲擾，抵達終點站', ready: true },
  { id: 3, name: '斷軌', sub: '工兵炸毀鐵軌，在敵火下下車搶修', ready: false },
  { id: 4, name: '山谷伏擊', sub: '敵軍躲在稜線後，以迫砲與觀測修正反擊', ready: false },
  { id: 5, name: '鋼鐵對決', sub: '迎戰敵方裝甲列車', ready: false },
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
        st.unit = c.enemies.spawnCavalry({ x: trainX(c) + 450, side: -1, dist: 850, count: 8, name: '北方敵騎兵' });
      },
      text: (c, st) => `擊退北方騎兵${unitText(st.unit)}`,
      hint: '機槍手會自動射擊；你也可以親自操作左側機槍，或下令十糎砲自由射擊。',
      done: (c, st) => unitDone(st.unit),
    },
    {
      enter: (c, st) => {
        c.radio('本部', '南側村落附近有敵步兵一個班，配有輕機槍。建議停車，以主砲掃蕩。');
        st.unit = c.enemies.spawnInfantry({ x: Math.min(trainX(c) + 650, 1300), side: 1, dist: 520, count: 10, lmg: 2, name: '南側敵步兵班' });
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
        st.a = c.enemies.spawnCavalry({ x: Math.min(trainX(c) + 400, 1450), side: 1, dist: 850, count: 8, name: '南方敵騎兵' });
        st.b = c.enemies.spawnInfantry({ x: Math.min(trainX(c) + 700, 1450), side: -1, dist: 450, count: 8, lmg: 1, name: '北方敵步兵' });
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
    score -= stats.crewLost * 6;
    score -= stats.reservesUsed * 15;
    score -= Math.max(0, stats.minutes - 12) * 2;
    return score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 55 ? 'B' : score >= 40 ? 'C' : 'D';
  },
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
    if (type === 'playerDead' && data.final) this.finish(false, '指揮官陣亡');
  }

  update() {
    if (!this.active) return;
    const ph = this.def.phases[this.index];
    if (ph.done(this.ctx, this.state)) {
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
        <tr><th>擊退敵部隊</th><td>${c.enemies.repelled + c.enemies.units.filter((u) => u.state === 'gone').length}</td></tr>
        <tr><th>我方乘員傷亡</th><td>${stats.crewLost}</td></tr>
        <tr><th>車廂被擊穿</th><td>${c.damage.penetrations} 次</td></tr>
        <tr><th>使用預備士兵</th><td>${stats.reservesUsed}</td></tr>
        <tr><th>十糎砲發射</th><td>${c.game.stats.shots}</td></tr>
      </table>
      <p class="note">評等依乘員傷亡、預備士兵使用與完成時間計算。</p>
      <div class="brief-btns">
        <button class="start-btn" data-goto="level:${this.def.id}">重新挑戰</button>
        <button class="start-btn secondary" data-goto="menu">回到關卡選單</button>
      </div>`);
  }
}
