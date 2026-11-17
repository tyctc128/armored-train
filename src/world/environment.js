import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// 天空、日照、霧與環境光。
// 天空用實拍的全景 HDR（Poly Haven「dry_field」，CC0）：初冬枯草原、晴時多雲、太陽仰角約 20°。
// HDR 載入前先用程式天空頂著。
const SUN_ELEV = 20.3; // HDR 中太陽的仰角（度）
const SUN_U = 0.5692; // HDR 中太陽的水平位置（0–1）
const SUN_AZ = 62; // 希望太陽所在方位：自 +X（東）往 +Z（南）量的角度

export function setupEnvironment(renderer, scene) {
  const el = THREE.MathUtils.degToRad(SUN_ELEV);
  const az = THREE.MathUtils.degToRad(SUN_AZ);
  const sunDir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));

  const sky = new Sky();
  sky.scale.setScalar(30000);
  const u = sky.material.uniforms;
  u.turbidity.value = 7;
  u.rayleigh.value = 1.4;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.82;
  u.sunPosition.value.copy(sunDir);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = sky.clone();
  envSky.material = sky.material;
  envScene.add(envSky);
  scene.environment = pmrem.fromScene(envScene, 0, 0.1, 50000).texture;
  scene.environmentIntensity = 0.55;
  scene.add(sky);

  // 冬天低角度的暖色陽光；天空光由 HDR 環境貼圖提供
  const sun = new THREE.DirectionalLight(0xffe6c4, 3.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -80;
  sc.right = 80;
  sc.top = 80;
  sc.bottom = -80;
  sc.near = 1;
  sc.far = 900;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.15; // 低角度日照需要較大的偏移，否則地面整片陰影瑕疵
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(0xcadcf0, 0x4d4a38, 0.55);
  scene.add(hemi);

  scene.fog = new THREE.FogExp2(0xaeb4b6, 0.00017);

  new HDRLoader().load(`${import.meta.env.BASE_URL}textures/sky_2k.hdr`, (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    // 把 HDR 的太陽轉到 SUN_AZ：貼圖中太陽的方位角為 (SUN_U − 0.5)·2π
    const rot = (SUN_U - 0.5) * Math.PI * 2 - az;
    scene.background = hdr;
    scene.backgroundRotation.set(0, rot, 0);
    scene.backgroundIntensity = 0.75;
    scene.environment = hdr;
    scene.environmentRotation.set(0, rot, 0);
    scene.environmentIntensity = 1.0;
    scene.remove(sky, hemi);
  });

  // 地平線的霧靄：遮住 HDR 全景裡的遠景（樹林、房舍），讓遠方融進冬天的薄霧
  const hazeCanvas = document.createElement('canvas');
  hazeCanvas.width = 4;
  hazeCanvas.height = 256;
  const hg = hazeCanvas.getContext('2d');
  const grad = hg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.62, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,1)');
  hg.fillStyle = grad;
  hg.fillRect(0, 0, 4, 256);
  const haze = new THREE.Mesh(
    new THREE.CylinderGeometry(22000, 22000, 5200, 48, 1, true),
    // 不透明佇列＋自訂混合：在地形之前畫，只蓋住天空背景，不會蓋到地形
    new THREE.MeshBasicMaterial({
      color: 0xaeb4b6, map: new THREE.CanvasTexture(hazeCanvas), side: THREE.BackSide, fog: false,
      blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      depthTest: false, depthWrite: false,
    }),
  );
  haze.renderOrder = -10;
  haze.frustumCulled = false;
  scene.add(haze);

  return {
    sun,
    sunDir,
    // 陰影跟著焦點（玩家或列車）移動
    update(focus) {
      sun.position.copy(focus).addScaledVector(sunDir, 400);
      sun.target.position.copy(focus);
      haze.position.set(focus.x, focus.y + 600, focus.z);
    },
  };
}
