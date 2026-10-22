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

export function helpHtml() {
  return `
  <h2>操作說明</h2>
  <div class="cols">
    <div>
      <h3>角色移動</h3>
      <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移動　<kbd>Shift</kbd> 快跑</div>
      <div>車內走道最快約 3 m/s；車頂、車外約 5 m/s，但屬<b>暴露位置</b></div>
      <div><kbd>1</kbd>–<kbd>8</kbd> 自動走到第 1–8 節車廂（車頭起算，見右下角簡圖）；按 WASD 取消</div>
      <div><kbd>E</kbd> 上崗／離開崗位、經艙口上下車頂</div>
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
      <h3>十糎砲（火砲車甲、乙）</h3>
      <div>滑鼠或方向鍵：方向／俯仰（有最大轉速）</div>
      <div><kbd>1</kbd> 尖鋭弾　<kbd>2</kbd> 榴弾　按住 <kbd>R</kbd> 裝填（約 25 秒，放開中斷）</div>
      <div>滾輪／<kbd>PgUp</kbd><kbd>PgDn</kbd> 調表尺；左鍵擊發；右鍵倍率</div>
      <div><kbd>[</kbd><kbd>]</kbd> 切換目標簿選定目標</div>
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
  <div>敵騎兵約 8 騎一隊，會衝到鐵道旁 200 m 左右奔馳射擊；敵步兵班 8–10 名，配輕機槍，會在 400–500 m 外趴下射擊。</div>
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
