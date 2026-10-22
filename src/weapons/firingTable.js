import { simulateFlat, maxRange, elevationForRange, airDensityRatio } from './ballistics.js';
import { toMil } from '../core/math.js';

// 依彈道模型逐列計算射表（標準條件：15°C、無風、砲目同高）
export function buildFiringTable(weapon, shell) {
  const k = weapon.C * shell.form;
  const v0 = shell.v0;
  const top = maxRange(v0, k, { dt: 0.02 });
  const rows = [];
  const hot = { rhoRatio: airDensityRatio(25), dt: 0.02 };
  const head = { headwind: 1, dt: 0.02 };
  for (let r = 250; r <= top.range; r += r < 6000 ? 250 : 500) {
    const e0 = elevationForRange(r, v0, k, { dt: 0.02 }, top.elev);
    if (e0 == null) break;
    const res = simulateFlat(v0, e0, k, { dt: 0.02 });
    const eHot = elevationForRange(r, v0, k, hot, top.elev);
    const eHead = elevationForRange(r, v0, k, head, top.elev);
    const cross = simulateFlat(v0, e0, k, { crosswind: 1, dt: 0.02 });
    rows.push({
      range: r,
      elevMil: toMil(e0),
      tof: res.tof,
      fallDeg: (res.fallAngle * 180) / Math.PI,
      dTempMil: eHot == null ? null : toMil(eHot - e0),
      dHeadMil: eHead == null ? null : toMil(eHead - e0),
      driftMil: toMil(Math.atan2(cross.lateral, r)),
    });
  }
  return { shell, rows, maxRange: top.range, maxElevMil: toMil(top.elev) };
}

// 以射表線性內插表尺（密位）
export function lookupElevation(table, range) {
  const rows = table.rows;
  if (!rows.length || range <= 0) return 0;
  if (range <= rows[0].range) return (rows[0].elevMil * range) / rows[0].range;
  for (let i = 1; i < rows.length; i++) {
    if (range <= rows[i].range) {
      const a = rows[i - 1];
      const b = rows[i];
      const t = (range - a.range) / (b.range - a.range);
      return a.elevMil + (b.elevMil - a.elevMil) * t;
    }
  }
  return rows[rows.length - 1].elevMil;
}
