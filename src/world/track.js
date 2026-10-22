import * as THREE from 'three';

// 鐵道中心線：大致沿 +X（往東）延伸 3.2 km；北方為 -Z。
export const TRACK_X0 = -1600;
export const TRACK_X1 = 1600;
export const GAUGE_HALF = 0.7535; // 1435 mm 軌距，軌頭中心偏移

export function trackZ(x) {
  return 110 * Math.sin(x / 700) + 45 * Math.sin(x / 260 + 1.0);
}
export function trackDZDX(x) {
  return (110 / 700) * Math.cos(x / 700) + (45 / 260) * Math.cos(x / 260 + 1.0);
}
// 軌頂高度
export function trackY(x) {
  return 22 + 4 * Math.sin(x / 800) + 1.5 * Math.sin(x / 300 + 2);
}

export function distToTrack(x, z) {
  if (x < TRACK_X0) return Math.hypot(x - TRACK_X0, z - trackZ(TRACK_X0));
  if (x > TRACK_X1) return Math.hypot(x - TRACK_X1, z - trackZ(TRACK_X1));
  const s = trackDZDX(x);
  return Math.abs(z - trackZ(x)) / Math.sqrt(1 + s * s);
}

const UP = new THREE.Vector3(0, 1, 0);

export class Track {
  constructor() {
    const pts = [];
    for (let x = TRACK_X0; x <= TRACK_X1 + 0.1; x += 20) {
      pts.push(new THREE.Vector3(x, trackY(x), trackZ(x)));
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    curve.arcLengthDivisions = 6000;
    this.length = curve.getLength();
    this.step = 0.5;
    const n = Math.ceil(this.length / this.step) + 1;
    const spaced = curve.getSpacedPoints(n - 1);
    this.n = spaced.length;
    this.step = this.length / (this.n - 1);
    this.pos = new Float32Array(this.n * 3);
    this.tan = new Float32Array(this.n * 3);
    for (let i = 0; i < this.n; i++) {
      const p = spaced[i];
      this.pos.set([p.x, p.y, p.z], i * 3);
      const a = spaced[Math.max(0, i - 1)];
      const b = spaced[Math.min(this.n - 1, i + 1)];
      const t = new THREE.Vector3().subVectors(b, a).normalize();
      this.tan.set([t.x, t.y, t.z], i * 3);
    }
  }

  // 依弧長 s 取樣位置與切線
  sample(s, outPos, outTan) {
    const f = THREE.MathUtils.clamp(s / this.step, 0, this.n - 1.0001);
    const i = Math.floor(f);
    const t = f - i;
    const a = i * 3;
    const b = a + 3;
    outPos.set(
      this.pos[a] + (this.pos[b] - this.pos[a]) * t,
      this.pos[a + 1] + (this.pos[b + 1] - this.pos[a + 1]) * t,
      this.pos[a + 2] + (this.pos[b + 2] - this.pos[a + 2]) * t,
    );
    if (outTan) {
      outTan
        .set(
          this.tan[a] + (this.tan[b] - this.tan[a]) * t,
          this.tan[a + 1] + (this.tan[b + 1] - this.tan[a + 1]) * t,
          this.tan[a + 2] + (this.tan[b + 2] - this.tan[a + 2]) * t,
        )
        .normalize();
    }
    return outPos;
  }

  // 以截面輪廓沿鐵道掃掠出網格（profile: [橫向, 垂直] 相對軌頂）
  sweep(profile, spacing, offsetLat = 0) {
    const count = Math.floor(this.length / spacing) + 1;
    const m = profile.length;
    const positions = new Float32Array(count * m * 3);
    const p = new THREE.Vector3();
    const t = new THREE.Vector3();
    const r = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      this.sample(Math.min(i * spacing, this.length), p, t);
      r.crossVectors(t, UP).normalize();
      for (let k = 0; k < m; k++) {
        const [lat, v] = profile[k];
        const o = (i * m + k) * 3;
        positions[o] = p.x + r.x * (lat + offsetLat);
        positions[o + 1] = p.y + v;
        positions[o + 2] = p.z + r.z * (lat + offsetLat);
      }
    }
    const index = [];
    for (let i = 0; i < count - 1; i++) {
      for (let k = 0; k < m - 1; k++) {
        const a = i * m + k;
        const b = a + 1;
        const c = a + m;
        const d = c + 1;
        index.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  }

  buildMesh() {
    const group = new THREE.Group();

    const ballastMat = new THREE.MeshStandardMaterial({ color: 0x6b655a, roughness: 1 });
    const ballast = new THREE.Mesh(
      this.sweep(
        [
          [-3.2, -1.0],
          [-1.75, -0.33],
          [1.75, -0.33],
          [3.2, -1.0],
        ],
        2,
      ),
      ballastMat,
    );
    ballast.receiveShadow = true;
    group.add(ballast);

    const railMat = new THREE.MeshStandardMaterial({ color: 0x5c5650, roughness: 0.4, metalness: 0.85 });
    const railProfile = [
      [-0.04, -0.17],
      [-0.035, -0.02],
      [-0.03, 0],
      [0.03, 0],
      [0.035, -0.02],
      [0.04, -0.17],
    ];
    for (const side of [-GAUGE_HALF, GAUGE_HALF]) {
      const rail = new THREE.Mesh(this.sweep(railProfile, 2, side), railMat);
      rail.receiveShadow = true;
      group.add(rail);
    }

    // 枕木
    const tieGeo = new THREE.BoxGeometry(0.24, 0.18, 2.6);
    const tieMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.95 });
    const spacing = 0.65;
    const tieCount = Math.floor(this.length / spacing);
    const ties = new THREE.InstancedMesh(tieGeo, tieMat, tieCount);
    ties.receiveShadow = true;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const t = new THREE.Vector3();
    const r = new THREE.Vector3();
    const u = new THREE.Vector3();
    for (let i = 0; i < tieCount; i++) {
      this.sample(i * spacing, p, t);
      r.crossVectors(t, UP).normalize();
      u.crossVectors(r, t);
      m.makeBasis(t, u, r);
      m.setPosition(p.x, p.y - 0.26, p.z);
      ties.setMatrixAt(i, m);
    }
    group.add(ties);

    // 電線桿（左側）與里程標（右側）
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.15, 8, 6);
    poleGeo.translate(0, 4, 0);
    const armGeo = new THREE.BoxGeometry(0.12, 0.12, 1.6);
    armGeo.translate(0, 7.4, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 1 });
    const poleCount = Math.floor(this.length / 50);
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, poleCount);
    const arms = new THREE.InstancedMesh(armGeo, poleMat, poleCount);
    for (let i = 0; i < poleCount; i++) {
      this.sample(i * 50 + 10, p, t);
      r.crossVectors(t, UP).normalize();
      const yaw = Math.atan2(-t.z, t.x);
      m.makeRotationY(yaw);
      m.setPosition(p.x - r.x * 7, p.y - 1.0, p.z - r.z * 7);
      poles.setMatrixAt(i, m);
      arms.setMatrixAt(i, m);
    }
    group.add(poles, arms);

    const postGeo = new THREE.BoxGeometry(0.15, 0.9, 0.15);
    postGeo.translate(0, 0.45, 0);
    const postMat = new THREE.MeshStandardMaterial({ color: 0xdedbd0, roughness: 0.8 });
    const postCount = Math.floor(this.length / 100) + 1;
    const posts = new THREE.InstancedMesh(postGeo, postMat, postCount);
    for (let i = 0; i < postCount; i++) {
      this.sample(i * 100, p, t);
      r.crossVectors(t, UP).normalize();
      m.makeTranslation(p.x + r.x * 3.6, p.y - 0.9, p.z + r.z * 3.6);
      posts.setMatrixAt(i, m);
    }
    group.add(posts);

    // 每 500 m 一面里程牌
    for (let s = 0; s <= this.length; s += 500) {
      this.sample(s, p, t);
      r.crossVectors(t, UP).normalize();
      const sign = makeSign((s / 1000).toFixed(1));
      sign.position.set(p.x + r.x * 4.2, p.y + 1.6, p.z + r.z * 4.2);
      group.add(sign);
    }

    // 終點車擋
    const stopMat = new THREE.MeshStandardMaterial({ color: 0x7a2a20, roughness: 0.8 });
    for (const s of [0.5, this.length - 0.5]) {
      this.sample(s, p, t);
      const stop = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 3), stopMat);
      stop.position.set(p.x, p.y + 0.3, p.z);
      stop.rotation.y = Math.atan2(-t.z, t.x);
      group.add(stop);
    }

    return group;
  }
}

function makeSign(text) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#e9e5d6';
  g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#222';
  g.lineWidth = 4;
  g.strokeRect(2, 2, 124, 60);
  g.fillStyle = '#111';
  g.font = 'bold 40px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
  s.scale.set(1.6, 0.8, 1);
  return s;
}
