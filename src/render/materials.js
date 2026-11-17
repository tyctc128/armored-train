import * as THREE from 'three';

// 寫實材質：把 GLB 內的平塗材質換成帶法線／粗糙度細節的 PBR 材質，並加上依高度分布的塵土與煤煙。
// 細節貼圖取自 Poly Haven（CC0），由 tools/textures/pack.py 壓縮到 public/textures。
// 模型的 UV 為盒狀投影：1 個 UV 單位 = 4 m，各貼圖以 repeat 決定實際大小。

const loader = new THREE.TextureLoader();
const sources = new Map();
const variants = new Map();
let maxAniso = 8;

export function setMaxAnisotropy(n) {
  maxAniso = Math.min(8, n);
}

// 取得貼圖（同一張圖不同 repeat 共用同一份影像資料）
export function tex(name, repeat = 1, srgb = false) {
  const key = `${name}|${repeat}`;
  if (variants.has(key)) return variants.get(key);
  let src = sources.get(name);
  const fresh = !src;
  if (fresh) {
    src = loader.load(`${import.meta.env.BASE_URL}textures/${name}.jpg`, () => {
      for (const [k, t] of variants) if (k.startsWith(`${name}|`)) t.needsUpdate = true;
    });
    sources.set(name, src);
  }
  const t = fresh ? src : src.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = maxAniso;
  variants.set(key, t);
  return t;
}

// 材質名稱（Blender 端命名）→ 寫實設定
//   set：細節貼圖組；rep：每 4 m 重複幾次；n：法線強度；rough／metal：整體係數
//   albedo：true 時以該組的顏色貼圖取代原色；detail：把顏色貼圖的明暗疊到原貼圖上（漆面不均、掉漆）
//   weather：'ext' 車外（下緣塵土、頂面煤煙）、'in' 車內（地板附近的髒污）
const SPECS = {
  Armor: { set: 'paint', rep: 3, n: 0.9, rough: 1.0, metal: 0.0, detail: 0.55, weather: 'ext' },
  InteriorPaint: { set: 'paint', rep: 3, n: 0.6, rough: 0.95, metal: 0.0, detail: 0.4, weather: 'in' },
  InteriorSteel: { set: 'paint', rep: 4, n: 0.5, rough: 0.9, metal: 0.0, detail: 0.35, weather: 'in' },
  Wood: { set: 'planks', rep: 2, n: 1.0, rough: 1.0, metal: 0.0, albedo: true, color: 0xb9a184, weather: 'in' },
  DarkSteel: { set: 'rust', rep: 4, n: 0.7, rough: 0.9, metal: 0.55, albedo: true, color: 0x6a625c, weather: 'ext' },
  Wheel: { set: 'rust', rep: 5, n: 0.8, rough: 0.85, metal: 0.6, albedo: true, color: 0x5a524c, weather: 'ext' },
  GunMetal: { set: 'paint', rep: 6, n: 0.25, rough: 0.55, metal: 0.85 },
  Brass: { set: 'paint', rep: 6, n: 0.2, rough: 0.5, metal: 1.0 },
  Copper: { set: 'paint', rep: 6, n: 0.2, rough: 0.55, metal: 1.0 },
  Olive: { set: 'paint', rep: 5, n: 0.5, rough: 0.95, metal: 0.0, detail: 0.35 },
  Red: { set: 'paint', rep: 5, n: 0.4, rough: 0.8, metal: 0.0, detail: 0.3 },
  Paper: { set: 'wool', rep: 10, n: 0.15, rough: 1.0, metal: 0.0 },
  Canvas: { set: 'wool', rep: 14, n: 0.8, rough: 1.0, metal: 0.0, detail: 0.5, gain: 1.9 },
  Coal: { set: 'gravel', rep: 6, n: 1.0, rough: 1.0, metal: 0.0 },
  // 人物
  Wool: { set: 'wool', rep: 22, n: 0.9, rough: 1.0, metal: 0.0, detail: 0.5, gain: 1.9 },
  WoolDark: { set: 'wool', rep: 22, n: 1.0, rough: 1.0, metal: 0.0, detail: 0.5, gain: 1.9 },
  Leather: { set: 'leather', rep: 10, n: 0.7, rough: 0.75, metal: 0.0, detail: 0.5, gain: 3.0 },
  Boot: { set: 'leather', rep: 8, n: 0.8, rough: 0.7, metal: 0.0, detail: 0.5, gain: 3.0 },
  Helmet: { set: 'paint', rep: 8, n: 0.6, rough: 0.9, metal: 0.0, detail: 0.5 },
  RifleWood: { set: 'planks', rep: 9, n: 0.3, rough: 0.7, metal: 0.0 },
  Steel: { set: 'paint', rep: 8, n: 0.2, rough: 0.5, metal: 0.85 },
  // 馬
  Coat: { set: 'wool', rep: 9, n: 0.3, rough: 0.8, metal: 0.0, detail: 0.3, gain: 1.9 },
  Mane: { set: 'wool', rep: 12, n: 1.0, rough: 1.0, metal: 0.0, detail: 0.4, gain: 1.9 },
};

const DUST = new THREE.Color(0x8a7a5c); // 滿洲平原的黃土色
const built = new Map();

function build(src, spec, aoMap) {
  const m = new THREE.MeshStandardMaterial({ name: src.name, side: src.side });
  m.color.copy(src.color);
  m.vertexColors = src.vertexColors; // 人物把烘焙的縫隙陰影存在頂點色
  m.map = src.map ?? null;
  if (spec.albedo) {
    m.map = tex(`${spec.set}_d`, spec.rep, true);
    m.color.set(spec.color ?? 0xffffff);
  }
  m.normalMap = tex(`${spec.set}_n`, spec.rep);
  m.normalScale.setScalar(spec.n);
  m.roughnessMap = tex(`${spec.set}_orm`, spec.rep);
  m.roughness = spec.rough;
  m.metalness = spec.metal;
  if (aoMap) {
    m.aoMap = aoMap;
    m.aoMapIntensity = 1.0;
  }
  const detail = spec.detail ? tex(`${spec.set}_d`, spec.rep, true) : null;
  if (detail || spec.weather) {
    const key = `w|${spec.weather ?? ''}|${detail ? spec.set : ''}|${spec.gain ?? ''}`;
    m.customProgramCacheKey = () => key;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uDetail = { value: detail };
      shader.uniforms.uDetailAmt = { value: spec.detail ?? 0 };
      shader.uniforms.uDetailRep = { value: spec.rep };
      shader.uniforms.uDust = { value: DUST };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aH;\nvarying float vH;\nvarying vec3 vWN;\nvarying vec2 vBaseUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = aH;\nvWN = normalize(mat3(modelMatrix) * normal);\nvBaseUv = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying float vH;
          varying vec3 vWN;
          varying vec2 vBaseUv;
          uniform sampler2D uDetail;
          uniform float uDetailAmt;
          uniform float uDetailRep;
          uniform vec3 uDust;
          float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float wNoise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
          }
          float wFbm(vec2 p) { return 0.5 * wNoise(p) + 0.3 * wNoise(p * 2.3) + 0.2 * wNoise(p * 5.1); }`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          float wN = wFbm(vBaseUv * 9.0);
          ${detail ? `vec3 dTex = texture2D(uDetail, vBaseUv * uDetailRep).rgb;
          float dLum = dot(dTex, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb *= mix(1.0, clamp(dLum * ${(spec.gain ?? 4.5).toFixed(2)}, 0.4, 1.35), uDetailAmt);
          ${spec.set === 'paint' ? `// 貼圖中偏紅褐的部分是鏽斑與掉漆：直接露出底下的鏽色
          float chip = smoothstep(0.02, 0.1, dTex.r - dTex.g) * uDetailAmt * 1.6;
          diffuseColor.rgb = mix(diffuseColor.rgb, dTex * 0.9, clamp(chip, 0.0, 0.9));` : ''}
          // 大範圍的髒污濃淡
          diffuseColor.rgb *= 0.78 + 0.3 * wFbm(vBaseUv * 1.7 + 3.1);` : ''}
          ${spec.weather === 'ext' ? `
          // 下緣揚起的塵土：軌面以上 0.3–2.2 m 漸淡
          float dustAmt = smoothstep(2.3, 0.4, vH) * (0.35 + 0.65 * wN) * 0.75;
          // 朝上的面積塵與煤煙
          float up = smoothstep(0.55, 0.95, vWN.y);
          dustAmt = max(dustAmt, up * smoothstep(0.0, 1.6, vH) * 0.28 * (0.5 + wN));
          diffuseColor.rgb = mix(diffuseColor.rgb, uDust * (0.55 + 0.45 * wN), clamp(dustAmt, 0.0, 0.85));
          float soot = up * smoothstep(2.8, 3.6, vH) * (0.35 + 0.45 * wFbm(vBaseUv * 3.0));
          diffuseColor.rgb *= 1.0 - soot * 0.55;
          // 垂直面的雨水流痕
          float streak = wNoise(vec2(vBaseUv.x * 46.0, vBaseUv.y * 1.3)) * (1.0 - abs(vWN.y));
          diffuseColor.rgb *= 1.0 - smoothstep(0.55, 0.95, streak) * 0.22;` : ''}
          ${spec.weather === 'in' ? `
          // 車內：靠近地板的踢痕與積塵、整體使用痕跡
          float grime = smoothstep(2.3, 1.3, vH) * (0.3 + 0.7 * wN) * 0.65;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.44, 0.36), grime);
          diffuseColor.rgb *= 0.74 + 0.3 * wFbm(vBaseUv * 2.3);` : ''}
          #ifdef USE_AOMAP
          // 烘焙的縫隙陰影也稍微壓暗直射光下的顏色（電燈沒有陰影，否則角落會太平）
          float bakedAO = texture2D(aoMap, vAoMapUv).r;
          diffuseColor.rgb *= mix(1.0, bakedAO, ${spec.weather === 'in' ? '0.75' : '0.4'});
          #endif`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          ${spec.weather === 'ext' ? 'roughnessFactor = mix(roughnessFactor, 1.0, clamp(dustAmt * 1.3, 0.0, 1.0));' : ''}`,
        );
    };
  }
  return m;
}

// 燈泡網格（材質 Lamp）含該段車體所有燈泡：依位置分群，記下每個燈泡在車廂座標中的中心
function collectLamps(root, mesh, toRoot) {
  const pos = mesh.geometry.getAttribute('position');
  const groups = new Map();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(toRoot);
    const key = `${Math.round(v.x * 2)}|${Math.round(v.z * 2)}`;
    const g = groups.get(key) ?? { sum: new THREE.Vector3(), n: 0 };
    g.sum.add(v);
    g.n++;
    groups.set(key, g);
  }
  root.userData.lamps ??= [];
  for (const g of groups.values()) root.userData.lamps.push(g.sum.divideScalar(g.n));
}

// 把模型（一節車廂）的材質升級。ao：該車烘焙的環境光遮蔽貼圖（使用第二組 UV），可省略。
export function upgradeCarMaterials(root, kind, ao = null) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    // 每個頂點在車廂座標中的高度（軌頂起算），供塵土／煤煙分布使用
    if (!g.getAttribute('aH')) {
      rel.multiplyMatrices(inv, o.matrixWorld);
      const pos = g.getAttribute('position');
      const h = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) h[i] = v.fromBufferAttribute(pos, i).applyMatrix4(rel).y;
      g.setAttribute('aH', new THREE.BufferAttribute(h, 1));
    }
    const src = o.material;
    if (src.name === 'Lamp') collectLamps(root, o, rel.multiplyMatrices(inv, o.matrixWorld));
    const spec = SPECS[src.name];
    if (!spec) return;
    const hasUv1 = !!g.getAttribute('uv1');
    const key = `${kind}|${src.name}|${hasUv1 && ao ? 1 : 0}`;
    if (!built.has(key)) built.set(key, build(src, spec, hasUv1 ? ao : null));
    o.material = built.get(key);
  });
}

// 載入某節車廂的烘焙 AO 貼圖（模型檔名加 _ao.jpg）；沒有檔案時回傳 null
export function loadCarAO(modelUrl) {
  return new Promise((resolve) => {
    loader.load(
      `${import.meta.env.BASE_URL}${modelUrl.replace('.glb', '_ao.jpg')}`,
      (t) => {
        t.flipY = false; // glTF 的 UV 原點在左上
        t.channel = 1;
        t.colorSpace = THREE.NoColorSpace;
        resolve(t);
      },
      undefined,
      () => resolve(null),
    );
  });
}

// 以世界座標做三向投影的貼圖材質：給沒有 UV 的程式幾何（道碴、枕木、月台、土牆）使用。
// scale：貼圖一張代表幾公尺。
export function worldMaterial(set, scale, { color = 0xffffff, roughness = 1, metalness = 0, flatShading = false, texture = null } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading });
  const map = texture ?? tex(`${set}_d`, 1, true); // texture：自備貼圖（例如程式畫的磚牆）
  m.customProgramCacheKey = () => 'world-triplanar';
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTex = { value: map };
    shader.uniforms.uScale = { value: scale };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriN;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 triP = vec4(transformed, 1.0);
        vec3 triN = normal;
        #ifdef USE_INSTANCING
          triP = instanceMatrix * triP;
          triN = mat3(instanceMatrix) * triN;
        #endif
        vTriPos = (modelMatrix * triP).xyz;
        vTriN = normalize(mat3(modelMatrix) * triN);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriN;\nuniform sampler2D uTex;\nuniform float uScale;')
      .replace(
        '#include <map_fragment>',
        `vec3 triW = pow(abs(normalize(vTriN)), vec3(4.0));
        triW /= triW.x + triW.y + triW.z;
        vec3 triP = vTriPos / uScale;
        vec3 triC = texture2D(uTex, triP.zy).rgb * triW.x + texture2D(uTex, triP.xz).rgb * triW.y + texture2D(uTex, triP.xy).rgb * triW.z;
        // 遠處改用大尺度取樣，減少重複感
        float triFar = smoothstep(30.0, 200.0, distance(vTriPos, cameraPosition));
        triC = mix(triC, texture2D(uTex, triP.xz / 7.3).rgb, triFar * 0.7);
        diffuseColor.rgb *= triC * 2.2;`,
      )
      // 粗糙表面在掠射角不該映出天空
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectSpecular *= 0.1;');
  };
  return m;
}
