import * as THREE from 'three';
import { G } from './ballistics.js';

const STEP = 1 / 120;
const MAX_TRACERS = 600;

// 飛行中的彈丸：即時積分外彈道，處理地面與目標命中
export class Projectiles {
  constructor(scene, terrain, targets, onImpact) {
    this.terrain = terrain;
    this.targets = targets;
    this.onImpact = onImpact;
    this.list = [];
    this.wind = new THREE.Vector3();
    this.rhoRatio = 1;

    const geo = new THREE.BufferGeometry();
    this.tracerPos = new Float32Array(MAX_TRACERS * 6);
    geo.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.tracers = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, fog: false }),
    );
    this.tracers.frustumCulled = false;
    scene.add(this.tracers);
    this._prev = new THREE.Vector3();
  }

  spawn({ pos, vel, k, kind, shell, weapon, tracer = false, source }) {
    this.list.push({ pos: pos.clone(), vel: vel.clone(), k, kind, shell, weapon, tracer, source, t: 0 });
  }

  update(dt) {
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    const w = this.wind;
    const prev = this._prev;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      const kk = p.k * this.rhoRatio;
      let done = false;
      for (let s = 0; s < steps && !done; s++) {
        prev.copy(p.pos);
        // 中點法
        let rx = p.vel.x - w.x;
        let ry = p.vel.y - w.y;
        let rz = p.vel.z - w.z;
        let sp = Math.sqrt(rx * rx + ry * ry + rz * rz);
        const mx = p.vel.x - 0.5 * h * kk * sp * rx;
        const my = p.vel.y + 0.5 * h * (-G - kk * sp * ry);
        const mz = p.vel.z - 0.5 * h * kk * sp * rz;
        rx = mx - w.x;
        ry = my - w.y;
        rz = mz - w.z;
        sp = Math.sqrt(rx * rx + ry * ry + rz * rz);
        p.pos.x += mx * h;
        p.pos.y += my * h;
        p.pos.z += mz * h;
        p.vel.x -= h * kk * sp * rx;
        p.vel.y += h * (-G - kk * sp * ry);
        p.vel.z -= h * kk * sp * rz;
        p.t += h;

        const target = this.targets.segmentHit(prev, p.pos);
        if (target) {
          this.onImpact(p, target.point, target.target, null);
          done = true;
          break;
        }
        const ground = this.terrain.heightAt(p.pos.x, p.pos.z);
        if (p.pos.y <= ground) {
          // 二分法求精確落點
          let a = 0;
          let b = 1;
          const q = new THREE.Vector3();
          for (let k = 0; k < 12; k++) {
            const m = (a + b) / 2;
            q.lerpVectors(prev, p.pos, m);
            if (q.y <= this.terrain.heightAt(q.x, q.z)) b = m;
            else a = m;
          }
          q.lerpVectors(prev, p.pos, b);
          q.y = this.terrain.heightAt(q.x, q.z);
          this.onImpact(p, q, null, this.terrain.normalAt(q.x, q.z));
          done = true;
        }
      }
      if (done || p.t > 150 || Math.abs(p.pos.x) > 8000 || Math.abs(p.pos.z) > 8000) {
        this.list.splice(i, 1);
      }
    }

    // 曳光彈
    let n = 0;
    const tp = this.tracerPos;
    for (const p of this.list) {
      if (!p.tracer || n >= MAX_TRACERS || p.t < 0.02) continue;
      const len = 0.022;
      const o = n * 6;
      tp[o] = p.pos.x - p.vel.x * len;
      tp[o + 1] = p.pos.y - p.vel.y * len;
      tp[o + 2] = p.pos.z - p.vel.z * len;
      tp[o + 3] = p.pos.x;
      tp[o + 4] = p.pos.y;
      tp[o + 5] = p.pos.z;
      n++;
    }
    this.tracers.geometry.setDrawRange(0, n * 2);
    this.tracers.geometry.attributes.position.needsUpdate = true;
  }
}
