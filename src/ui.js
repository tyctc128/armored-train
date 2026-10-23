import { fmtMil } from './core/math.js';

const $ = (id) => document.getElementById(id);

// HUD、訊息、彈出視窗（射表、目標簿、說明、任務簡報）
export class UI {
  constructor() {
    this.status = $('status');
    this.score = $('score');
    this.weapon = $('weapon');
    this.prompt = $('prompt');
    this.messages = $('messages');
    this.dot = $('dot');
    this.modal = $('modal');
    this.modalBody = $('modal-body');
    this.pause = $('pause');
    this.loading = $('loading');
    this.loadingText = $('loading-text');
    this.modalName = null;
    this.cache = new Map();
    this.msgs = [];
  }

  set(el, html) {
    if (this.cache.get(el) === html) return;
    this.cache.set(el, html);
    el.innerHTML = html;
  }

  setLoading(text) {
    this.loadingText.textContent = text;
  }

  message(text, kind = '') {
    const div = document.createElement('div');
    div.className = `msg ${kind}`;
    div.textContent = text;
    this.messages.appendChild(div);
    this.msgs.push({ div, t: 9 });
    while (this.msgs.length > 6) this.msgs.shift().div.remove();
  }

  updateMessages(dt) {
    for (let i = this.msgs.length - 1; i >= 0; i--) {
      const m = this.msgs[i];
      m.t -= dt;
      if (m.t < 1) m.div.style.opacity = Math.max(0, m.t);
      if (m.t <= 0) {
        m.div.remove();
        this.msgs.splice(i, 1);
      }
    }
  }

  openModal(name, html) {
    this.modalName = name;
    this.modalBody.innerHTML = html;
    this.modal.classList.remove('hidden');
  }

  closeModal() {
    this.modalName = null;
    this.modal.classList.add('hidden');
  }
}

// 各車廂崗位一覽（由列車資料產生）
const STATION_NAME = { gun: '火砲', mg: '機槍', console: '指揮台（傳令鐘＋觀測鏡）', rangefinder: '測距儀', mortar: '迫砲' };
function stationTable(train) {
  if (!train) return '';
  const rows = train.cars
    .map((car, i) => {
      const items = car.stations
        .filter((s) => STATION_NAME[s.type])
        .map((s) => (s.type === 'gun' || s.type === 'mortar' ? s.label.replace(/^\S+\s/, '') : s.type === 'mg' ? s.label.replace(/^\S+\s/, '') : STATION_NAME[s.type]));
      return `<tr><td><kbd>${i + 1}</kbd> ${car.name}</td><td>${items.length ? items.join('、') : '—（只能通過）'}</td></tr>`;
    })
    .join('');
  return `<h3>各車廂崗位一覽（數字鍵自動前往）</h3>
  <table class="stations"><thead><tr><th>車廂</th><th>可操作的崗位</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="note">走近崗位時，畫面上會浮出彩色標籤（砲＝火砲、槍＝機槍、指＝觀測鏡與傳令鐘、測＝測距儀、迫＝迫砲）；靠近到可以操作時標籤會變亮，顯示「按 E 上崗」。</div>`;
}

export function helpHtml(train) {
  return `
  <h2>操作說明</h2>
  ${stationTable(train)}
  <div class="cols">
    <div>
      <h3>角色移動</h3>
      <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移動　<kbd>Shift</kbd> 快跑</div>
      <div>車內走道最快約 3 m/s；車頂、車外約 5 m/s，但屬<b>暴露位置</b></div>
      <div><kbd>1</kbd>–<kbd>8</kbd> 自動走到第 1–8 節車廂（車頭起算，見右下角簡圖）；按 WASD 取消</div>
      <div><kbd>E</kbd> 上崗／離開崗位、經艙口上下車頂</div>
      <div>列車停止時，在車廂連接處按 <kbd>E</kbd> 下車；車外走到連接處旁按 <kbd>E</kbd> 上車</div>
      <div><kbd>V</kbd> 第三人稱列車鏡頭（只能看）</div>
    </div>
    <div>
      <h3>隨時可用</h3>
      <div><kbd>T</kbd> 射表手冊　<kbd>B</kbd> 目標簿　<kbd>H</kbd> 本說明</div>
      <div><kbd>I</kbd> 車廂圖鑑：各車廂 3D 介紹、內裝與操作（開啟時遊戲暫停）</div>
      <div><kbd>G</kbd> 切換射擊輔助（表尺自動依目標簿距離設定）</div>
      <div><kbd>Esc</kbd> 暫停</div>
    </div>
    <div>
      <h3>指揮台（指揮車）</h3>
      <div><kbd>W</kbd>/<kbd>S</kbd> 傳令鐘：後退、停止、微速、半速、全速</div>
      <div>命令約 2 秒後由司機執行</div>
      <div>右鍵觀測鏡，左鍵標記方位（距離為目測，誤差約 ±12%）</div>
    </div>
    <div>
      <h3>測距儀（火砲車丙）</h3>
      <div>左鍵測距，結果記入目標簿；誤差隨距離增加</div>
    </div>
    <div>
      <h3>十糎砲（火砲車甲、乙）・七糎砲（火砲車丙）</h3>
      <div>滑鼠或方向鍵：方向／俯仰（有最大轉速）</div>
      <div><kbd>1</kbd> 尖鋭弾　<kbd>2</kbd> 榴弾　按住 <kbd>R</kbd> 裝填（十糎約 25 秒、七糎約 5 秒，放開中斷）</div>
      <div>表尺：滾輪 ±1、<kbd>Shift</kbd>＋滾輪或 <kbd>PgUp</kbd><kbd>PgDn</kbd> ±10、<kbd>-</kbd><kbd>=</kbd> 微調 ±0.1 密位</div>
      <div>十字線直接對準目標（砲管會自動依表尺抬高）；左鍵擊發；右鍵倍率</div>
      <div><kbd>[</kbd><kbd>]</kbd> 切換目標簿選定目標</div>
    </div>
    <div>
      <h3>九七式曲射歩兵砲（電源車後段）</h3>
      <div><kbd>A</kbd>/<kbd>D</kbd> 方位 ±10 密位、<kbd>W</kbd>/<kbd>S</kbd> 距離 ±50 m（<kbd>Shift</kbd> 微調）</div>
      <div><kbd>[</kbd><kbd>]</kbd> 選目標、<kbd>F</kbd> 依目標裝定、左鍵發射（停車時）</div>
      <div>曲射越過山稜；依觀測哨回報修正彈著</div>
    </div>
    <div>
      <h3>九二式重機槍（全列車 11 處）</h3>
      <div>左鍵連射（每分 450 發）、30 發保彈板，按住 <kbd>R</kbd> 換板</div>
      <div>注意槍管過熱</div>
    </div>
  </div>
  <h3>射擊程序（直接瞄準）</h3>
  <div>① 到測距儀測距（或在指揮台目測）→ 記入目標簿　② 走到砲位，轉向目標方位
  ③ 依射表查出表尺（密位）並設定　④ 十字線對準目標，砲管會自動帶到正確射角　⑤ 擊發、觀察彈著修正</div>
  <div class="note">射表以 15°C、無風、砲目同高為準。行進間射擊時，列車速度會加到彈丸上，側向射擊需自行修正。</div>`;
}

export function menuHtml(levels, progress) {
  const cards = levels
    .map((l) => {
      const rank = progress.cleared[l.id];
      return `<button class="lv${l.ready ? '' : ' locked'}" ${l.ready ? `data-goto="brief:${l.id}"` : 'disabled'}>
        <b>第 ${l.id} 關</b><strong>${l.name}</strong><span>${l.sub}</span>
        <em>${l.ready ? (rank ? `已完成・評等 ${rank}` : '可遊玩') : '製作中'}</em></button>`;
    })
    .join('');
  return `
  <h2>鋼軌堡壘　九四式裝甲列車</h2>
  <div class="note">選擇關卡。全車軍士由你指揮，你也可以隨時親自接手任何崗位。</div>
  <div class="lv-grid">${cards}</div>`;
}

export function level2BriefHtml() {
  return `
  <h2>電報：第二關　沿線巡邏</h2>
  <div>第一裝甲列車隊 指揮官 收</div>
  <div>試驗線沿線出現敵軍騎兵與步兵襲擾。命你部自起點站出發，巡邏至終點站，沿途擊退敵軍。</div>
  <h3>情報</h3>
  <div>敵騎兵約 10–12 騎一隊，會衝到鐵道旁 200 m 左右奔馳射擊；敵步兵班 10–12 名，配 2 挺輕機槍，會躍進到 500–700 m 外臥倒射擊，輕機槍特別喜歡打槍眼。</div>
  <div>敵步槍打不穿車廂側面裝甲，但在<b>車頂、機關車腳踏板、敞頂砲座</b>等暴露位置會中彈；槍眼附近的機槍手也可能受傷。</div>
  <h3>指揮要領</h3>
  <div>機槍手會自動對射界內的敵人射擊。按 <kbd>C</kbd> 開乘員命令：切換機槍射擊、十糎砲「自由射擊」或「砲擊選定目標」（目標簿選定的目標）。</div>
  <div>在指揮台用觀測鏡標記目標後，測距手約 4 秒會補上精確測距。你也可以隨時走到任何崗位親自接手。</div>
  <div class="note">指揮官陣亡時由預備士兵接替（3 名）；用完即任務失敗。</div>
  <div class="brief-btns">
    <button class="start-btn" data-goto="start:2">出發</button>
    <button class="start-btn secondary" data-goto="menu">返回</button>
  </div>`;
}

export function level5BriefHtml() {
  return `
  <h2>電報：第五關　鋼鐵對決</h2>
  <div>第一裝甲列車隊 指揮官 收</div>
  <div>敵方裝甲列車一列，自東方沿試驗線西進。命你部迎擊，<b>擊毀其砲車</b>，確保鐵道。</div>
  <h3>情報</h3>
  <div>敵車 4 節：前砲車、指揮車、機關車、後砲車。兩節砲車各有一門十糎級火砲，會逐發試射修正，尖鋭弾可以擊穿我方側甲。</div>
  <div>敵車側甲約 20 mm：<b>榴弾打不穿，要用尖鋭弾</b>。<b>兩節砲車都擊毀、或任意 3 節被毀</b>，敵車就失去戰鬥力。擊毀敵指揮車，敵砲修正會變慢；擊毀機關車，敵車就動不了。</div>
  <h3>砲戰要領</h3>
  <div>① <b>停車射擊</b>：行進間很難命中。我方移動 50 m 以上，敵砲就得重新試射，可以用來擺脫敵砲的修正。</div>
  <div>② <b>測距</b>：到火砲車丙的測距儀測敵車，或在指揮台觀測鏡標記（測距手會補上精確距離）。</div>
  <div>③ <b>射擊</b>：按 <kbd>C</kbd> 下令甲砲、乙砲「砲擊選定目標」，砲手會用尖鋭弾並依彈著修正；也可以親自上砲（<kbd>1</kbd> 尖鋭弾）。</div>
  <div class="note">車廂被擊穿 16 次即任務失敗；指揮官陣亡時由預備士兵接替（3 名）。12 分鐘內、零傷亡、被擊穿 2 次以下才有 S。</div>
  <div class="brief-btns">
    <button class="start-btn" data-goto="start:5">出發</button>
    <button class="start-btn secondary" data-goto="menu">返回</button>
  </div>`;
}

export function level4BriefHtml() {
  return `
  <h2>電報：第四關　山谷伏擊</h2>
  <div>第一裝甲列車隊 指揮官 收</div>
  <div>前方山谷一帶有敵軍活動。命你部巡邏至終點站，沿途<b>摧毀敵火力據點</b>，確保後續列車通行。</div>
  <h3>情報</h3>
  <div>敵軍可能在北側稜線後方設置迫擊砲陣地。稜線擋住視線，十糎砲直接瞄準打不到，敵彈卻能從頭頂落下，擊穿車頂、殺傷暴露位置的人員。</div>
  <div>敵迫砲會逐發試射修正，彈著越來越近；列車移動 80 m 以上，敵軍就得重新試射。</div>
  <h3>迫砲射擊要領（電源車後段，按 <kbd>8</kbd> 前往）</h3>
  <div>① <b>停車</b>：迫砲只能在停車時射擊。</div>
  <div>② <b>裝定</b>：用 <kbd>[</kbd> <kbd>]</kbd> 選目標簿裡觀測哨報的目標，按 <kbd>F</kbd> 自動裝定方位、距離；砲手依射表設定射角（<kbd>T</kbd> 可看射表）。</div>
  <div>③ <b>發射與修正</b>：左鍵發射。觀測哨會回報彈著偏差，例如「遠 120 m、右 40 m（方位約 27 密位）」——就按 <kbd>S</kbd> 減距離、按 <kbd>A</kbd> 往左修方位（<kbd>Shift</kbd> 微調）。</div>
  <div>④ 回報「彈著良好」時保持諸元繼續射擊，直到敵砲擊毀。</div>
  <div class="note">迫砲座是敞頂的暴露位置。車廂被擊穿 12 次即任務失敗；指揮官陣亡時由預備士兵接替（3 名）。12 分鐘內、零傷亡、未被擊穿才有 S。</div>
  <div class="brief-btns">
    <button class="start-btn" data-goto="start:4">出發</button>
    <button class="start-btn secondary" data-goto="menu">返回</button>
  </div>`;
}

export function mortarTableHtml(weapon) {
  const t = weapon.table;
  const rows = t.rows
    .filter((r) => r.range % 100 === 0)
    .map((r) => `<tr><td>${r.range.toLocaleString()}</td><td><b>${r.elevMil.toFixed(0)}</b></td><td>${r.tof.toFixed(1)}</td></tr>`)
    .join('');
  return `
  <h2>射表手冊　${weapon.name}（曲射）</h2>
  <div class="note">射程 ${t.minRange.toLocaleString()}–${t.maxRange.toLocaleString()} m。射角越大落得越近（曲射）。砲手會依裝定距離自動設定射角；本表供參考。修正方位時：距離每 1,000 m，1 密位約偏 1 m。</div>
  <table>
    <thead><tr><th>距離 m</th><th>射角（密位）</th><th>飛行時間 s</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function level3BriefHtml() {
  return `
  <h2>電報：第三關　斷軌</h2>
  <div>第一裝甲列車隊 指揮官 收</div>
  <div>據報敵工兵潛入試驗線沿線，企圖炸毀鐵道、截斷交通。命你部自起點站出發，巡邏至終點站；鐵道如遭破壞，<b>就地搶修後繼續前進</b>。</div>
  <h3>情報</h3>
  <div>敵工兵完成爆破後會撤離，並由埋伏的步兵班掩護。伏兵可能出現在鐵道南北兩側，配有輕機槍。</div>
  <h3>斷軌處置要領</h3>
  <div>① <b>控制車速</b>：司機要到斷口前約 150 m 才看得清楚。半速以下可以及時停車；全速時來不及，列車會出軌（任務失敗）。</div>
  <div>② <b>先壓制，再下車</b>：按 <kbd>C</kbd> 讓機槍與十糎砲射擊伏兵，或親自操作。</div>
  <div>③ <b>下車搶修</b>：在<b>車廂連接處</b>（車廂之間的平台）按 <kbd>E</kbd> 下車，走到紅旗標示的斷口，<b>按住 <kbd>E</kbd></b> 修理（約 25 秒，可分次完成）。車外完全暴露，受傷時修理會變慢。</div>
  <div>④ 修好後回到車廂連接處旁按 <kbd>E</kbd> 上車，下令前進。</div>
  <div class="note">指揮官陣亡時由預備士兵接替（3 名）；用完即任務失敗。10 分鐘內、零傷亡才有 S。</div>
  <div class="brief-btns">
    <button class="start-btn" data-goto="start:3">出發</button>
    <button class="start-btn secondary" data-goto="menu">返回</button>
  </div>`;
}

export function briefingHtml() {
  return `
  <h2>電報：第一關　試驗運行</h2>
  <div>第一裝甲列車隊 指揮官 收</div>
  <div>本日於試驗線（全長 3.2 km）實施九四式裝甲列車試驗運行。列車目前停於起點站，<b>全車僅貴官一員</b>，各崗位須親自操作。</div>
  <h3>教學內容（7 章、約 55 個步驟）</h3>
  <div>① 在車廂裡移動　② 指揮台與發車　③ 九二式重機槍　④ 測距與目標簿</div>
  <div>⑤ 十糎砲射擊　⑥ 車頂與其他功能　⑦ 結業射擊：擊毀移動靶車</div>
  <div class="note">左側面板會逐步告訴你要按哪個鍵、走到哪裡、做什麼；黃色箭頭標出要前往的位置。卡住時按 N 可略過該步驟。</div>
  <h3>氣象</h3>
  <div>氣溫 15°C、無風（標準條件）。本關沒有敵軍。</div>
  <div class="brief-btns">
    <button class="start-btn" id="start-btn">開始教學</button>
    <button class="start-btn secondary" id="free-btn">略過教學，自由練習</button>
    <button class="start-btn secondary" data-goto="menu">返回</button>
  </div>`;
}

export function firingTableHtml(weapon, shellId) {
  const tabs = weapon.shells
    .map((s) => `<button data-shell="${s.id}" class="${s.id === shellId ? 'on' : ''}">${s.name}</button>`)
    .join('');
  const t = weapon.tables[shellId];
  const fmt = (v, d = 1) => (v == null ? '—' : (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d));
  const rows = t.rows
    .map(
      (r) => `<tr>
      <td>${r.range.toLocaleString()}</td>
      <td><b>${fmt(r.elevMil)}</b></td>
      <td>${fmt(r.tof)}</td>
      <td>${fmt(r.fallDeg)}</td>
      <td>${fmt(r.dTempMil, 2)}</td>
      <td>${fmt(r.dHeadMil, 2)}</td>
      <td>${fmt(r.driftMil, 2)}</td>
    </tr>`,
    )
    .join('');
  return `
  <h2>射表手冊　${weapon.name}</h2>
  <div class="tabs">${tabs}</div>
  <div class="note">標準條件：氣溫 15°C、無風、砲目同高。最大射程 ${Math.round(t.maxRange).toLocaleString()} m（射角 ${t.maxElevMil.toFixed(0)} 密位）。表尺單位：密位（全圓 6400）。</div>
  <table>
    <thead><tr><th>距離 m</th><th>表尺</th><th>飛行時間 s</th><th>落角 °</th><th>氣溫 +10°C 修正</th><th>逆風 1 m/s 修正</th><th>橫風 1 m/s 偏流</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function targetBookHtml(book, now) {
  if (!book.entries.length) {
    return '<h2>目標簿</h2><div>尚無紀錄。到火砲車丙測距儀測距，或在指揮台觀測鏡中標記目標。</div>';
  }
  const rows = book.entries
    .map(
      (e, i) => `<tr class="${i === book.sel ? 'sel' : ''}">
      <td>${e.id}</td><td>${fmtMil(e.bearing)}</td><td>${e.range.toLocaleString()}</td><td>${e.method}</td><td>${Math.round(now - e.time)} 秒前</td></tr>`,
    )
    .join('');
  return `
  <h2>目標簿</h2>
  <div class="note">方位為正北起算的密位。列車移動後方位與距離會改變，請留意紀錄時間。在砲位按 [ ] 切換選定目標。</div>
  <table><thead><tr><th>編號</th><th>方位</th><th>距離 m</th><th>方式</th><th>紀錄時間</th></tr></thead><tbody>${rows}</tbody></table>`;
}
