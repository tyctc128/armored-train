import * as THREE from 'three';
import { makeNoise2D, fbm, ridged } from './noise.js';
import { TRACK_X0, TRACK_X1, trackY, trackZ, distToTrack } from './track.js';
import { clamp, lerp, smoothstep } from '../core/math.js';

// 移動靶道路：鐵道南側
export const ROAD_X0 = -1300;
export const ROAD_X1 = 1300;
export const ROAD_OFFSET = 1650;
export function roadZ(x) {
  return trackZ(clamp(x, TRACK_X0, TRACK_X1)) * 0.3 + ROAD_OFFSET + 60 * Math.sin(x / 500);
}

export class Terrain {
  constructor({ size = 16000, segments = 640, seed = 1934 } = {}) {
    this.size = size;
    this.half = size / 2;
    this.seg = segments;
    this.cell = size / segments;
    this.n1 = makeNoise2D(seed);
    this.n2 = makeNoise2D(seed + 1);
    this.n3 = makeNoise2D(seed + 2);
    this.build();
  }

  naturalHeight(x, z) {
    const d = distToTrack(x, z);
    const rel = z - trackZ(clamp(x, TRACK_X0, TRACK_X1));
    let h = 20;
    h += fbm(this.n1, x / 1100, z / 1100, 4) * 46 * (0.3 + 0.7 * smoothstep(150, 2500, d));
    h += fbm(this.n2, x / 230, z / 230, 3) * 6 * (0.4 + 0.6 * smoothstep(60, 600, d));
    // 北方遠山
    h += smoothstep(4500, 7200, -rel) * (ridged(this.n3, x / 1700, z / 1700, 4) * 700 + 60);
    // 南方丘陵
    h += smoothstep(2700, 5200, rel) * ridged(this.n3, x / 1250 + 40, z / 1250, 4) * 340;
    return h;
  }

  roadBlend(x, z) {
    const along = smoothstep(ROAD_X0 - 200, ROAD_X0, x) * (1 - smoothstep(ROAD_X1, ROAD_X1 + 200, x));
    const dz = Math.abs(z - roadZ(x));
    return along * (1 - smoothstep(5, 32, dz));
  }

  heightFn(x, z) {
    let h = this.naturalHeight(x, z);
    const rb = this.roadBlend(x, z);
    if (rb > 0) h = lerp(h, this.naturalHeight(x, roadZ(x)) - 0.3, rb);
    const d = distToTrack(x, z);
    const w = smoothstep(26, 170, d);
    return lerp(trackY(clamp(x, TRACK_X0, TRACK_X1)) - 1.0, h, w);
  }

  build() {
    const N = this.seg;
    const geo = new THREE.PlaneGeometry(this.size, this.size, N, N);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    this.heights = new Float32Array((N + 1) * (N + 1));
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.heightFn(x, z);
      this.heights[i] = h;
      pos.setY(i, h);
    }
    geo.computeVertexNormals();

    // 頂點顏色：草地、乾草、岩石、雪、道路
    const nrm = geo.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    const uv = geo.attributes.uv;
    const grass = new THREE.Color(0x56603a);
    const dry = new THREE.Color(0x7d7552);
    const rock = new THREE.Color(0x6e6a62);
    const snow = new THREE.Color(0xdfe3e6);
    const dirt = new THREE.Color(0x6a5e4a);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const slope = 1 - nrm.getY(i);
      const v = fbm(this.n2, x / 400, z / 400, 3) * 0.5 + 0.5;
      c.copy(grass).lerp(dry, clamp(v * 1.2 - 0.1, 0, 1));
      c.lerp(rock, smoothstep(0.12, 0.35, slope));
      c.lerp(snow, smoothstep(330, 480, y) * (1 - smoothstep(0.35, 0.6, slope)));
      c.lerp(dirt, this.roadBlend(x, z) * 0.9);
      c.lerp(dirt, (1 - smoothstep(4, 14, distToTrack(x, z))) * 0.6);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      uv.setXY(i, x / 9, z / 9);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: detailTexture(),
      roughness: 1,
      metalness: 0,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
  }

  // 與網格三角化一致的高度查詢
  heightAt(x, z) {
    const N = this.seg;
    const fx = clamp((x + this.half) / this.cell, 0, N - 1e-4);
    const fz = clamp((z + this.half) / this.cell, 0, N - 1e-4);
    const j = Math.floor(fx);
    const i = Math.floor(fz);
    const tx = fx - j;
    const tz = fz - i;
    const W = N + 1;
    const h00 = this.heights[i * W + j];
    const h10 = this.heights[i * W + j + 1];
    const h01 = this.heights[(i + 1) * W + j];
    const h11 = this.heights[(i + 1) * W + j + 1];
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 2;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  // 沿射線步進找地面交點，回傳距離或 null
  raycast(origin, dir, maxDist = 16000) {
    let t = 0.5;
    let prevT = 0;
    while (t < maxDist) {
      const x = origin.x + dir.x * t;
      const y = origin.y + dir.y * t;
      const z = origin.z + dir.z * t;
      if (Math.abs(x) > this.half || Math.abs(z) > this.half) return null;
      if (y < this.heightAt(x, z)) {
        let a = prevT;
        let b = t;
        for (let k = 0; k < 16; k++) {
          const m = (a + b) / 2;
          const yy = origin.y + dir.y * m;
          if (yy < this.heightAt(origin.x + dir.x * m, origin.z + dir.z * m)) b = m;
          else a = m;
        }
        return (a + b) / 2;
      }
      prevT = t;
      t += 1.5 + t * 0.004;
    }
    return null;
  }
}

function detailTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const n = makeNoise2D(7);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 可平鋪：在環面上取樣
      const a = (x / size) * Math.PI * 2;
      const b = (y / size) * Math.PI * 2;
      const v =
        n(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + Math.cos(b) * 3) * 0.6 +
        n(Math.cos(a) * 9 + Math.sin(b) * 9, Math.sin(a) * 9 + 30) * 0.4;
      const k = 215 + v * 35 + (Math.random() - 0.5) * 36;
      const o = (y * size + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = clamp(k, 0, 255);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
