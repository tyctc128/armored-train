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

export function briefingHtml() {
  return `
  <h2>電報：試驗運行命令</h2>
  <div>第一裝甲列車隊 指揮官 收</div>
  <div>本日於試驗線（全長 3.2 km）實施九四式裝甲列車試驗射擊。列車目前停於起點站，<b>全車僅貴官一員</b>，各崗位須親自操作。</div>
  <h3>試驗項目</h3>
  <div>① 至<b>指揮車</b>以傳令鐘發車，微速或半速前進</div>
  <div>② <b>機槍</b>射擊：起點附近南北兩側 100–400 m 靶板</div>
  <div>③ 至<b>火砲車丙測距儀</b>測距，再至<b>火砲車甲或乙</b>以十糎砲射擊北側中、遠距靶（1–5 km）及土嚢陣地</div>
  <div>④ 南側約 1.6 km 道路上有<b>移動靶車</b>往返，須計算提前量</div>
  <h3>氣象</h3>
  <div>氣溫 15°C、無風（標準條件）</div>
  <div class="note">按 H 查看完整操作說明。本原型（M1）尚無敵軍，射擊成績顯示於右上角。</div>
  <div style="text-align:center"><button class="start-btn" id="start-btn">開始</button></div>`;
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
