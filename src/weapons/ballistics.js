// 外彈道：重力＋二次空氣阻力 a = -C·form·(ρ/ρ0)·|v-w|·(v-w)
export const G = 9.80665;

export function airDensityRatio(tempC) {
  // 定壓下密度與絕對溫度成反比（以 15°C 為標準）
  return 288.15 / (273.15 + tempC);
}

// 平面射擊模擬（射表用）。x：射向距離，y：高度，z：橫向（右為正）。
// headwind > 0 表示逆風（風吹向砲口），crosswind > 0 表示風往右吹。
export function simulateFlat(v0, elev, k, opts = {}) {
  const { rhoRatio = 1, headwind = 0, crosswind = 0, dt = 0.02, targetY = 0 } = opts;
  const kk = k * rhoRatio;
  const wx = -headwind;
  const wz = crosswind;
  let x = 0;
  let y = 0;
  let z = 0;
  let vx = v0 * Math.cos(elev);
  let vy = v0 * Math.sin(elev);
  let vz = 0;
  let t = 0;
  for (let i = 0; i < 40000; i++) {
    // 中點法
    let rx = vx - wx;
    let ry = vy;
    let rz = vz - wz;
    let s = Math.sqrt(rx * rx + ry * ry + rz * rz);
    const mvx = vx + 0.5 * dt * (-kk * s * rx);
    const mvy = vy + 0.5 * dt * (-G - kk * s * ry);
    const mvz = vz + 0.5 * dt * (-kk * s * rz);
    rx = mvx - wx;
    ry = mvy;
    rz = mvz - wz;
    s = Math.sqrt(rx * rx + ry * ry + rz * rz);
    const px = x;
    const py = y;
    const pz = z;
    x += mvx * dt;
    y += mvy * dt;
    z += mvz * dt;
    vx += dt * (-kk * s * rx);
    vy += dt * (-G - kk * s * ry);
    vz += dt * (-kk * s * rz);
    t += dt;
    if (vy < 0 && y <= targetY) {
      const f = (py - targetY) / (py - y);
      return {
        range: px + (x - px) * f,
        lateral: pz + (z - pz) * f,
        tof: t - dt + dt * f,
        fallAngle: Math.atan2(-vy, vx),
        impactSpeed: Math.hypot(vx, vy, vz),
      };
    }
  }
  return { range: x, lateral: z, tof: t, fallAngle: 0, impactSpeed: 0 };
}

// 最大射程（黃金分割搜尋最佳射角）
export function maxRange(v0, k, opts) {
  const phi = (Math.sqrt(5) - 1) / 2;
  let a = 15 * (Math.PI / 180);
  let b = 60 * (Math.PI / 180);
  let c = b - phi * (b - a);
  let d = a + phi * (b - a);
  let fc = simulateFlat(v0, c, k, opts).range;
  let fd = simulateFlat(v0, d, k, opts).range;
  for (let i = 0; i < 26; i++) {
    if (fc > fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - phi * (b - a);
      fc = simulateFlat(v0, c, k, opts).range;
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + phi * (b - a);
      fd = simulateFlat(v0, d, k, opts).range;
    }
  }
  const elev = (a + b) / 2;
  return { elev, range: simulateFlat(v0, elev, k, opts).range };
}

// 依史料最大射程反推阻力常數 C
export function calibrateDrag(v0, targetMaxRange) {
  let lo = Math.log(1e-7);
  let hi = Math.log(1e-2);
  for (let i = 0; i < 34; i++) {
    const mid = (lo + hi) / 2;
    const r = maxRange(v0, Math.exp(mid), { dt: 0.03 }).range;
    if (r > targetMaxRange) lo = mid;
    else hi = mid;
  }
  return Math.exp((lo + hi) / 2);
}

// 曲射彈道解（迫砲）：最大射程射角與 maxElev 之間，射角越大射程越近；射程外回傳 null
export function highAngleElevation(range, v0, k, opts = {}, maxElev = (85 * Math.PI) / 180) {
  const top = maxRange(v0, k, opts);
  if (range > top.range) return null;
  let lo = top.elev;
  let hi = maxElev;
  if (simulateFlat(v0, hi, k, opts).range > range) return null;
  for (let i = 24; i > 0; i--) {
    const mid = (lo + hi) / 2;
    if (simulateFlat(v0, mid, k, opts).range > range) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// 低伸彈道解：給定距離求射角（rad），超出射程回傳 null
export function elevationForRange(range, v0, k, opts = {}, maxElev) {
  let lo = 0;
  let hi = maxElev ?? maxRange(v0, k, opts).elev;
  if (simulateFlat(v0, hi, k, opts).range < range) return null;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (simulateFlat(v0, mid, k, opts).range < range) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
