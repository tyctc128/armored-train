import * as THREE from 'three';

const SPEED_OF_SOUND = 343;

// WebAudio 合成音效，全部 3D 定位，並依距離以音速延遲、以低通模擬空氣吸收
export class Audio3D {
  constructor() {
    this.ctx = null;
    this.listenerPos = new THREE.Vector3();
    this._f = new THREE.Vector3();
    this._u = new THREE.Vector3();
    this.chuffT = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setListener(camera) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    this.listenerPos.copy(camera.position);
    camera.getWorldDirection(this._f);
    this._u.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setValueAtTime(camera.position.x, t);
      L.positionY.setValueAtTime(camera.position.y, t);
      L.positionZ.setValueAtTime(camera.position.z, t);
      L.forwardX.setValueAtTime(this._f.x, t);
      L.forwardY.setValueAtTime(this._f.y, t);
      L.forwardZ.setValueAtTime(this._f.z, t);
      L.upX.setValueAtTime(this._u.x, t);
      L.upY.setValueAtTime(this._u.y, t);
      L.upZ.setValueAtTime(this._u.z, t);
    } else {
      L.setPosition(camera.position.x, camera.position.y, camera.position.z);
      L.setOrientation(this._f.x, this._f.y, this._f.z, this._u.x, this._u.y, this._u.z);
    }
  }

  // 在世界座標 pos 播放；dist 決定延遲與音色
  play(type, pos, gain = 1) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const dist = pos ? pos.distanceTo(this.listenerPos) : 0;
    if (dist > 14000) return;
    const t0 = ctx.currentTime + dist / SPEED_OF_SOUND + 0.01;
    let out = this.master;
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = type === 'mg' || type === 'click' ? 6 : 25;
      p.rolloffFactor = 1;
      p.maxDistance = 20000;
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
      p.connect(this.master);
      out = p;
    }
    const absorb = Math.max(180, 9000 * Math.exp(-dist / 1800));
    const recipe = RECIPES[type];
    if (recipe) recipe(this, out, t0, gain, absorb);
  }

  noiseBurst(out, t0, { dur, gain, type = 'lowpass', freq = 1000, q = 0.7, attack = 0.003, cutoff = 20000 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = Math.min(freq, cutoff);
    f.Q.value = q;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(lp).connect(g).connect(out);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }

  tone(out, t0, { freq, dur, gain, type = 'sine', slide = 1 }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  // 蒸汽機車排汽聲：每轉 4 次
  updateEngine(dt, speed, locoPos) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const v = Math.abs(speed);
    const rate = v < 0.1 ? 0.6 : (4 * v) / (2 * Math.PI * 0.69);
    this.chuffT -= dt;
    if (this.chuffT <= 0) {
      this.chuffT = 1 / Math.max(0.6, rate);
      this.play('chuff', locoPos, v < 0.1 ? 0.25 : 0.5 + v / 30);
    }
  }
}

const RECIPES = {
  cannon(a, out, t0, gain, cut) {
    a.noiseBurst(out, t0, { dur: 2.2, gain: 1.0 * gain, freq: 900, cutoff: cut });
    a.noiseBurst(out, t0, { dur: 0.25, gain: 0.8 * gain, type: 'bandpass', freq: 2500, q: 0.5, cutoff: cut });
    a.tone(out, t0, { freq: 70, dur: 0.6, gain: 0.9 * gain, slide: 0.5 });
  },
  explosion(a, out, t0, gain, cut) {
    a.noiseBurst(out, t0, { dur: 3.2, gain: 1.0 * gain, freq: 500, cutoff: cut, attack: 0.008 });
    a.tone(out, t0, { freq: 55, dur: 1.2, gain: 0.8 * gain, slide: 0.4 });
  },
  mg(a, out, t0, gain, cut) {
    a.noiseBurst(out, t0, { dur: 0.09, gain: 0.55 * gain, type: 'bandpass', freq: 1400, q: 0.6, cutoff: cut, attack: 0.001 });
    a.tone(out, t0, { freq: 160, dur: 0.05, gain: 0.35 * gain, slide: 0.6 });
  },
  click(a, out, t0, gain, cut) {
    a.noiseBurst(out, t0, { dur: 0.04, gain: 0.2 * gain, type: 'highpass', freq: 2500, cutoff: cut, attack: 0.001 });
  },
  clank(a, out, t0, gain) {
    a.tone(out, t0, { freq: 820, dur: 0.25, gain: 0.25 * gain, type: 'triangle' });
    a.tone(out, t0 + 0.09, { freq: 1240, dur: 0.3, gain: 0.2 * gain, type: 'triangle' });
    a.noiseBurst(out, t0, { dur: 0.12, gain: 0.3 * gain, type: 'bandpass', freq: 3000, q: 1 });
  },
  bell(a, out, t0, gain) {
    a.tone(out, t0, { freq: 1760, dur: 0.7, gain: 0.25 * gain });
    a.tone(out, t0 + 0.22, { freq: 1760, dur: 0.7, gain: 0.25 * gain });
  },
  chuff(a, out, t0, gain, cut) {
    a.noiseBurst(out, t0, { dur: 0.22, gain: 0.35 * gain, type: 'bandpass', freq: 380, q: 0.9, cutoff: cut, attack: 0.01 });
  },
};
