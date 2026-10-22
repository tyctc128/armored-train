import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Blender 輸出的車廂模型（由 tools/blender/*.py 產生）；載入失敗時改用程式建模
const MODELS = {
  gunA: 'models/gun_car_a.glb',
};

export async function loadModels(onProgress) {
  const loader = new GLTFLoader();
  const out = {};
  await Promise.all(
    Object.entries(MODELS).map(async ([key, url]) => {
      try {
        const gltf = await loader.loadAsync(url, onProgress);
        out[key] = gltf.scene;
      } catch (err) {
        console.warn(`模型載入失敗，改用程式模型：${url}`, err);
      }
    }),
  );
  return out;
}
