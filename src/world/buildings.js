import * as THREE from 'three';
import { worldMaterial } from '../render/materials.js';

// 沿線建築（1930 年代滿鐵沿線的樣子）：紅磚站房與雨棚、水塔、臂木式號誌機、土坯民房。
// 磚牆與屋瓦的貼圖由程式在畫布上畫出，其餘用 Poly Haven 的實拍貼圖。

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// 紅磚（一張 = 2 m：8 皮磚、每皮 8 塊，錯縫砌）
function brickTexture() {
  return canvasTexture(512, (g, n) => {
    g.fillStyle = '#b9b0a0';
    g.fillRect(0, 0, n, n);
    const rows = 26;
    const cols = 9;
    const h = n / rows;
    const w = n / cols;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let r = 0; r < rows; r++) {
      for (let c = -1; c < cols; c++) {
        const x = c * w + (r % 2 ? w / 2 : 0);
        const k = rnd();
        const R = 132 + k * 50;
        g.fillStyle = `rgb(${R | 0},${(62 + k * 26) | 0},${(48 + k * 18) | 0})`;
        g.fillRect(x + 1.2, r * h + 1.2, w - 2.4, h - 2.4);
      }
    }
    // 污漬與風化
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '30,24,20' : '200,190,170'},${0.03 + rnd() * 0.06})`;
      g.fillRect(rnd() * n, rnd() * n, 4 + rnd() * 26, 2 + rnd() * 9);
    }
  });
}

// 日式桟瓦屋頂（一張 = 2 m）
function tileTexture() {
  return canvasTexture(512, (g, n) => {
    g.fillStyle = '#3c4044';
    g.fillRect(0, 0, n, n);
    const cols = 8;
    const rows = 7;
    const w = n / cols;
    const h = n / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const grad = g.createLinearGradient(c * w, 0, (c + 1) * w, 0);
        grad.addColorStop(0, '#2a2d30');
        grad.addColorStop(0.45, '#6a6e72');
        grad.addColorStop(1, '#35383b');
        g.fillStyle = grad;
        g.fillRect(c * w, r * h, w, h - 3);
      }
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(0, (r + 1) * h - 4, n, 4);
    }
  });
}

function sign(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#e8e2d0';
  g.fillRect(0, 0, 512, 160);
  g.strokeStyle = '#1d1a16';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 502, 150);
  g.fillStyle = '#1d1a16';
  g.font = 'bold 96px "Noto Serif TC", "PMingLiU", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 84);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let mats;
function materials() {
  if (mats) return mats;
  mats = {
    brick: worldMaterial('dirt', 2.0, { texture: brickTexture(), color: 0x7c7672 }),
    tile: worldMaterial('dirt', 2.0, { texture: tileTexture(), color: 0x8a8a8a }),
    adobe: worldMaterial('dirt', 2.5, { color: 0xc9b089 }),
    thatch: worldMaterial('grass', 1.6, { color: 0x86775c }),
    wood: worldMaterial('planks', 1.5, { color: 0x6a5a4c }),
    woodDark: worldMaterial('planks', 1.5, { color: 0x3c332c }),
    white: new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1c2428, roughness: 0.25, metalness: 0.3 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xcfc6ae, roughness: 1 }),
    iron: worldMaterial('rust', 2.0, { color: 0x5a5048, roughness: 0.8, metalness: 0.4 }),
    stone: worldMaterial('gravel', 1.2, { color: 0xd6d0c4 }),
    red: new THREE.MeshStandardMaterial({ color: 0x9c2a22, roughness: 0.7 }),
  };
  return mats;
}

function box(group, mat, w, h, d, x, y, z, ry = 0, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

// 山牆屋頂：屋脊沿 X；w 為長度、d 為進深、rise 為屋脊高出簷口的高度
function gableRoof(group, mat, wallMat, w, d, y, rise, overhang = 0.6) {
  const half = d / 2 + overhang;
  const slope = Math.hypot(half, rise);
  const ang = Math.atan2(rise, half);
  for (const s of [-1, 1]) {
    box(group, mat, w + overhang * 2, 0.16, slope + 0.1, 0, y + rise / 2, (s * half) / 2, 0, s * ang);
  }
  // 山牆三角形
  const shape = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise * (d / 2) / half)]);
  for (const s of [-1, 1]) {
    const g = new THREE.Mesh(new THREE.ShapeGeometry(shape), wallMat);
    g.rotation.y = (s * Math.PI) / 2;
    g.position.set(s * (w / 2 - 0.01), y, 0);
    g.material.side = THREE.DoubleSide;
    g.castShadow = true;
    group.add(g);
  }
}

// 站房：紅磚、桟瓦山牆屋頂、朝月台的木造雨棚、白框窗、煙囪、站名牌。原點在站房中心地面，-Z 朝鐵道。
export function buildStation(name) {
  const M = materials();
  const g = new THREE.Group();
  const W = 24;
  const D = 8;
  const H = 4.2;
  box(g, M.brick, W, H, D, 0, H / 2, 0);
  box(g, M.stone, W + 0.3, 0.5, D + 0.3, 0, 0.25, 0); // 石砌牆基
  gableRoof(g, M.tile, M.brick, W, D, H, 2.6);
  box(g, M.brick, 0.9, 2.2, 0.9, -7, H + 2.4, 1.2); // 煙囪
  box(g, M.stone, 1.1, 0.2, 1.1, -7, H + 3.55, 1.2);
  // 窗與門（兩側長牆）
  for (const side of [-1, 1]) {
    const z = side * (D / 2 + 0.02);
    for (let i = 0; i < 7; i++) {
      const x = -W / 2 + 2.2 + i * 3.25;
      const door = i === 2 || i === 4;
      const hh = door ? 2.5 : 1.7;
      const yy = door ? 1.25 + 0.5 : 2.3;
      box(g, M.white, 1.5, hh + 0.3, 0.08, x, yy, z);
      box(g, door ? M.woodDark : M.glass, 1.2, hh, 0.1, x, yy, z + side * 0.01);
      if (!door) {
        box(g, M.white, 0.06, hh, 0.12, x, yy, z + side * 0.02);
        box(g, M.white, 1.2, 0.06, 0.12, x, yy, z + side * 0.02);
        box(g, M.stone, 1.7, 0.14, 0.3, x, yy - hh / 2 - 0.15, z); // 窗台
      }
    }
  }
  // 月台雨棚：木柱、橫樑、斜屋面
  const cz = -D / 2 - 2.0;
  box(g, M.tile, W + 2, 0.14, 4.4, 0, 3.55, cz, 0, -0.14);
  for (let i = 0; i <= 6; i++) {
    const x = -W / 2 + 0.6 + i * ((W - 1.2) / 6);
    box(g, M.wood, 0.22, 3.25, 0.22, x, 1.62, cz - 1.7);
    box(g, M.wood, 0.16, 0.2, 3.9, x, 3.38, cz - 0.1, 0, -0.14);
  }
  box(g, M.wood, W, 0.24, 0.2, 0, 3.22, cz - 1.7);
  // 站名牌（月台側、雨棚下）
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), new THREE.MeshStandardMaterial({ map: sign(name), roughness: 0.9 }));
  board.position.set(0, 2.75, cz - 1.85);
  board.rotation.y = Math.PI;
  g.add(board);
  for (const x of [-1.45, 1.45]) box(g, M.woodDark, 0.12, 0.6, 0.12, x, 3.0, cz - 1.8);
  // 長椅與貨物
  box(g, M.wood, 2.4, 0.08, 0.45, -6, 0.5, -D / 2 - 0.5);
  box(g, M.wood, 2.4, 0.5, 0.06, -6, 0.8, -D / 2 - 0.25);
  for (const x of [-7.1, -4.9]) box(g, M.woodDark, 0.08, 0.5, 0.4, x, 0.25, -D / 2 - 0.5);
  for (let i = 0; i < 5; i++) box(g, M.wood, 0.9, 0.7, 0.7, 7 + (i % 3) * 1.0, 0.35 + Math.floor(i / 3) * 0.7, -D / 2 - 0.7, i * 0.2);
  return g;
}

// 水塔：磚砌圓筒基座、鐵箍木桶水槽、錐形頂、給水管
export function buildWaterTower() {
  const M = materials();
  const g = new THREE.Group();
  const add = (geo, mat, y) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  add(new THREE.CylinderGeometry(2.3, 2.6, 6.5, 20), M.brick, 3.25);
  add(new THREE.CylinderGeometry(3.2, 3.2, 0.3, 24), M.stone, 6.65);
  add(new THREE.CylinderGeometry(3.0, 3.0, 3.6, 24), M.woodDark, 8.6);
  for (const y of [7.2, 8.6, 10.0]) add(new THREE.CylinderGeometry(3.04, 3.04, 0.12, 24, 1, true), M.iron, y);
  add(new THREE.ConeGeometry(3.4, 1.6, 24), M.iron, 11.2);
  const pipe = add(new THREE.CylinderGeometry(0.14, 0.14, 5.5, 8), M.iron, 6.0);
  pipe.rotation.x = 1.0;
  pipe.position.z = -4.3;
  box(g, M.woodDark, 0.9, 2.0, 0.1, 0, 1.0, -2.45); // 門
  return g;
}

// 臂木式號誌機
export function buildSemaphore() {
  const M = materials();
  const g = new THREE.Group();
  box(g, M.white, 0.2, 8, 0.2, 0, 4, 0);
  box(g, M.woodDark, 0.24, 2.2, 0.24, 0, 1.1, 0);
  const arm = box(g, M.red, 1.5, 0.26, 0.05, 0.7, 7.3, -0.14);
  arm.rotation.z = -0.5;
  box(g, M.white, 0.22, 0.27, 0.06, 1.1, 7.07, -0.14).rotation.z = -0.5;
  box(g, M.iron, 0.5, 0.05, 0.5, 0, 6.2, 0);
  for (let i = 0; i < 12; i++) box(g, M.iron, 0.34, 0.03, 0.03, 0, 0.7 + i * 0.45, 0.14); // 爬梯
  return g;
}

// 土坯民房（單位尺寸，實例化時依寬、高、進深縮放）：回傳 [幾何, 材質] 清單
export function housePrototype() {
  const M = materials();
  const parts = [];
  const add = (geo, mat) => parts.push([geo, mat]);
  const boxGeo = (w, h, d, x, y, z, rx = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    return g;
  };
  add(boxGeo(1, 1, 1, 0, 0.5, 0), M.adobe);
  // 山牆（屋脊沿 X）
  const rise = 0.42;
  for (const s of [-1, 1]) {
    const tri = new THREE.BufferGeometry();
    const x = s * 0.5;
    tri.setAttribute('position', new THREE.Float32BufferAttribute(s > 0 ? [x, 1, 0.5, x, 1, -0.5, x, 1 + rise, 0] : [x, 1, -0.5, x, 1, 0.5, x, 1 + rise, 0], 3));
    tri.computeVertexNormals();
    add(tri, M.adobe);
  }
  const half = 0.62;
  const ang = Math.atan2(rise * (half / 0.5), half);
  const slope = Math.hypot(half, rise * (half / 0.5));
  for (const s of [-1, 1]) add(boxGeo(1.16, 0.07, slope, 0, 0, 0, s * ang).translate(0, 1 + (rise * (half / 0.5)) / 2 - 0.04, (s * half) / 2), M.thatch);
  // 門、紙窗（朝南 +Z）、煙囪
  add(boxGeo(0.13, 0.62, 0.02, -0.05, 0.31, 0.505), M.woodDark);
  for (const x of [-0.32, 0.25]) {
    add(boxGeo(0.2, 0.3, 0.02, x, 0.6, 0.505), M.woodDark);
    add(boxGeo(0.16, 0.26, 0.025, x, 0.6, 0.507), M.paper);
  }
  add(boxGeo(0.07, 0.5, 0.1, 0.42, 1.3, -0.2), M.adobe);
  return parts;
}
