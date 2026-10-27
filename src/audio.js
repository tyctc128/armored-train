import * as THREE from 'three';

const SPEED_OF_SOUND = 343;

// 錄音音效（public/sfx，取自「効果音ラボ」https://soundeffect-lab.info/ ，依其規約僅供本遊戲內使用、不得單獨再散布）
// 名稱 → 檔名候選（隨機挑一個）、音高隨機範圍
const SAMPLES = {
  cannon: { files: ['cannon'], jitter: 0.04 },
  explosion: { files: ['explosion1', 'explosion2', 'explosion3'], jitter: 0.06 },
  explosionBig: { files: ['explosion_big'], jitter: 0.03 },
  mg: { files: ['mg'], jitter: 0.06 },
  rifle: { files: ['rifle'], jitter: 0.08 },
  ping: { files: ['ricochet'], jitter: 0.12 },
  hit: { files: ['hit_heavy'], jitter: 0.08 },
  click: { files: ['click'], jitter: 0.05 },
  clank: { files: ['breech'], jitter: 0.04 },
  mgReload: { files: ['mg_reload'], jitter: 0.04 },
  hammer: { files: ['hammer'], jitter: 0.1 },
  bell: { files: ['bell'], jitter: 0.02 },
  ding: { files: ['ding'], jitter: 0 },
  chuff: { files: ['chuff'], jitter: 0.08 },
  whistle: { files: ['whistle'], jitter: 0 },
};
const LOOP_ROLLING = 'rolling';

// WebAudio 3D 音效：全部 3D 定位，並依距離以音速延遲、以低通模擬空氣吸收。
// 錄音載入前（或載入失敗）退回程式合成音。
export class Audio3D {
  constructor() {
    this.ctx = null;
    this.listenerPos = new THREE.Vector3();
    this._f = new THREE.Vector3();
    this._u = new THREE.Vector3();
    this.chuffT = 0;
    this.buffers = {};
  }

  async loadSamples() {
    const names = new Set([LOOP_ROLLING, ...Object.values(SAMPLES).flatMap((s) => s.files)]);
    await Promise.all([...names].map(async (n) => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}sfx/${n}.mp3`);
        if (!res.ok) return;
        this.buffers[n] = await this.ctx.decodeAudioData(await res.arrayBuffer());
      } catch {
        // 解碼失敗就用合成音
      }
    }));
    this.startRolling();
  }

  // 行駛中的輪軌聲（循環），音量與速度隨列車速度變化
  startRolling() {
    const buf = this.buffers[LOOP_ROLLING];
    if (!buf || this.rolling) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(g).connect(this.master);
    src.start();
    this.rolling = { src, g };
  }

  sample(name, out, t0, gain, cut, rate = 1) {
    const def = SAMPLES[name];
    const file = def && def.files[Math.floor(Math.random() * def.files.length)];
    const buf = file && this.buffers[file];
    if (!buf) return false;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * def.jitter);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cut;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(lp).connect(g).connect(out);
    src.start(t0);
    return true;
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
    this.loadSamples();
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

  // 在世界座標 pos 播放；dist 決定延遲與音色。rate：播放速度（>1 音高較高，用於較小口徑的砲）
  play(type, pos, gain = 1, rate = 1) {
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
      p.refDistance = NEAR_TYPES.has(type) ? 6 : 25;
      p.rolloffFactor = 1;
      p.maxDistance = 20000;
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
      p.connect(this.master);
      out = p;
    }
    const absorb = Math.max(180, 9000 * Math.exp(-dist / 1800));
    if (this.sample(type, out, t0, gain, absorb, rate)) return;
    const recipe = RECIPES[FALLBACK[type] ?? type];
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

  // 蒸汽機車排汽聲：每轉 4 次；另有隨速度變化的輪軌聲
  updateEngine(dt, speed, locoPos) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const v = Math.abs(speed);
    if (this.rolling) {
      const near = Math.min(1, 40 / Math.max(1, locoPos.distanceTo(this.listenerPos)));
      const t = this.ctx.currentTime;
      this.rolling.g.gain.setTargetAtTime(Math.min(1, v / 12) * 0.7 * near, t, 0.3);
      this.rolling.src.playbackRate.setTargetAtTime(0.7 + Math.min(v, 17) / 30, t, 0.3);
    }
    const rate = v < 0.1 ? 0.6 : (4 * v) / (2 * Math.PI * 0.69);
    this.chuffT -= dt;
    if (this.chuffT <= 0) {
      this.chuffT = 1 / Math.max(0.6, rate);
      this.play('chuff', locoPos, v < 0.1 ? 0.25 : 0.5 + v / 30);
    }
  }
}

// 近距離才聽得到的小聲音（衰減起點較近）
const NEAR_TYPES = new Set(['mg', 'click', 'clank', 'mgReload', 'hammer']);
// 沒有對應合成音的種類，退回相近的合成音
const FALLBACK = { explosionBig: 'explosion', hit: 'ping', mgReload: 'clank', hammer: 'clank', ding: 'bell', whistle: 'bell' };

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
  rifle(a, out, t0, gain, cut) {
    a.noiseBurst(out, t0, { dur: 0.35, gain: 0.7 * gain, type: 'bandpass', freq: 1800, q: 0.5, cutoff: cut, attack: 0.001 });
    a.noiseBurst(out, t0 + 0.01, { dur: 0.6, gain: 0.25 * gain, freq: 600, cutoff: cut });
  },
  ping(a, out, t0, gain) {
    a.tone(out, t0, { freq: 2600, dur: 0.18, gain: 0.25 * gain, type: 'triangle', slide: 0.7 });
    a.noiseBurst(out, t0, { dur: 0.06, gain: 0.3 * gain, type: 'highpass', freq: 3000, attack: 0.001 });
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
