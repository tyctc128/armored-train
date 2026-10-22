import { mulberry32 } from '../core/math.js';

// 2D Perlin 雜訊（可指定種子）
export function makeNoise2D(seed = 1) {
  const rng = mulberry32(seed);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y) => {
    switch (h & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  };

  return function noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const X = xi & 255;
    const Y = yi & 255;
    const xf = x - xi;
    const yf = y - yi;
    const u = fade(xf);
    const v = fade(yf);
    const aa = p[p[X] + Y];
    const ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y];
    const bb = p[p[X + 1] + Y + 1];
    const x1 = grad(aa, xf, yf) + u * (grad(ba, xf - 1, yf) - grad(aa, xf, yf));
    const x2 = grad(ab, xf, yf - 1) + u * (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1));
    return (x1 + v * (x2 - x1)) * 0.7071;
  };
}

export function fbm(noise, x, y, octaves = 5, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x, y) * amp;
    norm += amp;
    amp *= gain;
    x *= lacunarity;
    y *= lacunarity;
  }
  return sum / norm;
}

// 山脊雜訊：0–1
export function ridged(noise, x, y, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise(x, y));
    sum += n * n * amp;
    norm += amp;
    amp *= 0.5;
    x *= 2.03;
    y *= 2.03;
  }
  return sum / norm;
}
