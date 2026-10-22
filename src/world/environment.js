import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

// 天空、日照、霧與環境光
export function setupEnvironment(renderer, scene) {
  const sky = new Sky();
  sky.scale.setScalar(30000);
  const u = sky.material.uniforms;
  u.turbidity.value = 7;
  u.rayleigh.value = 1.4;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.82;

  const sunDir = new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - 36),
    THREE.MathUtils.degToRad(25), // 太陽在東南方（+Z 為南）
  );
  u.sunPosition.value.copy(sunDir);

  // 以天空產生環境貼圖（讓金屬有反射）
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = sky.clone();
  envSky.material = sky.material;
  envScene.add(envSky);
  scene.environment = pmrem.fromScene(envScene, 0, 0.1, 50000).texture;
  scene.environmentIntensity = 0.55;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xcadcf0, 0x4d4a38, 0.55);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -70;
  sc.right = 70;
  sc.top = 70;
  sc.bottom = -70;
  sc.near = 1;
  sc.far = 800;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  scene.fog = new THREE.FogExp2(0xb7c4cf, 0.000075);

  return {
    sun,
    sunDir,
    // 陰影跟著焦點（玩家或列車）移動
    update(focus) {
      sun.position.copy(focus).addScaledVector(sunDir, 400);
      sun.target.position.copy(focus);
    },
  };
}
