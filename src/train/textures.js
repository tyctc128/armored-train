import * as THREE from 'three';

function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.repeat.set(repeat, repeat);
  return tex;
}

// 鉚接裝甲板：一張貼圖代表 2 m × 2 m
export function armorTexture() {
  return canvasTex(
    512,
    (g, S) => {
      g.fillStyle = '#b8b8b0';
      g.fillRect(0, 0, S, S);
      // 污漬
      for (let i = 0; i < 260; i++) {
        const x = Math.random() * S;
        const y = Math.random() * S;
        const r = 6 + Math.random() * 40;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        const a = Math.random() * 0.08;
        grd.addColorStop(0, `rgba(40,36,28,${a})`);
        grd.addColorStop(1, 'rgba(40,36,28,0)');
        g.fillStyle = grd;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // 板縫（每 1 m）
      g.strokeStyle = 'rgba(30,30,24,0.55)';
      g.lineWidth = 3;
      for (const k of [0, S / 2]) {
        g.beginPath();
        g.moveTo(0, k + 1.5);
        g.lineTo(S, k + 1.5);
        g.moveTo(k + 1.5, 0);
        g.lineTo(k + 1.5, S);
        g.stroke();
      }
      // 鉚釘
      const rivet = (x, y) => {
        g.fillStyle = 'rgba(25,25,20,0.55)';
        g.beginPath();
        g.arc(x + 1, y + 1, 3.2, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(235,235,225,0.55)';
        g.beginPath();
        g.arc(x - 0.6, y - 0.6, 2.2, 0, Math.PI * 2);
        g.fill();
      };
      for (const k of [0, S / 2]) {
        for (let t = 8; t < S; t += 16) {
          rivet(t, k + 10);
          rivet(k + 10, t);
        }
      }
    },
    0.5,
  );
}

export function woodTexture() {
  return canvasTex(
    256,
    (g, S) => {
      g.fillStyle = '#6d5638';
      g.fillRect(0, 0, S, S);
      const plank = S / 8;
      for (let i = 0; i < 8; i++) {
        g.fillStyle = `hsl(32, 30%, ${22 + Math.random() * 8}%)`;
        g.fillRect(0, i * plank + 1, S, plank - 2);
        for (let k = 0; k < 14; k++) {
          g.strokeStyle = 'rgba(20,12,4,0.15)';
          g.beginPath();
          const y = i * plank + Math.random() * plank;
          g.moveTo(0, y);
          g.bezierCurveTo(S / 3, y + 3, (S * 2) / 3, y - 3, S, y);
          g.stroke();
        }
      }
    },
    0.5,
  );
}

// 射擊靶面：同心圓
export function targetTexture() {
  return canvasTex(256, (g, S) => {
    g.fillStyle = '#ece6d2';
    g.fillRect(0, 0, S, S);
    const cx = S / 2;
    for (let r = 120, k = 0; r > 10; r -= 22, k++) {
      g.fillStyle = k % 2 ? '#ece6d2' : '#1b1b1b';
      g.beginPath();
      g.arc(cx, cx, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#c4322a';
    g.beginPath();
    g.arc(cx, cx, 12, 0, Math.PI * 2);
    g.fill();
  });
}

export function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 煙霧：帶雜點的柔邊圓
export function smokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 64 + (Math.random() - 0.5) * 50;
    const y = 64 + (Math.random() - 0.5) * 50;
    const r = 20 + Math.random() * 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.22)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
