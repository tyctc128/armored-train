import * as THREE from 'three';
import { worldMaterial } from '../render/materials.js';
import { mulberry32 } from '../core/math.js';
import { fbm } from './noise.js';
import { distToTrack, trackZ, trackY } from './track.js';
import { buildTrees } from './trees.js';

// 樹林、村落、起點站
export function buildScenery(scene, terrain) {
  const rng = mulberry32(42);
  const group = new THREE.Group();

  // 樹：落葉後的楊樹與柳樹（交叉面片），沿河谷與村落成片分布
  const nrm = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const spots = [];
  for (let tries = 0; tries < 90000 && spots.length < 9000; tries++) {
    const x = (rng() - 0.5) * 11000;
    const z = (rng() - 0.5) * 11000;
    const density = fbm(terrain.n1, x / 700 + 13, z / 700 - 7, 3);
    if (density < 0.12) continue;
    if (distToTrack(x, z) < 45) continue;
    if (terrain.roadBlend(x, z) > 0.05) continue;
    if (terrain.rangeWeight(x, z).w > 0.2) continue; // 靶場平原不種樹，以免擋住靶車
    const y = terrain.heightAt(x, z);
    if (y > 300) continue;
    terrain.normalAt(x, z, nrm);
    if (nrm.y < 0.85) continue;
    spots.push({ x, y: y - 0.2, z, h: 9 + rng() * 9, rot: rng() * Math.PI, v: rng() });
  }
  group.add(buildTrees(spots));

  // 村落：鐵道北側約 650 m 的一群土牆房舍
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  wallGeo.translate(0, 0.5, 0);
  const roofGeo = new THREE.ConeGeometry(0.75, 0.5, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.translate(0, 1.25, 0);
  const wallMat = worldMaterial('dirt', 2.5, { color: 0xc9b089 });
  const roofMat = worldMaterial('grass', 2.0, { color: 0x8f7d5c, flatShading: true });
  const houses = [];
  for (const [cx, off] of [
    [700, -650],
    [-300, 900],
  ]) {
    const cz = trackZ(cx) + off;
    for (let k = 0; k < 14; k++) {
      const x = cx + (rng() - 0.5) * 220;
      const z = cz + (rng() - 0.5) * 160;
      houses.push([x, z, 6 + rng() * 6, 5 + rng() * 4, 3 + rng() * 1.5, rng() * 0.4]);
    }
  }
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, houses.length);
  const roofs = new THREE.InstancedMesh(roofGeo, roofMat, houses.length);
  houses.forEach(([x, z, w, d, h, yaw], i) => {
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    p.set(x, terrain.heightAt(x, z) - 0.2, z);
    s.set(w, h, d);
    m.compose(p, q, s);
    walls.setMatrixAt(i, m);
    roofs.setMatrixAt(i, m);
  });
  walls.castShadow = roofs.castShadow = true;
  group.add(walls, roofs);

  // 起點站：月台與站房（鐵道南側）
  const stX = -1500;
  const stZ = trackZ(stX) + 9;
  const stY = trackY(stX);
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(140, 1.0, 6),
    worldMaterial('gravel', 1.6, { color: 0xc8c2b6 }),
  );
  platform.position.set(stX + 60, stY - 0.5, stZ - 2.5);
  platform.receiveShadow = true;
  const station = new THREE.Mesh(new THREE.BoxGeometry(24, 5, 8), wallMat);
  station.position.set(stX + 40, stY + 2.5, stZ + 6);
  const stRoof = new THREE.Mesh(new THREE.BoxGeometry(26, 0.6, 10), roofMat);
  stRoof.position.set(stX + 40, stY + 5.3, stZ + 6);
  station.castShadow = stRoof.castShadow = true;
  group.add(platform, station, stRoof);

  scene.add(group);
  return group;
}
