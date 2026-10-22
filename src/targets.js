import * as THREE from 'three';
import { mulberry32 } from './core/math.js';
import { targetTexture } from './train/textures.js';
import { trackY, trackZ } from './world/track.js';
import { roadZ, ROAD_X0, ROAD_X1 } from './world/terrain.js';

// 試驗運行靶場：[鐵道 x, 側（-1 北／+1 南）, 最近距離, 最遠距離, 種類, 數量, 尺寸]
const PLAN = [
  [-1250, -1, 120, 380, 'board', 4, 1],
  [-1100, 1, 120, 380, 'board', 3, 1],
  [-650, -1, 900, 1600, 'board', 3, 1.5],
  [-150, -1, 1700, 2600, 'bunker', 2, 1],
  [100, -1, 2000, 3000, 'board', 2, 2],
  [550, -1, 3200, 4500, 'board', 2, 2.5],
  [950, -1, 3500, 5000, 'bunker', 2, 1],
];

const MG_HITS = { board: 18, vehicle: 25 };

export class TargetRange {
  constructor(scene, terrain, effects) {
    this.scene = scene;
    this.terrain = terrain;
    this.effects = effects;
    this.list = [];
    this.tex = targetTexture();
    this.rng = mulberry32(1934);
    for (const row of PLAN) this.placeGroup(...row);
    this.addVehicle(-600, 7);
    this.addVehicle(500, -10);
  }

  get total() {
    return this.list.length;
  }
  get destroyed() {
    return this.list.filter((t) => !t.alive).length;
  }

  placeGroup(tx, side, dMin, dMax, type, count, scale) {
    const obs = new THREE.Vector3(tx, trackY(tx) + 4, trackZ(tx));
    const dir = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      let best = null;
      for (let tries = 0; tries < 40; tries++) {
        const ang = (this.rng() - 0.5) * 1.1;
        const d = dMin + this.rng() * (dMax - dMin);
        const x = tx + Math.sin(ang) * d;
        const z = trackZ(tx) + side * Math.cos(ang) * d;
        const y = this.terrain.heightAt(x, z);
        const c = new THREE.Vector3(x, y + 2 * scale, z);
        dir.subVectors(c, obs);
        const dist = dir.length();
        dir.normalize();
        const hit = this.terrain.raycast(obs, dir, dist + 50);
        best = c;
        if (hit == null || hit > dist - 8) break;
      }
      if (type === 'board') this.addBoard(best, scale, obs);
      else this.addBunker(best, scale);
    }
  }

  addBoard(c, scale, facing) {
    const g = new THREE.Group();
    const w = 4 * scale;
    const h = 3 * scale;
    const mat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.9, side: THREE.DoubleSide });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    face.position.y = 1.2 * scale + h / 2;
    face.castShadow = true;
    g.add(face);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x4d3b2a, roughness: 1 });
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.2 * scale, 1.2 * scale + h, 0.2 * scale), postMat);
      post.position.set((sx * w) / 2.4, (1.2 * scale + h) / 2, -0.12);
      g.add(post);
    }
    const ground = this.terrain.heightAt(c.x, c.z);
    g.position.set(c.x, ground - 0.2, c.z);
    g.lookAt(facing.x, ground - 0.2, facing.z);
    this.scene.add(g);
    this.list.push({
      type: 'board',
      name: '靶板',
      group: g,
      face,
      center: new THREE.Vector3(c.x, ground + 1.2 * scale + h / 2, c.z),
      radius: Math.max(w, h) / 2,
      hp: 1,
      mgHits: 0,
      alive: true,
      fall: 0,
    });
  }

  addBunker(c, scale) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8c7b5a, roughness: 1 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3 * scale, 0.9 * scale, 8, 20), mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.7 * scale;
    ring.scale.z = 1.4;
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(3.2 * scale, 3.6 * scale, 0.6 * scale, 16), mat);
    roof.position.y = 1.9 * scale;
    const slit = new THREE.Mesh(new THREE.BoxGeometry(2.2 * scale, 0.35 * scale, 0.3), new THREE.MeshBasicMaterial({ color: 0x080808 }));
    slit.position.set(0, 1.35 * scale, 3.4 * scale);
    g.add(ring, roof, slit);
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    const ground = this.terrain.heightAt(c.x, c.z);
    g.position.set(c.x, ground - 0.3, c.z);
    g.lookAt(c.x, ground - 0.3, trackZ(c.x));
    this.scene.add(g);
    this.list.push({
      type: 'bunker',
      name: '土嚢陣地',
      group: g,
      mat,
      center: new THREE.Vector3(c.x, ground + 1.3 * scale, c.z),
      radius: 3.6 * scale,
      hp: 3,
      mgHits: 0,
      alive: true,
    });
  }

  addVehicle(x, speed) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x5d6247, roughness: 0.9 });
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.0, 2.2), mat);
    cab.position.set(1.9, 1.5, 0);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.3, 2.3), mat);
    bed.position.set(-0.9, 1.2, 0);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.0), new THREE.MeshStandardMaterial({ map: this.tex, side: THREE.DoubleSide }));
    board.position.set(-0.9, 2.6, 0);
    g.add(cab, bed, board);
    const wg = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12).rotateX(Math.PI / 2);
    const wm = new THREE.MeshStandardMaterial({ color: 0x1d1d1b });
    for (const wx of [-2, 1.9]) {
      for (const wz of [-1.1, 1.1]) {
        const w = new THREE.Mesh(wg, wm);
        w.position.set(wx, 0.5, wz);
        g.add(w);
      }
    }
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.scene.add(g);
    const t = {
      type: 'vehicle',
      name: '移動靶車',
      group: g,
      mat,
      x,
      speed,
      center: new THREE.Vector3(),
      radius: 3.2,
      hp: 1,
      mgHits: 0,
      alive: true,
    };
    this.placeVehicle(t);
    this.list.push(t);
  }

  placeVehicle(t) {
    const z = roadZ(t.x);
    const y = this.terrain.heightAt(t.x, z);
    t.group.position.set(t.x, y, z);
    const dz = roadZ(t.x + 1) - z;
    t.group.rotation.y = Math.atan2(-dz * Math.sign(t.speed || 1), Math.sign(t.speed || 1));
    t.center.set(t.x, y + 1.6, z);
  }

  update(dt) {
    for (const t of this.list) {
      if (t.type === 'vehicle' && t.alive) {
        t.x += t.speed * dt;
        if (t.x > ROAD_X1 - 100 || t.x < ROAD_X0 + 100) t.speed = -t.speed;
        this.placeVehicle(t);
      }
      if (t.type === 'board' && !t.alive && t.fall < 1) {
        t.fall = Math.min(1, t.fall + dt * 1.5);
        t.group.rotation.x = -(t.fall * t.fall * Math.PI) / 2.1;
      }
    }
  }

  // 彈道線段與目標球體的交點
  segmentHit(a, b) {
    const ab = new THREE.Vector3();
    const ap = new THREE.Vector3();
    for (const t of this.list) {
      if (t.type === 'board' && !t.alive) continue;
      const c = t.center;
      const r = t.radius;
      if (Math.min(a.x, b.x) > c.x + r || Math.max(a.x, b.x) < c.x - r) continue;
      if (Math.min(a.z, b.z) > c.z + r || Math.max(a.z, b.z) < c.z - r) continue;
      if (Math.min(a.y, b.y) > c.y + r || Math.max(a.y, b.y) < c.y - r) continue;
      ab.subVectors(b, a);
      const len2 = ab.lengthSq();
      const k = len2 > 0 ? Math.max(0, Math.min(1, ap.subVectors(c, a).dot(ab) / len2)) : 0;
      const p = a.clone().addScaledVector(ab, k);
      if (p.distanceTo(c) <= r) return { target: t, point: p };
    }
    return null;
  }

  raycast(origin, dir, maxDist) {
    let best = null;
    const oc = new THREE.Vector3();
    for (const t of this.list) {
      oc.subVectors(t.center, origin);
      const along = oc.dot(dir);
      if (along < 0 || along > maxDist) continue;
      const d2 = oc.lengthSq() - along * along;
      if (d2 > t.radius * t.radius) continue;
      const hit = along - Math.sqrt(t.radius * t.radius - d2);
      if (!best || hit < best.dist) best = { dist: hit, target: t };
    }
    return best;
  }

  // 命中處理，回傳 { hit, destroyed: [] }
  applyImpact(point, proj, direct) {
    const out = { hit: false, destroyed: [] };
    const kill = (t) => {
      if (!t.alive) return;
      t.alive = false;
      out.destroyed.push(t);
      if (t.mat) t.mat.color.multiplyScalar(0.3);
      if (t.type !== 'board') this.effects.smokeColumn(t.center.clone().setY(t.center.y + 1), t.type === 'vehicle' ? 90 : 45, 1);
    };
    if (proj.kind === 'bullet') {
      if (direct && direct.alive) {
        out.hit = true;
        if (direct.type === 'bunker') return out;
        direct.mgHits++;
        if (direct.mgHits >= MG_HITS[direct.type]) kill(direct);
      }
      return out;
    }
    const he = proj.shell.he;
    if (direct && direct.alive) {
      out.hit = true;
      if (direct.type === 'bunker') {
        direct.hp -= he ? 2 : 1;
        if (direct.hp <= 0) kill(direct);
      } else {
        kill(direct);
      }
    }
    for (const t of this.list) {
      if (!t.alive || t === direct) continue;
      const d = t.center.distanceTo(point) - t.radius * 0.5;
      if (he) {
        if (t.type === 'board' && d < 14) kill(t);
        if (t.type === 'vehicle' && d < 9) kill(t);
        if (t.type === 'bunker') {
          if (d < 3) t.hp -= 2;
          else if (d < 7) t.hp -= 1;
          else continue;
          if (t.hp <= 0) kill(t);
        }
        if (d < 14) out.hit = true;
      } else if (d < 2) {
        out.hit = true;
        if (t.type !== 'bunker') kill(t);
      }
    }
    return out;
  }
}
