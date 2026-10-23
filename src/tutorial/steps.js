import * as THREE from 'three';
import { lookupElevation } from '../weapons/firingTable.js';
import { WEAPONS } from '../data/weapons.js';
import { DEG } from '../core/math.js';

// 第一關「試驗運行」教學：7 章、每章拆成小步驟。
// 每一步：
//   title / text      面板上的標題與說明（text 可用 <kbd>）
//   goto(ctx)         需要前往的地點 { car, x, lat, level, label }，會顯示導引標記與距離
//   car               在右下角簡圖標示的車廂索引
//   info: true        說明步驟，按 Enter 繼續
//   enter(ctx, st)    進入步驟時記錄起始狀態（st 為本步驟專用的暫存物件）
//   check(ctx, st, dt) 每幀檢查，回傳 true 即完成
//   on: { 事件: (data, ctx, st) => 是否完成 }

const K = (k) => `<kbd>${k}</kbd>`;
const CAR = { guard: 0, gunA: 1, gunB: 2, gunC: 3, command: 4, loco: 5, tender: 6, power: 7 };

const inCar = (ctx, i) => {
  const w = ctx.player.where();
  return w && !w.inGap && w.car === ctx.train.cars[i];
};
const atStation = (ctx, st) => ctx.game.mode === 'station' && ctx.game.station === st;
const stationGoto = (ctx, station, label) => {
  const def = ctx.defOf(station);
  return { car: ctx.train.cars.indexOf(station.car), x: def.x, lat: def.lat, level: 'in', label };
};

// 射擊方向與目標的夾角（度）
function aimError(origin, quat, target) {
  const f = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
  const to = target.clone().sub(origin).normalize();
  return f.angleTo(to) / DEG;
}
function nearestAimed(targets, origin, quat, filter, maxDeg) {
  let best = null;
  for (const t of targets.list) {
    if (!t.alive || !filter(t, origin.distanceTo(t.center))) continue;
    const e = aimError(origin, quat, t.center);
    if (e < maxDeg && (!best || e < best.e)) best = { t, e };
  }
  return best;
}
const milDiff = (a, b) => {
  const d = Math.abs(a - b) % 6400;
  return Math.min(d, 6400 - d);
};

export function buildSteps(ctx) {
  const S = ctx.stations;
  const consoleSt = S.find((s) => s.type === 'console');
  const cmdMg = S.find((s) => s.type === 'mg' && s.car.kind === 'command');
  const rf = S.find((s) => s.type === 'rangefinder');
  const gunB = S.find((s) => s.type === 'gun' && s.car.kind === 'gunB');
  const gunCar = ctx.train.cars[CAR.gunB];
  const hatchGoto = { car: CAR.gunB, x: gunCar.hatches[0], lat: -0.5, level: 'in', label: '火砲車乙 艙口梯' };
  const tmp = new THREE.Vector3();
  const tq = new THREE.Quaternion();

  return [
    // ───────────── 第 1 章：在車廂裡移動 ─────────────
    { chapter: '在車廂裡移動', title: '環顧四周', text: `移動滑鼠，看看指揮車的車內。<br>滑鼠沒反應時，先點一下畫面鎖定滑鼠。`,
      enter: (c, st) => (st.yaw = c.player.yaw),
      check: (c, st) => Math.abs(c.player.yaw - st.yaw) > 1.2 },
    { title: '向前走', text: `按住 ${K('W')} 往前走 3 公尺。`,
      enter: (c, st) => (st.a = c.player.a),
      check: (c, st) => Math.abs(c.player.a - st.a) > 3 },
    { title: '後退與側移', text: `用 ${K('S')} 後退、${K('A')}／${K('D')} 左右移動。走道寬約 2.3 m。`,
      enter: (c, st) => Object.assign(st, { lat: c.player.lat, a: c.player.a, back: false, side: false }),
      check: (c, st) => {
        if (c.input.down('KeyS')) st.back = true;
        if (Math.abs(c.player.lat - st.lat) > 0.5) st.side = true;
        return st.back && st.side;
      } },
    { title: '快跑', text: `按住 ${K('Shift')} 加 ${K('W')} 快跑。車內最快約 3 m/s。`,
      enter: (c, st) => (st.t = 0),
      check: (c, st, dt) => {
        if (c.player.moving >= 2.9) st.t += dt;
        return st.t > 1.2;
      } },
    { title: '看懂列車簡圖', info: true,
      text: `右下角是<b>列車簡圖</b>：車頭在右邊，數字 1–8 是車廂編號。<br>
        <b style="color:#8fd27a">綠點</b>是你、<b style="color:#ff6a4d">紅點</b>代表你在<b>暴露位置</b>；
        圓點加短線是十糎砲、三角形是機槍、「指」「測」是指揮台與測距儀。<br>按 ${K('Enter')} 繼續。` },
    { title: '自動走到火砲車甲', car: CAR.gunA, text: `按 ${K('2')}，角色會自己沿走道走到第 2 節「火砲車甲」。途中按 WASD 可以取消。`,
      check: (c) => inCar(c, CAR.gunA) && !c.player.auto },
    { title: '回到指揮車', car: CAR.command, text: `按 ${K('5')} 回到第 5 節「指揮車」。`,
      check: (c) => inCar(c, CAR.command) && !c.player.auto },

    // ───────────── 第 2 章：指揮台與發車 ─────────────
    { chapter: '指揮台與發車', title: '走到指揮台', text: `跟著<b>黃色箭頭</b>走到指揮塔下方。走到旁邊時，畫面中央會出現「按 E」的提示。`,
      goto: (c) => stationGoto(c, consoleSt, '指揮台'),
      check: (c) => {
        const d = c.defOf(consoleSt);
        const w = c.player.where();
        return w.car === consoleSt.car && Math.hypot(w.x - d.x, c.player.lat - d.lat) < 1.3;
      } },
    { title: '上指揮台', text: `按 ${K('E')} 操作指揮台。`, check: (c) => atStation(c, consoleSt) },
    { title: '從指揮塔環視', text: `移動滑鼠，透過指揮塔的觀察縫看看四周。上方顯示的是你面向的<b>方位角</b>（密位，正北為 0000）。`,
      enter: (c, st) => (st.yaw = consoleSt.yaw),
      check: (c, st) => atStation(c, consoleSt) && Math.abs(consoleSt.yaw - st.yaw) > 1.5 },
    { title: '傳令鐘：微速前進', text: `按 ${K('W')} 把傳令鐘從「停止」推到「微速」。畫面下方的傳令鐘會顯示你下的命令。`,
      check: (c) => c.train.ordered >= 2 },
    { title: '等待司機回覆', text: `命令約 2 秒後才傳到司機。等司機回覆，列車開始前進。`,
      check: (c) => c.train.acknowledged >= 2 && c.train.speed * 3.6 > 2 },
    { title: '加速到半速', text: `再按一次 ${K('W')} 推到「半速」（30 km/h）。列車很重，加速需要時間。`,
      check: (c) => c.train.ordered >= 3 && c.train.speed * 3.6 > 12 },
    { title: '停車', text: `按 ${K('S')} 把傳令鐘拉回「停止」，等列車完全停下來。`,
      check: (c) => c.train.ordered === 1 && Math.abs(c.train.speed) < 0.1 },
    { title: '打開觀測鏡', text: `按 ${K('右鍵')} 打開雙眼觀測鏡（約 7 倍）。再按一次可以關掉。`,
      check: (c) => atStation(c, consoleSt) && consoleSt.zoom },
    { title: '目測標記目標', text: `轉向北方（方位 6400／0000 附近），在觀測鏡中把刻度中心對準一面靶板，按 ${K('左鍵')} 標記。<br>指揮台只能<b>目測</b>距離，誤差約 ±12%。`,
      on: { mark: () => true } },
    { title: '查看目標簿', text: `按 ${K('B')} 打開目標簿，看看剛才記下的方位與距離。`,
      check: (c) => c.ui.modalName === 'book' },
    { title: '關閉目標簿', text: `再按 ${K('B')} 關閉目標簿。`, check: (c) => !c.ui.modalName },
    { title: '離開指揮台', text: `按 ${K('E')} 離開指揮台。列車會維持最後的速度（現在是停止）。`, check: (c) => c.game.mode === 'walk' },

    // ───────────── 第 3 章：九二式重機槍 ─────────────
    { chapter: '九二式重機槍', title: '走到機槍位', text: `指揮車左側有一挺機槍。跟著黃色箭頭走過去。`,
      goto: (c) => stationGoto(c, cmdMg, '指揮車 左側機槍'),
      check: (c) => {
        const d = c.defOf(cmdMg);
        const w = c.player.where();
        return w.car === cmdMg.car && Math.hypot(w.x - d.x, c.player.lat - d.lat) < 1.3;
      } },
    { title: '上槍位', text: `按 ${K('E')} 操作機槍。`, check: (c) => atStation(c, cmdMg) },
    { title: '瞄準近距離靶板', text: `移動滑鼠轉動槍架，把準星對準北側 100–400 m 的一面<b>靶板</b>（黑白同心圓）。<br>機槍的射界只有左側約 ±75°。`,
      check: (c) => {
        cmdMg.mg.pitchG.getWorldQuaternion(tq);
        cmdMg.mg.muzzle.getWorldPosition(tmp);
        return atStation(c, cmdMg) && !!nearestAimed(c.targets, tmp, tq, (t, d) => t.type === 'board' && d < 700, 3.5);
      } },
    { title: '連射', text: `按住 ${K('左鍵')} 射擊，射出 15 發。每發都是曳光彈，看著彈道修正準星。`,
      enter: (c, st) => (st.n = 0),
      on: { mgShot: (d, c, st) => ++st.n >= 15 } },
    { title: '擊毀靶板', text: `繼續射擊，直到擊毀一面靶板（約 18 發命中）。保彈板只有 30 發，打完會停。`,
      enter: (c, st) => (st.base = c.targets.destroyed),
      check: (c, st) => c.targets.destroyed > st.base },
    { title: '換保彈板', text: `按住 ${K('R')} 約 3 秒換上新的保彈板。放開會中斷。`,
      on: { mgReload: () => true } },
    { title: '注意槍管溫度', info: true, text: `右下方面板的<b>槍管溫度</b>到 100% 會過熱停火，要降到 45% 以下才能再射。長點放比一直壓住更有效率。<br>按 ${K('Enter')} 繼續。` },
    { title: '離開槍位', text: `按 ${K('E')} 離開機槍。`, check: (c) => c.game.mode === 'walk' },

    // ───────────── 第 4 章：測距 ─────────────
    { chapter: '測距與目標簿', title: '前往火砲車丙', car: CAR.gunC, text: `測距儀在第 4 節「火砲車丙」。按 ${K('4')} 自動走過去。`,
      check: (c) => inCar(c, CAR.gunC) && !c.player.auto },
    { title: '走到測距儀下方', text: `跟著黃色箭頭走到測距儀的操作位。`,
      goto: (c) => stationGoto(c, rf, '測距儀'),
      check: (c) => {
        const d = c.defOf(rf);
        const w = c.player.where();
        return w.car === rf.car && Math.hypot(w.x - d.x, c.player.lat - d.lat) < 1.3;
      } },
    { title: '操作測距儀', text: `按 ${K('E')} 操作測距儀。測距儀預設就是高倍率。`, check: (c) => atStation(c, rf) },
    { title: '找到中距離靶板', text: `轉向北方，找到約 1–2 km 外的<b>靶板</b>，把中央刻度對準它。<br>倍率很高，移動滑鼠要慢；按 ${K('右鍵')} 可以切到低倍率先找方向。`,
      check: (c) => {
        rf.view(tq);
        tq.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
        rf.anchor.getWorldPosition(tmp);
        return atStation(c, rf) && !!nearestAimed(c.targets, tmp, tq, (t, d) => t.type === 'board' && d > 700 && d < 2400, 0.8);
      } },
    { title: '測距', text: `按 ${K('左鍵')} 測距。結果會顯示在鏡中，並記入目標簿。`,
      on: { measure: (d) => d.dist > 600 } },
    { title: '確認目標簿', text: `按 ${K('B')} 看看目標簿：「測距」的距離比「目測」準得多。`, check: (c) => c.ui.modalName === 'book' },
    { title: '關閉目標簿', text: `按 ${K('B')} 關閉。`, check: (c) => !c.ui.modalName },
    { title: '離開測距儀', text: `按 ${K('E')} 離開。`, check: (c) => c.game.mode === 'walk' },

    // ───────────── 第 5 章：十糎砲射擊 ─────────────
    { chapter: '十糎砲射擊', title: '前往火砲車乙', car: CAR.gunB, text: `按 ${K('3')} 前往第 3 節「火砲車乙」。乙車的砲塔較高，可以越過前車射擊。`,
      check: (c) => inCar(c, CAR.gunB) && !c.player.auto },
    { title: '上主砲', text: `走到砲塔下方（黃色箭頭），按 ${K('E')} 操作十糎砲。`,
      goto: (c) => stationGoto(c, gunB, '十糎砲'),
      check: (c) => atStation(c, gunB) },
    { title: '認識彈種', text: `按 ${K('1')} 選<b>尖鋭弾</b>（穿甲，要直擊），再按 ${K('2')} 換回<b>榴弾</b>（爆炸範圍大，適合打靶板與陣地）。`,
      enter: (c, st) => (st.ap = false),
      on: { shellSelect: (d, c, st) => {
        if (d.shell === 'AP') st.ap = true;
        return st.ap && d.shell === 'HE';
      } } },
    { title: '裝填', text: `按住 ${K('R')} 裝填榴弾，約 25 秒。中途放開要重來。<br>裝填時可以先做下一步的準備。`,
      check: () => gunB.loaded === 'HE' },
    { title: '選定目標', text: `按 ${K('[')} 或 ${K(']')}，把右下方面板的「目標簿」切到剛才<b>測距</b>的那筆紀錄。`,
      enter: (c, st) => (st.pressed = false),
      check: (c, st) => {
        if (c.input.hit('BracketLeft') || c.input.hit('BracketRight')) st.pressed = true;
        return st.pressed && gunB.game.targetBook.selected()?.method === '測距';
      } },
    { title: '查射表', text: `按 ${K('T')} 打開射表手冊，在「榴弾」分頁找到目標距離對應的<b>表尺</b>（密位）。記住數字後按 ${K('T')} 關閉。`,
      enter: (c, st) => (st.opened = false),
      check: (c, st) => {
        if (c.ui.modalName === 'table') st.opened = true;
        return st.opened && !c.ui.modalName;
      } },
    { title: '設定表尺', text: `用 ${K('滾輪')} 調整表尺（${K('Shift')}＋滾輪每格 10 密位、${K('PgUp')}／${K('PgDn')} 也可以；${K('-')}／${K('=')} 微調 0.1 密位），調到射表的數值（誤差 2 密位以內）。`,
      hint: () => {
        const e = gunB.game.targetBook.selected();
        return e ? `目前 ${gunB.drum.toFixed(1)} 密位` : '';
      },
      check: () => {
        const e = gunB.game.targetBook.selected();
        if (!e) return false;
        return Math.abs(gunB.drum - lookupElevation(WEAPONS.type14.tables.HE, e.range)) <= 2;
      } },
    { title: '轉向目標', text: `移動滑鼠轉動砲塔，讓面板上的<b>方位角</b>接近目標簿的方位，再把十字線上方的倒 V 對準靶板。<br>砲塔轉得很慢，大角度要多等一下。`,
      check: () => {
        const e = gunB.game.targetBook.selected();
        return !!e && milDiff(gunB.azimuthMil(), e.bearing) < 12;
      } },
    { title: '擊發', text: `確認已裝填、十字線對準目標，按 ${K('左鍵')} 擊發。`, on: { gunFire: () => true } },
    { title: '觀察彈著', text: `砲彈飛行需要幾秒。盯著瞄準鏡，看榴弾在哪裡炸開。`,
      on: { impact: (d, c) => {
        if (d.kind !== 'shell') return false;
        c.firstShotHit = d.hit;
        return true;
      } } },
    { title: '修正後命中', skipIf: (c) => c.firstShotHit, skipText: '第一發就有效命中，跳過修正射擊！', text: `重新裝填（${K('R')}）。彈著<b>偏遠</b>就減表尺、<b>偏近</b>就加表尺，左右偏就修正方向，再射一發，直到<b>有效命中</b>（右上角「有效」數字增加）。`,
      enter: (c, st) => (st.hits = c.game.stats.hits),
      check: (c, st) => c.game.stats.hits > st.hits },
    { title: '射擊輔助', text: `覺得太難？按 ${K('G')} 可以開啟<b>射擊輔助</b>：表尺會自動依目標簿距離設定。先按一次打開看看。`,
      check: (c) => c.game.settings.assist },
    { title: '關閉輔助', text: `再按 ${K('G')} 關閉輔助（之後要不要開由你決定）。`, check: (c) => !c.game.settings.assist },
    { title: '離開砲位', text: `按 ${K('E')} 離開十糎砲。`, check: (c) => c.game.mode === 'walk' },

    // ───────────── 第 6 章：車頂與其他功能 ─────────────
    { chapter: '車頂與其他功能', title: '走到艙口梯', text: `每節車都有通往車頂的艙口梯（偏左側）。跟著黃色箭頭走過去。`,
      goto: () => hatchGoto,
      check: (c) => {
        const w = c.player.where();
        return w.car === gunCar && Math.abs(w.x - gunCar.hatches[0]) < 0.9 && Math.abs(c.player.lat) < 0.8;
      } },
    { title: '爬上車頂', text: `按 ${K('E')} 爬上車頂。車頂跑得比較快（約 5 m/s），但屬於<b>暴露位置</b>，會被敵人射擊。`,
      check: (c) => c.player.level === 'roof' },
    { title: '在車頂移動', text: `用 ${K('Shift')}＋${K('W')} 在車頂跑 6 公尺。注意左上角的「⚠ 暴露位置」。砲塔周圍不能通過。`,
      enter: (c, st) => (st.a = c.player.a),
      check: (c, st) => c.player.level === 'roof' && Math.abs(c.player.a - st.a) > 6 },
    { title: '回到車內', text: `回到艙口位置（黃色箭頭），按 ${K('E')} 回到車內。`,
      goto: () => ({ ...hatchGoto, level: 'roof' }),
      check: (c) => c.player.level === 'in' },
    { title: '第三人稱鏡頭', text: `按 ${K('V')} 切到第三人稱鏡頭，用滑鼠轉動、滾輪縮放，從外面看看整列車。`,
      check: (c) => c.game.mode === 'third' },
    { title: '切換觀看的車廂', text: `在第三人稱鏡頭中按 ${K('[')}／${K(']')} 切換要看的車廂，然後按 ${K('V')} 回到角色。`,
      enter: (c, st) => (st.car = c.game.orbit.car),
      check: (c, st) => {
        if (c.game.orbit.car !== st.car) st.moved = true;
        return st.moved && c.game.mode !== 'third';
      } },
    { title: '車廂圖鑑', text: `按 ${K('I')} 打開<b>車廂圖鑑</b>，可以 3D 檢視每節車的外觀、內裝與操作方式。看完按 ${K('I')} 關閉。`,
      enter: (c, st) => (st.opened = false),
      check: (c, st) => {
        if (c.ui.guideOpen) st.opened = true;
        return st.opened && !c.ui.guideOpen;
      } },
    { title: '操作說明', text: `按 ${K('H')} 可以隨時查看全部按鍵。看完再按 ${K('H')} 關閉。`,
      enter: (c, st) => (st.opened = false),
      check: (c, st) => {
        if (c.ui.modalName === 'help') st.opened = true;
        return st.opened && !c.ui.modalName;
      } },

    // ───────────── 第 7 章：結業射擊 ─────────────
    { chapter: '結業射擊', title: '擊毀移動靶車', text: `最後一項：鐵道南方的平原外有一條道路，兩輛掛著靶板的<b>移動靶車</b>在上面來回行駛（方位約 2200–3600 密位、距離 1.7–3 km，依列車位置而定）。先在指揮台觀測鏡或測距儀沿道路找到它，再用學到的方法擊毀其中一輛（主砲或副砲位皆可）。<br>
        提示：靶車速度 7–10 m/s，砲彈飛 2 km 約 3 秒，要瞄在車頭前方約 25 m。<br>真的打不到可以按 ${K('N')} 略過。`,
      check: (c) => c.targets.list.some((t) => t.type === 'vehicle' && !t.alive) },
  ];
}
