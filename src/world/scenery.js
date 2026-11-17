import * as THREE from 'three';
import { worldMaterial } from '../render/materials.js';
import { mulberry32 } from '../core/math.js';
import { fbm } from './noise.js';
import { distToTrack, trackZ, trackY, TRACK_X0, TRACK_X1 } from './track.js';
import { buildTrees, buildGrass } from './trees.js';
import { buildStation, buildWaterTower, buildSemaphore, housePrototype } from './buildings.js';

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

  // 枯草叢：鐵道兩側 6–90 m 的帶狀範圍（玩家視線最常停留的地方）
  const tufts = [];
  for (let i = 0; i < 26000; i++) {
    const x = TRACK_X0 - 100 + rng() * (TRACK_X1 - TRACK_X0 + 200);
    const side = rng() < 0.5 ? -1 : 1;
    const d = 6 + Math.pow(rng(), 1.6) * 84;
    const z = trackZ(x) + side * d;
    if (terrain.roadBlend(x, z) > 0.2) continue;
    tufts.push({ x, y: terrain.heightAt(x, z) - 0.03, z, h: 0.35 + rng() * 0.55, rot: rng() * Math.PI, v: rng() });
  }
  group.add(buildGrass(tufts));

  // 村落：鐵道北側約 650 m、南側約 900 m 各一群土坯民房（草頂、紙窗，門朝南）
  const houses = [];
  for (const [cx, off] of [
    [700, -650],
    [-300, 900],
  ]) {
    const cz = trackZ(cx) + off;
    for (let k = 0; k < 14; k++) {
      const x = cx + (rng() - 0.5) * 220;
      const z = cz + (rng() - 0.5) * 160;
      houses.push([x, z, 7 + rng() * 6, 5 + rng() * 2.5, 2.6 + rng() * 0.8, (rng() - 0.5) * 0.5]);
    }
  }
  for (const [geo, mat] of housePrototype()) {
    const inst = new THREE.InstancedMesh(geo, mat, houses.length);
    houses.forEach(([x, z, w, d, h, yaw], i) => {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
      p.set(x, terrain.heightAt(x, z) - 0.2, z);
      s.set(w, h, d);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    });
    inst.castShadow = inst.receiveShadow = true;
    group.add(inst);
  }

  // 車站（鐵道南側）：起點站與終點站各有月台、紅磚站房、水塔、號誌機
  const platMat = worldMaterial('gravel', 1.6, { color: 0xc8c2b6 });
  const edgeMat = worldMaterial('gravel', 1.0, { color: 0xe2ddd2 });
  for (const [stX, name, dir] of [
    [-1500, '起點', 1],
    [1420, '終點', -1],
  ]) {
    const stZ = trackZ(stX) + 9;
    const stY = trackY(stX);
    const cx = stX + dir * 60;
    const platform = new THREE.Mesh(new THREE.BoxGeometry(140, 1.0, 6), platMat);
    platform.position.set(cx, stY - 0.5, stZ - 2.5);
    platform.receiveShadow = true;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(140, 1.02, 0.5), edgeMat); // 月台邊的石條
    edge.position.set(cx, stY - 0.5, stZ - 5.3);
    edge.receiveShadow = true;
    const station = buildStation(name);
    station.position.set(stX + dir * 40, stY - 0.1, stZ + 6);
    const tower = buildWaterTower();
    tower.position.set(stX + dir * 118, terrain.heightAt(stX + dir * 118, stZ + 3) - 0.2, stZ + 3);
    const sem = buildSemaphore();
    sem.position.set(stX + dir * 138, stY - 0.3, stZ - 5.5);
    group.add(platform, edge, station, tower, sem);
  }

  scene.add(group);
  return group;
}
