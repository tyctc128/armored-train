const SHORT = { guard: '警戒', gunA: '砲甲', gunB: '砲乙', gunC: '砲丙', command: '指揮', loco: '機關', tender: '炭水', power: '電源' };
const W = 460;
const H = 116;
const PAD = 14;
const CAR_H = 30;
const CY = 60;

// 右下角列車簡圖：車廂、崗位、玩家位置。車頭在右。
export class TrainMap {
  constructor(canvas, train) {
    this.canvas = canvas;
    this.train = train;
    this.g = canvas.getContext('2d');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    this.g.scale(dpr, dpr);
  }

  px(a) {
    return PAD + (1 - a / this.train.totalLength) * (W - PAD * 2);
  }

  // 橫向位置：左側（-lat）畫在上方
  py(lat) {
    return CY + (lat / 3.1) * CAR_H;
  }

  draw({ player, station, autoTarget, mode, highlight }) {
    const g = this.g;
    const t = this.train;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(18, 20, 14, 0.78)';
    g.strokeStyle = 'rgba(232, 227, 207, 0.18)';
    g.lineWidth = 1;
    roundRect(g, 0.5, 0.5, W - 1, H - 1, 5);
    g.fill();
    g.stroke();

    // 鐵軌
    g.strokeStyle = 'rgba(232, 227, 207, 0.15)';
    g.beginPath();
    g.moveTo(PAD - 6, CY + CAR_H / 2 + 6);
    g.lineTo(W - PAD + 6, CY + CAR_H / 2 + 6);
    g.stroke();

    const here = player.where();
    g.font = '11px "Microsoft JhengHei", sans-serif';
    g.textAlign = 'center';
    t.cars.forEach((car, i) => {
      const x1 = this.px(car.offset);
      const x0 = this.px(car.offset + car.len);
      const w = x1 - x0;
      const current = here && here.car === car && !here.inGap;
      const target = autoTarget && autoTarget.index === i;
      g.fillStyle = car.loco ? '#3a3a33' : current ? '#5d6345' : '#454836';
      if (car.loco) {
        // 機關車：鍋爐＋駕駛室
        roundRect(g, x0 + w * 0.36, CY - CAR_H * 0.32, w * 0.62, CAR_H * 0.64, 6);
        g.fill();
        g.fillRect(x0 + 2, CY - CAR_H / 2 + 2, w * 0.3, CAR_H - 4);
      } else {
        roundRect(g, x0, CY - CAR_H / 2, w, CAR_H, 3);
        g.fill();
      }
      if (highlight === i && !current) {
        // 教學要前往的車廂：藍色閃爍外框
        const a = 0.45 + 0.45 * Math.sin(performance.now() / 180);
        g.strokeStyle = `rgba(127, 182, 224, ${a.toFixed(2)})`;
        g.lineWidth = 2.5;
        roundRect(g, x0 - 3, CY - CAR_H / 2 - 3, w + 6, CAR_H + 6, 5);
        g.stroke();
        g.lineWidth = 1;
      }
      if (current || target) {
        g.strokeStyle = current ? '#e0b25a' : '#8fd27a';
        g.setLineDash(target && !current ? [4, 3] : []);
        g.lineWidth = 1.5;
        roundRect(g, x0 - 1.5, CY - CAR_H / 2 - 1.5, w + 3, CAR_H + 3, 4);
        g.stroke();
        g.setLineDash([]);
        g.lineWidth = 1;
      }
      // 編號與名稱
      g.fillStyle = current ? '#e0b25a' : '#e8e3cf';
      g.font = 'bold 11px sans-serif';
      g.fillText(String(i + 1), (x0 + x1) / 2, CY - CAR_H / 2 - 8);
      g.font = '11px "Microsoft JhengHei", sans-serif';
      g.fillStyle = '#a9a48f';
      g.fillText(SHORT[car.kind] ?? car.name, (x0 + x1) / 2, CY + CAR_H / 2 + 20);

      // 崗位圖示
      for (const s of car.stations) {
        const sx = this.px(car.offset + car.len / 2 - s.x);
        const sy = this.py(s.lat);
        const active = station && station.car === car && s.obj === station;
        if (s.type === 'gun') {
          g.fillStyle = active ? '#e0b25a' : '#c9c3a8';
          g.beginPath();
          g.arc(sx, CY, 5.5, 0, Math.PI * 2);
          g.fill();
          g.fillRect(sx, CY - 1, 9, 2);
        } else if (s.type === 'mg') {
          g.fillStyle = active ? '#e0b25a' : '#c9c3a8';
          const up = s.lat < 0;
          g.beginPath();
          g.moveTo(sx, up ? CY - CAR_H / 2 - 4 : CY + CAR_H / 2 + 4);
          g.lineTo(sx - 3.5, up ? CY - CAR_H / 2 + 2 : CY + CAR_H / 2 - 2);
          g.lineTo(sx + 3.5, up ? CY - CAR_H / 2 + 2 : CY + CAR_H / 2 - 2);
          g.fill();
        } else if (s.type === 'console' || s.type === 'rangefinder') {
          g.fillStyle = active ? '#e0b25a' : '#7fb6e0';
          g.font = 'bold 10px "Microsoft JhengHei", sans-serif';
          g.fillText(s.type === 'console' ? '指' : '測', sx, sy + 4);
        } else {
          g.strokeStyle = 'rgba(201, 195, 168, 0.5)';
          g.beginPath();
          g.arc(sx, sy, 4, 0, Math.PI * 2);
          g.stroke();
        }
      }
    });

    // 行進方向
    g.fillStyle = '#a9a48f';
    g.textAlign = 'right';
    g.font = '11px "Microsoft JhengHei", sans-serif';
    g.fillText('車頭 ▶', W - PAD, 14);
    g.textAlign = 'left';
    g.fillText(`${(t.speed * 3.6).toFixed(0)} km/h`, PAD, 14);

    // 玩家
    if (mode !== 'third' || here) {
      const x = this.px(player.a);
      const y = this.py(player.lat);
      const roof = player.level === 'roof';
      g.fillStyle = player.exposed ? '#ff6a4d' : '#8fd27a';
      g.strokeStyle = '#111';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, y, roof ? 5.5 : 4.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      if (roof) {
        g.fillStyle = '#ff6a4d';
        g.font = 'bold 10px "Microsoft JhengHei", sans-serif';
        g.textAlign = 'center';
        g.fillText('頂', x, y - 8);
      }
      // 面向
      if (!station) {
        g.strokeStyle = g.fillStyle = player.exposed ? '#ff6a4d' : '#8fd27a';
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(player.yaw) * 11, y - Math.sin(player.yaw) * 11);
        g.stroke();
      }
      g.lineWidth = 1;
    }
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
