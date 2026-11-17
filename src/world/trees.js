import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';

// 冬天落葉後的樹（楊樹、柳樹／榆樹）：以程式在畫布上畫出枝幹，貼在三片交叉的面片上。
// 遠看有細枝的層次，面數極少（每棵 6 個三角形），可以大量種植。

function drawTree(kind, seed) {
  const W = 512;
  const H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const rng = mulberry32(seed);
  g.lineCap = 'round';
  const poplar = kind === 'poplar';

  const seg = (x0, y0, x1, y1, w, depth) => {
    const t = Math.min(1, depth / 7);
    // 粗枝深褐、細枝灰褐
    g.strokeStyle = `rgb(${Math.round(84 - 34 * t)},${Math.round(74 - 30 * t)},${Math.round(64 - 28 * t)})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  };

  const branch = (x, y, ang, len, w, depth) => {
    if (depth <= 0 || w < 0.35) return;
    // 一段枝條分成兩小段，帶一點彎曲
    const bend = (rng() - 0.5) * 0.25;
    const mx = x + Math.sin(ang) * len * 0.5;
    const my = y - Math.cos(ang) * len * 0.5;
    const a2 = ang + bend;
    const x2 = mx + Math.sin(a2) * len * 0.5;
    const y2 = my - Math.cos(a2) * len * 0.5;
    seg(x, y, mx, my, w, depth);
    seg(mx, my, x2, y2, w * 0.85, depth);
    if (poplar) {
      // 楊樹：主幹一路向上，側枝斜向上收攏
      branch(x2, y2, a2 * 0.5 + (rng() - 0.5) * 0.12, len * 0.8, w * 0.74, depth - 1);
      const n = depth > 2 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const side = i === 0 ? 1 : -1;
        branch(x2, y2, a2 + side * (0.35 + rng() * 0.3), len * (0.5 + rng() * 0.2), w * 0.45, depth - 2);
        branch(mx, my, a2 - side * (0.4 + rng() * 0.3), len * (0.45 + rng() * 0.2), w * 0.4, depth - 2);
      }
    } else {
      // 柳樹／榆樹：分叉寬、樹冠圓，末梢細枝略下垂
      const n = depth > 5 ? 3 : 2 + (rng() < 0.35 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const spread = (i / (n - 1) - 0.5) * 1.3 + (rng() - 0.5) * 0.4;
        const droop = depth < 3 ? Math.sign(a2 || 1) * 0.35 : 0;
        branch(x2, y2, a2 + spread + droop, len * (0.66 + rng() * 0.16), w * 0.62, depth - 1);
      }
    }
  };

  if (poplar) branch(W / 2, H - 4, 0, H * 0.2, 15, 9);
  else branch(W / 2, H - 4, (rng() - 0.5) * 0.1, H * 0.24, 22, 8);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function crossGeometry() {
  // 三片交叉的直立面片，底部在原點，寬 1、高 1
  const pos = [];
  const uv = [];
  const nrm = [];
  const idx = [];
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3;
    const dx = Math.cos(a) * 0.5;
    const dz = Math.sin(a) * 0.5;
    const o = pos.length / 3;
    pos.push(-dx, 0, -dz, dx, 0, dz, dx, 1, dz, -dx, 1, -dz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    // 法線一律朝上偏外，讓受光均勻、不會一片亮一片黑
    for (let i = 0; i < 4; i++) nrm.push(0, 1, 0);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return geo;
}

const VARIANTS = [
  ['poplar', 11, 0.36],
  ['poplar', 23, 0.36],
  ['willow', 37, 0.8],
  ['willow', 51, 0.8],
];

// spots：[{ x, y, z, h, rot, v }]，v 為 0–1 的亂數（決定樹種）
export function buildTrees(spots) {
  const group = new THREE.Group();
  const geo = crossGeometry();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  VARIANTS.forEach(([kind, seed, aspect], vi) => {
    const mine = spots.filter((t) => Math.min(VARIANTS.length - 1, Math.floor(t.v * VARIANTS.length)) === vi);
    if (!mine.length) return;
    const mat = new THREE.MeshStandardMaterial({
      map: drawTree(kind, seed),
      alphaTest: 0.3,
      alphaToCoverage: true,
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, mine.length);
    mine.forEach((t, i) => {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t.rot);
      s.set(t.h * aspect, t.h, t.h * aspect);
      p.set(t.x, t.y, t.z);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    group.add(mesh);
  });
  return group;
}
