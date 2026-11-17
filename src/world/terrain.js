import * as THREE from 'three';
import { tex } from '../render/materials.js';
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

  // 靶場觀測走廊：鐵道南側到靶車道路之間削成低平的窪地（只削高處、更低處保持原樣），
  // 讓列車上看得到道路上的移動靶車
  // 走廊權重（0–1）與橫向位置 u（鐵道 0 → 道路 1）
  rangeWeight(x, z) {
    const along = smoothstep(ROAD_X0 - 400, ROAD_X0 - 100, x) * (1 - smoothstep(ROAD_X1 + 100, ROAD_X1 + 400, x));
    if (along <= 0) return { w: 0, u: 0 };
    const tz = trackZ(clamp(x, TRACK_X0, TRACK_X1));
    const u = (z - tz) / (roadZ(x) - tz);
    const across = smoothstep(-0.02, 0.06, u) * (1 - smoothstep(0.96, 1.04, u));
    return { w: along * across, u };
  }

  rangeCorridor(x, z, h) {
    const { w, u } = this.rangeWeight(x, z);
    if (w <= 0) return h;
    const rz = roadZ(x);
    // 中間是固定高度的低地（比整條鐵道與道路都低），兩側緩坡接回鐵道路基與道路
    const BASIN = 14;
    const nearTrack = lerp(trackY(clamp(x, TRACK_X0, TRACK_X1)) - 1, BASIN, smoothstep(0.02, 0.12, u));
    const line = lerp(nearTrack, this.naturalHeight(x, rz) - 0.3, smoothstep(0.86, 0.98, u));
    return lerp(h, Math.min(h, line), w);
  }

  heightFn(x, z) {
    let h = this.naturalHeight(x, z);
    h = this.rangeCorridor(x, z, h);
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

    // 每個頂點的地表比例（aSplat）：r 泥土／岩石、g 積雪、b 明暗變化。實際貼圖混合在片段著色器中進行。
    const nrm = geo.attributes.normal;
    const splat = new Float32Array(pos.count * 3);
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const slope = 1 - nrm.getY(i);
      const v = fbm(this.n2, x / 400, z / 400, 3) * 0.5 + 0.5;
      let dirt = smoothstep(0.12, 0.35, slope);
      dirt = Math.max(dirt, this.roadBlend(x, z) * 0.95, (1 - smoothstep(4, 14, distToTrack(x, z))) * 0.75);
      // 試驗影片（1934 年 12 月）中沿線丘陵與平地都沒有積雪，所以只在最高的山頭留一點薄雪
      const snow = smoothstep(450, 720, y) * (1 - smoothstep(0.35, 0.6, slope)) * 0.08;
      splat[i * 3] = dirt;
      splat[i * 3 + 1] = snow;
      splat[i * 3 + 2] = v;
      uv.setXY(i, x / 5, z / 5);
    }
    geo.setAttribute('aSplat', new THREE.BufferAttribute(splat, 3));

    const mat = winterGroundMaterial();
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

// 初冬的滿洲平原地表：枯草為底，依 aSplat 混入泥土與積雪，另以雜訊加上零星殘雪與裸土。
// 近處用細緻貼圖、遠處換成大尺度取樣，避免貼圖重複的格子感。
function winterGroundMaterial() {
  const mat = new THREE.MeshStandardMaterial({ map: tex('grass_d', 1, true), normalMap: tex('grass_n', 1), roughness: 1, metalness: 0 });
  mat.normalScale.setScalar(0.8);
  const dirt = tex('dirt_d', 1, true);
  const snow = tex('snow_d', 1, true);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDirt = { value: dirt };
    shader.uniforms.uSnow = { value: snow };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aSplat;\nvarying vec3 vSplat;\nvarying vec3 vTerrPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = aSplat;\nvTerrPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vSplat;
        varying vec3 vTerrPos;
        uniform sampler2D uDirt;
        uniform sampler2D uSnow;
        float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float tNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float tFbm(vec2 p) { return 0.5 * tNoise(p) + 0.3 * tNoise(p * 2.1) + 0.2 * tNoise(p * 4.3); }
        float gSnowW = 0.0;`,
      )
      .replace(
        '#include <map_fragment>',
        `vec2 wp = vTerrPos.xz;
        float camD = distance(vTerrPos, cameraPosition);
        float farK = smoothstep(60.0, 600.0, camD);
        // 近處細節與大尺度取樣相乘，遠近都有草叢的濃淡，不會糊成一片
        vec3 gNear = texture2D(map, wp / 5.0).rgb;
        vec3 gFar = texture2D(map, wp / 43.0).rgb;
        vec3 grass = mix(gNear, gFar, farK) * (0.55 + 1.5 * dot(gFar, vec3(0.333)));
        vec3 soil = mix(texture2D(uDirt, wp / 4.0).rgb, texture2D(uDirt, wp / 37.0).rgb, farK);
        vec3 snowC = mix(texture2D(uSnow, wp / 6.0).rgb * 0.86, vec3(0.7, 0.73, 0.78), farK);
        float macro = tFbm(wp / 110.0);
        // 枯草的濃淡與色調變化（黃褐～灰褐）
        grass *= mix(vec3(0.5, 0.5, 0.46), vec3(0.86, 0.82, 0.7), macro) * (0.8 + 0.4 * vSplat.b);
        float bare = smoothstep(0.6, 0.78, tFbm(wp / 19.0 + 4.7));
        float dirtW = clamp(vSplat.r + bare * 0.55, 0.0, 1.0);
        float snowPatch = smoothstep(0.56, 0.68, tFbm(wp / 27.0 + 11.3)) * smoothstep(0.42, 0.66, tFbm(wp / 70.0 + 2.0));
        // 平地的殘雪只積在草叢之間，草尖仍會露出來
        float tuft = dot(texture2D(map, wp / 5.0).rgb, vec3(0.333));
        float thin = snowPatch * (1.0 - vSplat.r) * mix(0.8, 0.5, farK) * (1.0 - smoothstep(0.1, 0.3, tuft) * mix(0.75, 0.35, farK));
        gSnowW = clamp(vSplat.g * 1.4 + thin * 0.0, 0.0, 1.0); // 平地殘雪依影片拿掉（thin 保留以便日後做下雪的關卡）
        vec3 ground = mix(grass, soil * vec3(0.52, 0.5, 0.47), dirtW);
        diffuseColor.rgb = mix(ground, snowC, gSnowW);`,
      )
      // 粗糙的地表在掠射角不該像鏡子一樣映出天空（否則遠處地面會泛白）
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectSpecular *= 0.08;\nreflectedLight.directSpecular *= 0.3;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        // 遠處與積雪處不需要草的凹凸
        normal = normalize(mix(normal, nonPerturbedNormal, clamp(max(gSnowW * 0.8, smoothstep(20.0, 120.0, distance(vTerrPos, cameraPosition))), 0.0, 1.0)));`,
      );
  };
  return mat;
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
