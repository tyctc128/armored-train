import * as THREE from 'three';

// 車內電燈：每節車廂的燈泡位置在載入模型時記在 userData.lamps。
// 為了效能，全場景只用少數幾盞點光源，每幀移到離鏡頭最近的幾個燈泡上。
const COUNT = 4;

export class InteriorLights {
  constructor(scene, train) {
    this.train = train;
    this.lights = [];
    for (let i = 0; i < COUNT; i++) {
      const l = new THREE.PointLight(0xffd29a, 0, 9, 1.6);
      scene.add(l);
      this.lights.push(l);
    }
    this._v = new THREE.Vector3();
    this.cands = [];
  }

  update(camera) {
    const cands = this.cands;
    cands.length = 0;
    for (const car of this.train.cars) {
      const root = car.group.children[0];
      const lamps = root?.userData.lamps;
      if (!lamps) continue;
      for (const p of lamps) {
        const w = this._v.copy(p).applyMatrix4(root.matrixWorld);
        const d = w.distanceToSquared(camera.position);
        if (d < 30 * 30) cands.push({ d, x: w.x, y: w.y, z: w.z });
      }
    }
    cands.sort((a, b) => a.d - b.d);
    this.lights.forEach((l, i) => {
      const c = cands[i];
      l.intensity = c ? 4.5 : 0;
      if (c) l.position.set(c.x, c.y - 0.12, c.z);
    });
  }
}
