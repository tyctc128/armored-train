import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// Blender 輸出的車廂模型（由 tools/blender/*.py 產生），鍵為車廂 kind；
// 缺檔或載入失敗時該節改用程式建模
const MODELS = {
  guard: 'models/guard_car.glb',
  gunA: 'models/gun_car_a.glb',
  gunB: 'models/gun_car_b.glb',
  gunC: 'models/gun_car_c.glb',
  command: 'models/command_car.glb',
  loco: 'models/locomotive.glb',
  tender: 'models/tender_car.glb',
  power: 'models/power_car.glb',
  // 軍士（tools/blender/soldier.py）
  npc_soldier: 'models/crew_soldier.glb',
  npc_crew: 'models/crew_crew.glb',
  npc_officer: 'models/crew_officer.glb',
  npc_enemy: 'models/crew_enemy.glb',
  horse: 'models/horse.glb',
};

export async function loadModels(onProgress) {
  const draco = new DRACOLoader();
  draco.setDecoderPath('draco/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  const out = {};
  let done = 0;
  const total = Object.keys(MODELS).length;
  await Promise.all(
    Object.entries(MODELS).map(async ([kind, url]) => {
      try {
        const gltf = await loader.loadAsync(url);
        out[kind] = gltf.scene;
      } catch (err) {
        console.warn(`模型載入失敗，改用程式模型：${url}`, err);
      }
      onProgress?.(++done, total);
    }),
  );
  draco.dispose();
  return out;
}
