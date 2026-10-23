import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';
import { fbm } from './noise.js';
import { distToTrack, trackZ, trackY } from './track.js';

// 樹林、村落、起點站
export function buildScenery(scene, terrain) {
  const rng = mulberry32(42);
  const group = new THREE.Group();

  // 樹：樹冠與樹幹兩組 InstancedMesh 共用變換
  const crownGeo = new THREE.ConeGeometry(1, 1, 7);
  crownGeo.translate(0, 0.62, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.3, 5);
  trunkGeo.translate(0, 0.15, 0);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x34462a, roughness: 1, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3b2b, roughness: 1 });
  const max = 9000;
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, max);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, max);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const color = new THREE.Color();
  let count = 0;
  for (let tries = 0; tries < 90000 && count < max; tries++) {
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
    const h = 7 + rng() * 9;
    const w = h * (0.28 + rng() * 0.1);
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rng() * Math.PI * 2);
    s.set(w, h, w);
    p.set(x, y - 0.3, z);
    m.compose(p, q, s);
    crowns.setMatrixAt(count, m);
    trunks.setMatrixAt(count, m);
    color.setHSL(0.24 + rng() * 0.06, 0.3, 0.75 + rng() * 0.3);
    crowns.setColorAt(count, color);
    count++;
  }
  crowns.count = trunks.count = count;
  crowns.instanceMatrix.needsUpdate = true;
  group.add(crowns, trunks);

  // 村落：鐵道北側約 650 m 的一群土牆房舍
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  wallGeo.translate(0, 0.5, 0);
  const roofGeo = new THREE.ConeGeometry(0.75, 0.5, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.translate(0, 1.25, 0);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x9b8b6c, roughness: 1 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1, flatShading: true });
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
    new THREE.MeshStandardMaterial({ color: 0x8a857a, roughness: 1 }),
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
