// 鍵盤、滑鼠與指標鎖定。hit()/btnHit() 只在按下的那一幀為 true。
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.buttons = new Set();
    this.clicked = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.onLockChange = null;

    addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'F1'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.buttons.clear();
    });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.buttons.add(e.button);
      this.clicked.add(e.button);
    });
    addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    addEventListener(
      'wheel',
      (e) => {
        if (this.locked) this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.buttons.clear();
      this.onLockChange?.(this.locked);
    });
  }

  lock() {
    try {
      const p = this.canvas.requestPointerLock?.();
      p?.catch?.(() => {});
    } catch {
      /* 瀏覽器拒絕時保持未鎖定 */
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) {
    return this.keys.has(code);
  }
  hit(code) {
    return this.pressed.has(code);
  }
  btn(b) {
    return this.buttons.has(b);
  }
  btnHit(b) {
    return this.clicked.has(b);
  }

  endFrame() {
    this.pressed.clear();
    this.clicked.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
