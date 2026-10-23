import * as THREE from 'three';
import { armorTexture, woodTexture } from './textures.js';
import { DEG } from '../core/math.js';

// 車廂本地座標：+X 往列車前方、+Y 往上、+Z 往右；原點在軌頂高度、車廂長度中點。
export const FLOOR_Y = 1.3;
export const HULL_Y0 = 1.1;
export const DOOR_HALF = 0.45;
const WALL = 0.08;

export function createMaterials() {
  const armorMap = armorTexture();
  const armor = new THREE.MeshStandardMaterial({ color: 0x6a6d52, map: armorMap, roughness: 0.78, metalness: 0.35 });
  const armorDS = armor.clone();
  armorDS.side = THREE.DoubleSide;
  return {
    hidden: new THREE.MeshBasicMaterial({ visible: false }),
    armor,
    armorDS,
    armorDark: new THREE.MeshStandardMaterial({ color: 0x45473a, map: armorMap, roughness: 0.8, metalness: 0.35 }),
    interior: new THREE.MeshStandardMaterial({ color: 0x9a9680, roughness: 0.9, metalness: 0.1, side: THREE.BackSide }),
    bulkhead: new THREE.MeshStandardMaterial({ color: 0x8c8873, roughness: 0.9, metalness: 0.1, side: THREE.DoubleSide }),
    floor: new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.95 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x34342f, roughness: 0.5, metalness: 0.75 }),
    gun: new THREE.MeshStandardMaterial({ color: 0x3f4234, roughness: 0.55, metalness: 0.6 }),
    wheel: new THREE.MeshStandardMaterial({ color: 0x2a2725, roughness: 0.6, metalness: 0.7 }),
    slit: new THREE.MeshBasicMaterial({ color: 0x0b0b0a }),
    lens: new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0x7a7255, roughness: 0.2 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb08d4a, roughness: 0.35, metalness: 0.9 }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xffd890 }),
    crew: new THREE.MeshStandardMaterial({ color: 0x6b6446, roughness: 1 }),
  };
}

const geoCache = new Map();
function cached(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}

function mesh(geo, mat, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

// 方塊 UV 原本是 0–1，改成以公尺計，讓貼圖不被拉長
function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
}

function box(w, h, d) {
  return cached(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
}

// 車體截面（u 為橫向、v 為高度，上緣兩側倒角）
function profileShape(w, h, c, inset = 0) {
  const s = new THREE.Shape();
  const hw = w / 2 - inset;
  const top = h - inset;
  const ch = Math.max(0.05, c - inset * 0.4);
  s.moveTo(-hw, inset);
  s.lineTo(hw, inset);
  s.lineTo(hw, top - ch);
  s.lineTo(hw - ch, top);
  s.lineTo(-hw + ch, top);
  s.lineTo(-hw, top - ch);
  s.closePath();
  return s;
}

// 沿截面擠出、轉成沿 X 軸，中心在 x0
function orient(geo, len, x0, y0) {
  geo.rotateY(Math.PI / 2);
  geo.translate(x0 - len / 2, y0, 0);
  return geo;
}

// 空心車體：外殼、內壁、端框、有門的端隔板、地板、觀察孔
function makeHull(mats, { len, w, h, c, x0 = 0, frontDoor = true, rearDoor = true }) {
  const g = new THREE.Group();
  const outer = profileShape(w, h, c);
  const inner = profileShape(w, h, c, WALL);
  const opts = { depth: len, bevelEnabled: false, curveSegments: 1 };

  g.add(mesh(orient(new THREE.ExtrudeGeometry(outer, opts), len, x0, HULL_Y0), [mats.hidden, mats.armor]));
  const innerMesh = mesh(orient(new THREE.ExtrudeGeometry(inner, opts), len, x0, HULL_Y0), [mats.hidden, mats.interior], false);
  g.add(innerMesh);

  const ring = profileShape(w, h, c);
  ring.holes.push(profileShape(w, h, c, WALL));
  const doorBottom = FLOOR_Y - HULL_Y0;
  for (const [sx, door] of [
    [1, frontDoor],
    [-1, rearDoor],
  ]) {
    const rg = new THREE.ShapeGeometry(ring);
    rg.rotateY(Math.PI / 2);
    rg.translate(x0 + sx * (len / 2), HULL_Y0, 0);
    g.add(mesh(rg, mats.armorDS));

    const bulk = profileShape(w, h, c, WALL);
    if (door) {
      const hole = new THREE.Path();
      hole.moveTo(-DOOR_HALF, doorBottom);
      hole.lineTo(DOOR_HALF, doorBottom);
      hole.lineTo(DOOR_HALF, doorBottom + 1.95);
      hole.lineTo(-DOOR_HALF, doorBottom + 1.95);
      hole.closePath();
      bulk.holes.push(hole);
    }
    const bg = new THREE.ShapeGeometry(bulk);
    bg.rotateY(Math.PI / 2);
    bg.translate(x0 + sx * (len / 2 - 0.03), HULL_Y0, 0);
    g.add(mesh(bg, mats.bulkhead, false));
  }

  // 地板延伸到車廂間（當作渡板）
  const ext0 = frontDoor ? 0.45 : 0;
  const ext1 = rearDoor ? 0.45 : 0;
  const floorGeo = new THREE.BoxGeometry(len + ext0 + ext1, 0.1, w - 2 * WALL - 0.02);
  scaleUV(floorGeo, len + ext0 + ext1, w);
  const floor = mesh(floorGeo, mats.floor, false);
  floor.position.set(x0 + (ext0 - ext1) / 2, FLOOR_Y - 0.05, 0);
  g.add(floor);

  // 觀察孔與車內燈
  const n = Math.max(2, Math.floor(len / 3));
  for (let i = 0; i < n; i++) {
    const x = x0 - len / 2 + ((i + 0.5) * len) / n;
    for (const sz of [-1, 1]) {
      const s = mesh(box(0.5, 0.07, 0.03), mats.slit, false);
      s.position.set(x, HULL_Y0 + 1.75, sz * (w / 2 + 0.005));
      g.add(s);
    }
    if (i % 2 === 0) {
      const lamp = mesh(box(0.25, 0.06, 0.25), mats.lamp, false);
      lamp.position.set(x, HULL_Y0 + h - WALL - 0.05, 0);
      g.add(lamp);
    }
  }
  return { group: g, innerHalf: w / 2 - WALL, roofY: HULL_Y0 + h, roofHalf: w / 2 - c };
}

// 實心外殼（機關車用）
function makeShell(mats, { len, w, h, c, x0, y0 }) {
  const geo = orient(new THREE.ExtrudeGeometry(profileShape(w, h, c), { depth: len, bevelEnabled: false }), len, x0, y0);
  return mesh(geo, mats.armor);
}

function addBogie(g, mats, bx, wheels, r = 0.43) {
  const frame = mesh(box(2.8, 0.25, 1.9), mats.steel);
  frame.position.set(bx, 0.62, 0);
  g.add(frame);
  for (const z of [-0.86, 0.86]) {
    const side = mesh(box(3.0, 0.4, 0.12), mats.steel);
    side.position.set(bx, 0.5, z);
    g.add(side);
  }
  const wg = cached(`wheel${r}`, () => new THREE.CylinderGeometry(r, r, 0.12, 18).rotateX(Math.PI / 2));
  for (const ax of [-0.9, 0.9]) {
    for (const z of [-0.72, 0.72]) {
      const w = mesh(wg, mats.wheel);
      w.position.set(bx + ax, r, z);
      g.add(w);
      wheels.push({ mesh: w, r });
    }
  }
}

function addRunningGear(g, mats, len, wheels) {
  const uf = mesh(box(len - 0.6, 0.32, 2.5), mats.steel);
  uf.position.y = 0.94;
  g.add(uf);
  for (const sx of [1, -1]) {
    const cpl = mesh(box(0.5, 0.22, 0.3), mats.steel);
    cpl.position.set(sx * (len / 2 + 0.1), 0.94, 0);
    g.add(cpl);
  }
  addBogie(g, mats, len * 0.3, wheels);
  addBogie(g, mats, -len * 0.3, wheels);
}

// 十糎砲／七糎砲砲塔：turret（方向）→ elev（俯仰）→ recoil（後座）
function makeGunTurret(mats, { ringR = 1.55, bodyH = 1.15, barrelLen = 4.4, barrelR = 0.085, twin = false, open = false } = {}) {
  const turret = new THREE.Group();
  const ring = mesh(new THREE.CylinderGeometry(ringR + 0.12, ringR + 0.18, 0.22, 32), mats.armorDark);
  ring.position.y = 0.11;
  turret.add(ring);
  if (!open) {
    const body = mesh(new THREE.CylinderGeometry(ringR - 0.3, ringR, bodyH, 28), mats.armor);
    body.position.y = 0.22 + bodyH / 2;
    turret.add(body);
    const hatch = mesh(box(0.7, 0.08, 0.7), mats.armorDark);
    hatch.position.set(-0.4, 0.22 + bodyH + 0.04, 0.3);
    turret.add(hatch);
  } else {
    const wall = mesh(
      new THREE.CylinderGeometry(ringR, ringR, bodyH * 0.85, 28, 1, true),
      mats.armorDS,
    );
    wall.position.y = 0.22 + (bodyH * 0.85) / 2;
    turret.add(wall);
  }
  const pivotX = open ? 0 : ringR * 0.3;
  const pivotY = 0.22 + bodyH * 0.55;
  const elev = new THREE.Group();
  elev.position.set(pivotX, pivotY, 0);
  turret.add(elev);
  const recoil = new THREE.Group();
  elev.add(recoil);
  const mantlet = mesh(box(0.55, 0.7, twin ? 1.3 : 0.85), mats.armorDark);
  mantlet.position.x = open ? 0.2 : ringR - 0.25 - pivotX;
  elev.add(mantlet);
  const bg = cached(`barrel${barrelLen},${barrelR}`, () =>
    new THREE.CylinderGeometry(barrelR * 0.8, barrelR, barrelLen, 14).rotateZ(-Math.PI / 2).translate(0.6 + barrelLen / 2, 0, 0),
  );
  const sg = cached('sleeve', () => new THREE.CylinderGeometry(0.16, 0.16, 1.5, 12).rotateZ(-Math.PI / 2).translate(0.9, -0.2, 0));
  for (const z of twin ? [-0.32, 0.32] : [0]) {
    const b = mesh(bg, mats.gun);
    b.position.z = z;
    recoil.add(b);
    const s = mesh(sg, mats.gun);
    s.position.z = z;
    recoil.add(s);
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0.6 + barrelLen, 0, 0);
  recoil.add(muzzle);
  // 瞄準鏡（在砲塔內、砲管左側，不隨俯仰移動）
  const sight = new THREE.Object3D();
  sight.position.set(pivotX + 0.25, pivotY + 0.22, -(twin ? 0.8 : 0.55));
  turret.add(sight);
  const scope = mesh(box(0.25, 0.3, 0.2), mats.steel);
  scope.position.set(pivotX + 0.2, 0.22 + bodyH + 0.12, -(twin ? 0.8 : 0.55));
  if (!open) turret.add(scope);
  return { turret, elev, recoil, muzzle, sight };
}

// 九二式重機槍球形槍架：base（固定朝向）→ yawG → pitchG
function makeMgMount(mats, { x, y, z, center, arc, label, tag }) {
  const base = new THREE.Group();
  base.position.set(x, y, z);
  base.rotation.y = center;
  const dome = mesh(
    cached('mgDome', () => new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2)),
    mats.armor,
  );
  base.add(dome);
  const yawG = new THREE.Group();
  base.add(yawG);
  const pitchG = new THREE.Group();
  yawG.add(pitchG);
  const ball = mesh(cached('mgBall', () => new THREE.SphereGeometry(0.2, 12, 8)), mats.armorDark);
  ball.position.x = 0.32;
  pitchG.add(ball);
  const jacket = mesh(
    cached('mgJacket', () => new THREE.CylinderGeometry(0.055, 0.055, 0.6, 10).rotateZ(-Math.PI / 2).translate(0.68, 0, 0)),
    mats.gun,
  );
  pitchG.add(jacket);
  const barrel = mesh(
    cached('mgBarrel', () => new THREE.CylinderGeometry(0.018, 0.022, 0.5, 8).rotateZ(-Math.PI / 2).translate(1.2, 0, 0)),
    mats.gun,
  );
  pitchG.add(barrel);
  const muzzle = new THREE.Object3D();
  muzzle.position.x = 1.45;
  pitchG.add(muzzle);
  const sight = new THREE.Object3D();
  sight.position.set(0.02, 0.24, 0);
  pitchG.add(sight);
  return { base, yawG, pitchG, muzzle, sight, center, arc, label, tag };
}

function baseCar(name, kind, len) {
  return {
    name,
    kind,
    len,
    group: new THREE.Group(),
    wheels: [],
    stations: [],
    mgs: [],
    hatches: [],
    obstacles: [],
    roofWalk: true,
    roofRange: [-len / 2, len / 2],
    closedFront: false,
    closedRear: false,
    pitX: null,
    topY: 4.4,
  };
}

function applyHull(car, hull) {
  car.group.add(hull.group);
  car.innerHalf = hull.innerHalf;
  car.roofY = hull.roofY;
  car.roofHalf = hull.roofHalf;
}

function addMgs(car, mats, defs) {
  for (const d of defs) {
    const mg = makeMgMount(mats, d);
    car.group.add(mg.base);
    car.mgs.push(mg);
    car.stations.push({ type: 'mg', x: d.x, lat: Math.sign(d.z) * Math.min(1.0, car.innerHalf - 0.35), label: d.label, ref: mg });
  }
}

function buildGuard(mats) {
  const len = 12;
  const w = 3.0;
  const car = baseCar('警戒車', 'guard', len);
  applyHull(car, makeHull(mats, { len, w, h: 2.3, c: 0.55, frontDoor: false }));
  addRunningGear(car.group, mats, len, car.wheels);
  car.closedFront = true;

  const cc = mesh(box(1.3, 0.9, 2.9), mats.armorDark);
  cc.position.set(len / 2 + 0.45, 0.62, 0);
  cc.rotation.z = -0.55;
  car.group.add(cc);

  const slBase = mesh(box(0.5, 0.3, 0.5), mats.armorDark);
  slBase.position.set(len / 2 - 0.7, car.roofY + 0.15, 0);
  const sl = mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.6, 18).rotateZ(-Math.PI / 2), mats.steel);
  sl.position.set(len / 2 - 0.7, car.roofY + 0.55, 0);
  const lens = mesh(new THREE.CircleGeometry(0.29, 18).rotateY(Math.PI / 2), mats.lens, false);
  lens.position.set(len / 2 - 0.39, car.roofY + 0.55, 0);
  car.group.add(slBase, sl, lens);

  addMgs(car, mats, [
    { x: len / 2 - 1.4, y: 2.35, z: -w / 2, center: 35 * DEG, arc: 75 * DEG, label: '警戒車 左前機槍', tag: 'FL' },
    { x: len / 2 - 1.4, y: 2.35, z: w / 2, center: -35 * DEG, arc: 75 * DEG, label: '警戒車 右前機槍', tag: 'FR' },
  ]);
  car.hatches = [-1.5];
  car.obstacles = [{ x: len / 2 - 0.7, z: 0, r: 0.5 }];
  car.topY = car.roofY + 0.9;
  return car;
}

function buildGunCar(mats, high) {
  const len = 16;
  const w = 3.1;
  const name = high ? '火砲車乙' : '火砲車甲';
  const car = baseCar(name, high ? 'gunB' : 'gunA', len);
  applyHull(car, makeHull(mats, { len, w, h: 2.3, c: 0.55 }));
  addRunningGear(car.group, mats, len, car.wheels);
  const tx = 3.6;
  let baseY = car.roofY;
  if (high) {
    const barbette = mesh(new THREE.CylinderGeometry(1.75, 1.85, 0.8, 28), mats.armor);
    barbette.position.set(tx, car.roofY + 0.4, 0);
    car.group.add(barbette);
    baseY += 0.8;
  }
  const gun = makeGunTurret(mats);
  gun.turret.position.set(tx, baseY, 0);
  car.group.add(gun.turret);
  car.gun = gun;
  car.stations.push({ type: 'gun', x: tx, lat: 0, label: `${name} 十四年式十糎高射砲`, ref: gun });
  addMgs(car, mats, [
    { x: -4.6, y: 2.3, z: -w / 2, center: 90 * DEG, arc: 75 * DEG, label: `${name} 左側機槍`, tag: 'L' },
    { x: -4.6, y: 2.3, z: w / 2, center: -90 * DEG, arc: 75 * DEG, label: `${name} 右側機槍`, tag: 'R' },
  ]);
  car.hatches = [-1.6];
  car.obstacles = [{ x: tx, z: 0, r: 1.85 }];
  car.topY = baseY + 1.5;
  return car;
}

// 以 Blender 模型取代程式模型的外觀。尺寸、崗位、艙口等資料沿用程式建模的設定，
// 只把砲塔、機槍、測距儀等可動節點換成模型中同名的節點（命名見 tools/blender/parts.py）。
function swapToModel(car, model) {
  const g = model.clone(true);
  const need = [];
  if (car.gun) need.push(...(car.gunNames ? [car.gunNames.turret, car.gunNames.elev] : ['Turret', 'Elev', 'Recoil', 'Muzzle', 'Sight']));
  for (const mg of car.mgs) need.push(...['Base', 'Yaw', 'Pitch', 'Muzzle', 'Sight'].map((p) => `MG_${mg.tag}_${p}`));
  if (car.rangefinder) need.push('RF_Yaw', 'RF_Anchor');
  if (car.console) need.push('ConsoleAnchor');
  if (car.chimney) need.push('Chimney');
  const nodes = {};
  const missing = [];
  for (const n of need) {
    nodes[n] = g.getObjectByName(n);
    if (!nodes[n]) missing.push(n);
  }
  if (missing.length) {
    console.warn(`${car.name} 模型缺少節點 ${missing.join(', ')}，改用程式模型`);
    return;
  }
  car.group.clear();
  car.group.add(g);
  car.wheels = [];
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
    if (o.name.startsWith('Wheelset')) car.wheels.push({ mesh: o, r: o.userData.radius ?? 0.43 });
  });
  if (car.gun && car.gunNames) {
    // 補上後座、砲口與瞄準鏡節點（砲身沿搖架 +X）
    const turret = nodes[car.gunNames.turret];
    const elev = nodes[car.gunNames.elev];
    turret.rotation.set(0, 0, 0);
    elev.rotation.set(0, 0, 0);
    const recoil = new THREE.Group();
    for (const c of [...elev.children]) recoil.add(c);
    elev.add(recoil);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(car.gunNames.barrel, 0, 0);
    recoil.add(muzzle);
    const sight = new THREE.Object3D();
    sight.position.set(0.3, elev.position.y + 0.3, -0.62);
    turret.add(sight);
    Object.assign(car.gun, { turret, elev, recoil, muzzle, sight });
  } else if (car.gun) {
    Object.assign(car.gun, { turret: nodes.Turret, elev: nodes.Elev, recoil: nodes.Recoil, muzzle: nodes.Muzzle, sight: nodes.Sight });
  }
  for (const mg of car.mgs) {
    const p = (n) => nodes[`MG_${mg.tag}_${n}`];
    Object.assign(mg, { base: p('Base'), yawG: p('Yaw'), pitchG: p('Pitch'), muzzle: p('Muzzle'), sight: p('Sight') });
  }
  if (car.rangefinder) Object.assign(car.rangefinder, { yawG: nodes.RF_Yaw, anchor: nodes.RF_Anchor });
  if (car.console) car.console.anchor = nodes.ConsoleAnchor;
  if (car.chimney) car.chimney = nodes.Chimney;
  if (car.mortar) car.mortar.node = g.getObjectByName('Mortar') ?? car.mortar.node;
}

function buildGunCarC(mats) {
  const len = 15.9;
  const car = baseCar('火砲車丙', 'gunC', len);
  applyHull(car, makeHull(mats, { len, w: 3.1, h: 2.3, c: 0.55 }));
  addRunningGear(car.group, mats, len, car.wheels);

  const t = makeGunTurret(mats, { open: true, twin: true, ringR: 1.6, bodyH: 1.0, barrelLen: 3.2, barrelR: 0.065 });
  t.turret.position.set(-4.2, car.roofY, 0);
  t.turret.rotation.y = Math.PI;
  t.elev.rotation.z = 8 * DEG;
  car.group.add(t.turret);
  car.gun = t;
  // Blender 模型只有 Turret7、Turret7_Elev 兩個節點，其餘（Recoil、Muzzle、Sight）換模型後補上
  car.gunNames = { turret: 'Turret7', elev: 'Turret7_Elev', barrel: 3.5 };
  car.stations.push({ type: 'gun', weapon: 'type88', x: -4.2, lat: 0, label: '火砲車丙 八八式七糎野戦高射砲', ref: t });

  // 測距儀
  const rx = 3.6;
  const ped = mesh(new THREE.CylinderGeometry(0.18, 0.26, 0.6, 12), mats.armorDark);
  ped.position.set(rx, car.roofY + 0.3, 0);
  car.group.add(ped);
  const yawG = new THREE.Group();
  yawG.position.set(rx, car.roofY + 0.78, 0);
  car.group.add(yawG);
  const tube = mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.6, 14).rotateX(Math.PI / 2), mats.steel);
  yawG.add(tube);
  for (const z of [-1.3, 1.3]) {
    const end = mesh(box(0.28, 0.28, 0.2), mats.armorDark);
    end.position.z = z;
    yawG.add(end);
  }
  const eye = mesh(box(0.25, 0.18, 0.3), mats.armorDark);
  eye.position.set(-0.22, 0.02, 0);
  yawG.add(eye);
  const anchor = new THREE.Object3D();
  anchor.position.set(0, 0.2, 0);
  yawG.add(anchor);
  car.rangefinder = { yawG, anchor };
  car.stations.push({ type: 'rangefinder', x: rx, lat: 0, label: '火砲車丙 測距儀', ref: car.rangefinder });

  car.hatches = [0.6];
  car.obstacles = [
    { x: -4.2, z: 0, r: 1.8 },
    { x: rx, z: 0, r: 0.45 },
  ];
  car.topY = car.roofY + 1.3;
  return car;
}

function buildCommand(mats) {
  const len = 15;
  const w = 3.1;
  const car = baseCar('指揮車', 'command', len);
  applyHull(car, makeHull(mats, { len, w, h: 2.4, c: 0.55 }));
  addRunningGear(car.group, mats, len, car.wheels);

  const cx = 3.2;
  const cup = mesh(new THREE.CylinderGeometry(0.72, 0.8, 0.9, 20), mats.armor);
  cup.position.set(cx, car.roofY + 0.45, 0);
  const band = mesh(new THREE.CylinderGeometry(0.81, 0.81, 0.08, 20, 1, true), mats.slit, false);
  band.position.set(cx, car.roofY + 0.7, 0);
  const dome = mesh(new THREE.SphereGeometry(0.72, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.armor);
  dome.position.set(cx, car.roofY + 0.9, 0);
  car.group.add(cup, band, dome);
  const anchor = new THREE.Object3D();
  anchor.position.set(cx, car.roofY + 0.7, 0);
  car.group.add(anchor);
  car.console = { anchor };
  car.stations.push({ type: 'console', x: cx, lat: 0, label: '指揮車 指揮台（傳令鐘／觀測鏡）', ref: car.console });

  // 傳令鐘（車內道具）
  const tPed = mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.0, 10), mats.brass);
  tPed.position.set(cx + 1.3, FLOOR_Y + 0.5, 0.8);
  const tDial = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 20).rotateZ(Math.PI / 2), mats.brass);
  tDial.position.set(cx + 1.3, FLOOR_Y + 1.1, 0.8);
  car.group.add(tPed, tDial);

  // 天線
  const mastGeo = new THREE.CylinderGeometry(0.03, 0.04, 3.2, 6);
  for (const x of [-5.5, -1.5]) {
    const mast = mesh(mastGeo, mats.steel);
    mast.position.set(x, car.roofY + 1.6, 0);
    car.group.add(mast);
  }
  const wire = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-5.5, car.roofY + 3.1, 0),
      new THREE.Vector3(-1.5, car.roofY + 3.1, 0),
    ]),
    new THREE.LineBasicMaterial({ color: 0x222222 }),
  );
  car.group.add(wire);

  addMgs(car, mats, [{ x: -4, y: 2.3, z: -w / 2, center: 90 * DEG, arc: 75 * DEG, label: '指揮車 左側機槍', tag: 'L' }]);
  car.hatches = [-1.0];
  car.obstacles = [
    { x: cx, z: 0, r: 0.9 },
    { x: -5.5, z: 0, r: 0.15 },
    { x: -1.5, z: 0, r: 0.15 },
  ];
  car.topY = car.roofY + 1.6;
  return car;
}

function buildLocomotive(mats) {
  const len = 13.5;
  const car = baseCar('機關車', 'loco', len);
  car.roofWalk = false;
  car.loco = true;
  car.roofY = 3.6;
  car.innerHalf = 1.5;
  car.roofHalf = 1.0;
  const g = car.group;

  const frame = mesh(box(len - 0.4, 0.35, 2.3), mats.steel);
  frame.position.y = 1.0;
  g.add(frame);
  const addWheel = (x, r) => {
    const wg = cached(`lwheel${r}`, () => new THREE.CylinderGeometry(r, r, 0.14, 24).rotateX(Math.PI / 2));
    for (const z of [-0.72, 0.72]) {
      const w = mesh(wg, mats.wheel);
      w.position.set(x, r, z);
      g.add(w);
      car.wheels.push({ mesh: w, r });
    }
  };
  for (const x of [-2.7, -0.95, 0.8, 2.55]) addWheel(x, 0.69);
  addWheel(4.9, 0.43);
  addWheel(-4.6, 0.5);
  for (const z of [-0.83, 0.83]) {
    const rod = mesh(box(5.4, 0.1, 0.05), mats.steel);
    rod.position.set(-0.08, 0.69, z);
    g.add(rod);
  }
  // 裝甲裙板
  for (const z of [-1.32, 1.32]) {
    const skirt = mesh(box(9.2, 0.85, 0.05), mats.armorDark);
    skirt.position.set(1.0, 0.95, z);
    g.add(skirt);
  }
  // 鍋爐裝甲罩
  g.add(makeShell(mats, { len: 8.4, w: 2.8, h: 2.3, c: 0.6, x0: 2.0, y0: 1.25 }));
  const chimney = mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.7, 14), mats.armorDark);
  chimney.position.set(5.4, 1.25 + 2.3 + 0.35, 0);
  const sdome = mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.4, 14), mats.armor);
  sdome.position.set(2.4, 1.25 + 2.3 + 0.2, 0);
  g.add(chimney, sdome);
  const chimneyTop = new THREE.Object3D();
  chimneyTop.position.set(5.4, 1.25 + 2.3 + 0.75, 0);
  g.add(chimneyTop);
  car.chimney = chimneyTop;
  // 駕駛室
  g.add(makeShell(mats, { len: 3.4, w: 2.7, h: 2.9, c: 0.5, x0: -3.9, y0: 1.1 }));
  for (const sz of [-1, 1]) {
    const win = mesh(box(1.2, 0.08, 0.03), mats.slit, false);
    win.position.set(-3.6, 3.1, sz * 1.36);
    g.add(win);
  }
  // 走道：右側腳踏板、前後平台
  const plankMat = mats.armorDark;
  for (const z of [-1.62, 1.62]) {
    const plank = mesh(box(11.2, 0.06, 0.42), plankMat);
    plank.position.set(0, FLOOR_Y - 0.03, z);
    g.add(plank);
  }
  const front = mesh(box(1.2, 0.1, 3.4), plankMat);
  front.position.set(len / 2 - 0.6, FLOOR_Y - 0.05, 0);
  const rear = mesh(box(1.15, 0.1, 3.4), plankMat);
  rear.position.set(-len / 2 + 0.575, FLOOR_Y - 0.05, 0);
  g.add(front, rear);
  // 扶手
  const rail = mesh(new THREE.CylinderGeometry(0.025, 0.025, 8.2, 6).rotateZ(Math.PI / 2), mats.steel);
  rail.position.set(2.0, 2.4, 1.43);
  g.add(rail);
  // 司機
  const driver = mesh(new THREE.CapsuleGeometry(0.22, 0.8, 4, 8), mats.crew);
  driver.position.set(-3.3, FLOOR_Y + 0.65, -0.6);
  g.add(driver);
  car.topY = 4.3;
  return car;
}

function buildTender(mats) {
  const len = 10;
  const w = 3.1;
  const car = baseCar('炭水車', 'tender', len);
  applyHull(car, makeHull(mats, { len, w, h: 2.3, c: 0.55 }));
  addRunningGear(car.group, mats, len, car.wheels);
  addMgs(car, mats, [
    { x: 0.8, y: 2.3, z: -w / 2, center: 90 * DEG, arc: 75 * DEG, label: '炭水車 左側機槍', tag: 'L' },
    { x: 0.8, y: 2.3, z: w / 2, center: -90 * DEG, arc: 75 * DEG, label: '炭水車 右側機槍', tag: 'R' },
  ]);
  car.hatches = [-2.6];
  car.topY = car.roofY + 0.3;
  return car;
}

function buildPower(mats) {
  const len = 14;
  const w = 3.1;
  const hullLen = 9.5;
  const car = baseCar('電源車', 'power', len);
  const x0 = len / 2 - hullLen / 2;
  applyHull(car, makeHull(mats, { len: hullLen, w, h: 2.4, c: 0.55, x0 }));
  addRunningGear(car.group, mats, len, car.wheels);
  car.pitX = len / 2 - hullLen;
  car.roofRange = [car.pitX, len / 2];
  car.closedRear = true;

  // 後段敞頂迫砲座
  const pitLen = len - hullLen;
  const pitC = -len / 2 + pitLen / 2;
  const pitFloor = mesh(box(pitLen, 0.1, w - 0.2), mats.floor, false);
  pitFloor.position.set(pitC, FLOOR_Y - 0.05, 0);
  const pitBase = mesh(box(pitLen, 0.2, w), mats.armorDark);
  pitBase.position.set(pitC, HULL_Y0 + 0.1, 0);
  car.group.add(pitFloor, pitBase);
  for (const z of [-1, 1]) {
    const wall = mesh(box(pitLen, 1.5, 0.08), mats.armorDS);
    wall.position.set(pitC, HULL_Y0 + 0.75, z * (w / 2 - 0.04));
    car.group.add(wall);
  }
  const back = mesh(box(0.08, 1.5, w), mats.armorDS);
  back.position.set(-len / 2 + 0.04, HULL_Y0 + 0.75, 0);
  car.group.add(back);

  // 迫砲（整組繞底鈑轉向；砲口預設朝車尾 -X、仰角 60°）
  const mortar = new THREE.Group();
  mortar.name = 'Mortar';
  mortar.position.set(-4.6, FLOOR_Y, 0);
  const plate = mesh(box(0.6, 0.05, 0.6), mats.steel);
  plate.position.set(0, 0.03, 0);
  const tubeM = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.25, 10), mats.gun);
  tubeM.position.set(-0.31, 0.6, 0);
  tubeM.rotation.z = 30 * DEG;
  mortar.add(plate, tubeM);
  car.group.add(mortar);
  car.mortar = { node: mortar };
  car.stations.push({ type: 'mortar', x: -4.0, lat: 0.6, label: '九七式曲射歩兵砲', ref: car.mortar });

  const mastGeo = new THREE.CylinderGeometry(0.03, 0.04, 3.5, 6);
  for (const x of [x0 - 2.5, x0 + 2.5]) {
    const mast = mesh(mastGeo, mats.steel);
    mast.position.set(x, car.roofY + 1.75, 0);
    car.group.add(mast);
  }

  addMgs(car, mats, [
    { x: -len / 2 + 0.75, y: 2.25, z: -w / 2, center: 135 * DEG, arc: 70 * DEG, label: '電源車 左後機槍', tag: 'RL' },
    { x: -len / 2 + 0.75, y: 2.25, z: w / 2, center: -135 * DEG, arc: 70 * DEG, label: '電源車 右後機槍', tag: 'RR' },
  ]);
  car.hatches = [len / 2 - 4.2];
  car.obstacles = [
    { x: x0 - 2.5, z: 0, r: 0.15 },
    { x: x0 + 2.5, z: 0, r: 0.15 },
    { x: 6.3, z: 0.75, r: 0.2 }, // 發電機排氣管（Blender 模型）
  ];
  car.topY = car.roofY + 0.3;
  return car;
}

// 九四式編成，由前到後
export function buildConsist(mats, models = {}) {
  const cars = [
    buildGuard(mats),
    buildGunCar(mats, false),
    buildGunCar(mats, true),
    buildGunCarC(mats),
    buildCommand(mats),
    buildLocomotive(mats),
    buildTender(mats),
    buildPower(mats),
  ];
  for (const car of cars) {
    if (models[car.kind]) swapToModel(car, models[car.kind]);
  }
  return cars;
}
