import * as THREE from 'three';

// 密位：全圓 6400
export const MIL_PER_RAD = 6400 / (2 * Math.PI);
export const toMil = (rad) => rad * MIL_PER_RAD;
export const fromMil = (mil) => mil / MIL_PER_RAD;
export const DEG = Math.PI / 180;

export const clamp = THREE.MathUtils.clamp;
export const lerp = THREE.MathUtils.lerp;

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

// 方位角：正北（-Z）為 0，順時針（往東 +X）增加，回傳 0–6400 密位
export function bearingMil(dx, dz) {
  let b = Math.atan2(dx, -dz);
  if (b < 0) b += Math.PI * 2;
  return toMil(b);
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function fmtMil(m) {
  const v = ((Math.round(m) % 6400) + 6400) % 6400;
  return v.toString().padStart(4, '0');
}

export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rng = Math.random) {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
