import * as THREE from 'three';
import { buildSteps } from './steps.js';
import { FLOOR_Y } from '../train/carModels.js';

const ADVANCE_DELAY = 0.9;

// 教學關流程：依序執行步驟，檢查完成條件，顯示面板與導引標記
export class Tutorial {
  constructor(ctx, scene) {
    this.ctx = ctx;
    this.steps = buildSteps(ctx);
    let chapter = '';
    let ci = 0;
    this.chapters = [];
    this.steps.forEach((s, i) => {
      if (s.chapter) {
        chapter = s.chapter;
        this.chapters.push({ name: chapter, start: i });
        ci = this.chapters.length - 1;
      }
      s.chapterIndex = ci;
    });
    this.active = false;
    this.index = -1;
    this.state = {};
    this.pending = 0;
    this.skipped = 0;
    this.panel = document.getElementById('tutorial');
    this.marker = makeMarker();
    scene.add(this.marker);
    this._v = new THREE.Vector3();
  }

  get step() {
    return this.steps[this.index];
  }

  start() {
    this.active = true;
    this.startTime = this.ctx.game.time;
    this.panel.classList.remove('hidden');
    this.go(0);
  }

  go(i, prepared = null) {
    this.index = i;
    this.pending = 0;
    if (!this.step) return this.finish();
    if (prepared) this.state = prepared;
    else {
      this.state = {};
      this.step.enter?.(this.ctx, this.state);
    }
    this.render();
    if (this.step.skipIf?.(this.ctx)) {
      this.ctx.game.message(this.step.skipText ?? '已達成，跳過此步驟');
      this.complete();
    }
  }

  complete(skipped = false) {
    if (this.pending) return;
    if (skipped) this.skipped++;
    this.pending = ADVANCE_DELAY;
    // 下一步的起始狀態現在就記錄，等待動畫期間玩家做的事也算數
    this.nextState = {};
    this.steps[this.index + 1]?.enter?.(this.ctx, this.nextState);
    this.ctx.game.audio.play('ding', null, 0.35);
    this.panel.querySelector('.t-step')?.classList.add(skipped ? 'skip' : 'done');
    const next = this.steps[this.index + 1];
    if (!next || next.chapterIndex !== this.step.chapterIndex) {
      this.ctx.game.message(`完成第 ${this.step.chapterIndex + 1} 章：${this.chapters[this.step.chapterIndex].name}`);
    }
  }

  onEvent(type, data) {
    if (!this.active) return;
    if (this.pending) {
      // 切換動畫期間的事件交給下一步
      const next = this.steps[this.index + 1];
      if (next?.on?.[type]?.(data, this.ctx, this.nextState)) this.nextDone = true;
      return;
    }
    if (this.step?.on?.[type]?.(data, this.ctx, this.state)) this.complete();
  }

  // passive：圖鑑開啟時只檢查條件，不處理 N／Enter
  update(dt, passive = false) {
    if (!this.active) return;
    const c = this.ctx;
    if (this.pending) {
      this.pending -= dt;
      if (this.pending <= 0) {
        const done = this.nextDone;
        this.nextDone = false;
        this.go(this.index + 1, this.nextState);
        if (done && this.active) this.complete();
      }
      this.updateMarker();
      return;
    }
    const s = this.step;
    if (!passive && c.input.hit('KeyN')) {
      this.complete(true);
      return;
    }
    if (s.info) {
      if (!passive && (c.input.hit('Enter') || c.input.hit('NumpadEnter'))) this.complete();
    } else if (s.check?.(c, this.state, dt)) {
      this.complete();
    }
    this.updateMarker();
    this.updateHint();
  }

  // 導引標記：黃色箭頭＋地面圓環，穿牆可見
  updateMarker() {
    const c = this.ctx;
    const g = !this.pending && this.step?.goto?.(c);
    const show = !!g && c.game.mode === 'walk';
    this.marker.visible = show;
    this.goto = g || null;
    if (!show) return;
    const car = c.train.cars[g.car];
    const y = g.level === 'roof' ? car.roofY : FLOOR_Y;
    this._v.set(g.x, y + 0.03, g.lat).applyMatrix4(car.group.matrixWorld);
    this.marker.position.copy(this._v);
    this.marker.quaternion.copy(car.group.quaternion);
    const t = performance.now() / 1000;
    this.marker.userData.arrow.position.y = 1.55 + Math.sin(t * 4) * 0.12;
    this.marker.userData.ring.scale.setScalar(1 + ((t * 1.2) % 1) * 0.6);
    this.marker.userData.ring.material.opacity = 0.8 * (1 - ((t * 1.2) % 1));
  }

  distanceToGoal() {
    if (!this.goto) return null;
    const c = this.ctx;
    const car = c.train.cars[this.goto.car];
    const a = car.offset + car.len / 2 - this.goto.x;
    const w = c.player.where();
    if (w.car === car) return Math.hypot(c.player.a - a, c.player.lat - this.goto.lat);
    return Math.abs(c.player.a - a);
  }

  updateHint() {
    const el = this.panel.querySelector('.t-hint');
    if (!el) return;
    let text = this.step.hint?.() ?? '';
    const d = this.distanceToGoal();
    if (d != null && this.ctx.game.mode === 'walk') {
      const dir = (() => {
        const car = this.ctx.train.cars[this.goto.car];
        const a = car.offset + car.len / 2 - this.goto.x;
        if (Math.abs(this.ctx.player.a - a) < 1) return '';
        return a < this.ctx.player.a ? '（往車頭方向）' : '（往車尾方向）';
      })();
      text = `前往：${this.goto.label}　${d.toFixed(1)} m${dir}`;
    }
    if (el.textContent !== text) el.textContent = text;
  }

  // 右下角簡圖要高亮的車廂
  highlightCar() {
    if (!this.active || this.pending) return null;
    const s = this.step;
    return s?.goto?.(this.ctx)?.car ?? s?.car ?? null;
  }

  render() {
    const s = this.step;
    const ch = this.chapters[s.chapterIndex];
    const chEnd = this.chapters[s.chapterIndex + 1]?.start ?? this.steps.length;
    const local = this.index - ch.start;
    const total = chEnd - ch.start;
    const list = this.steps
      .slice(ch.start, chEnd)
      .map((st, i) => `<li class="${i < local ? 'ok' : i === local ? 'now' : ''}">${st.title}</li>`)
      .join('');
    const pct = (this.index / this.steps.length) * 100;
    this.panel.innerHTML = `
      <div class="t-head">
        <span class="t-badge">教學</span>
        <div><b>第 ${s.chapterIndex + 1} 章　${ch.name}</b><small>第 ${s.chapterIndex + 1}／${this.chapters.length} 章</small></div>
      </div>
      <div class="t-progress"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="t-step">
        <div class="t-num">步驟 ${local + 1}／${total}</div>
        <h3>${s.title}</h3>
        <p>${s.text}</p>
        <div class="t-hint"></div>
      </div>
      <ol class="t-list">${list}</ol>
      <div class="t-foot"><kbd>N</kbd> 略過此步驟${s.info ? '　<kbd>Enter</kbd> 繼續' : ''}</div>`;
    this.updateHint();
  }

  finish() {
    const c = this.ctx;
    this.active = false;
    this.marker.visible = false;
    this.panel.classList.add('hidden');
    const secs = Math.round(c.game.time - this.startTime);
    const st = c.game.stats;
    const rank = this.skipped === 0 ? (secs < 900 ? 'S' : secs < 1500 ? 'A' : 'B') : this.skipped <= 3 ? 'C' : 'D';
    c.showDebrief(`
      <h2>試驗運行　結業</h2>
      <div class="t-rank">${rank}</div>
      <table class="t-stats">
        <tr><th>完成時間</th><td>${Math.floor(secs / 60)} 分 ${secs % 60} 秒</td></tr>
        <tr><th>略過步驟</th><td>${this.skipped}</td></tr>
        <tr><th>十糎砲發射／有效</th><td>${st.shots}／${st.hits}</td></tr>
        <tr><th>擊毀目標</th><td>${c.targets.destroyed}／${c.targets.total}</td></tr>
      </table>
      <p class="note">評等：未略過步驟且 15 分鐘內完成為 S。之後可以自由練習，剩下的靶都還在。</p>
      <div style="text-align:center"><button class="start-btn" id="debrief-btn">繼續自由練習</button></div>`);
  }
}

function makeMarker() {
  const g = new THREE.Group();
  const mat = (color, opacity = 1) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const arrow = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 16).rotateX(Math.PI), mat(0xffc04a));
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10), mat(0xffc04a));
  stem.position.y = 0.3;
  arrow.add(cone, stem);
  const disc = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 32).rotateX(-Math.PI / 2), mat(0xffc04a, 0.9));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.48, 32).rotateX(-Math.PI / 2), mat(0xffc04a, 0.8));
  g.add(arrow, disc, ring);
  g.userData = { arrow, ring };
  g.traverse((o) => (o.renderOrder = 999));
  g.visible = false;
  return g;
}
