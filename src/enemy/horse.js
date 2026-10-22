// 戰馬（tools/blender/horse.py），程式產生奔跑、站立、倒地動作
const LEGS = ['FL', 'FR', 'BL', 'BR'];
// 襲步的相位差（前左、前右、後左、後右）
const GALLOP = { FL: 0.0, FR: 0.18, BL: 0.55, BR: 0.7 };

export class Horse {
  constructor(template) {
    this.root = template.clone(true);
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    const g = (n) => this.root.getObjectByName(n);
    this.body = g('Body');
    this.neck = g('Neck');
    this.head = g('HeadH');
    this.tail = g('Tail');
    this.saddle = g('Saddle');
    this.legs = {};
    for (const l of LEGS) this.legs[l] = { hip: g(`Leg${l}`), knee: g(`Knee${l}`) };
    this.bodyY = this.body.position.y;
    this.phase = Math.random();
    this.speed = 0;
    this.dead = 0; // 0–1 倒地進度
    this.t = Math.random() * 5;
  }

  update(dt, speed) {
    this.t += dt;
    this.speed += (speed - this.speed) * Math.min(1, dt * 3);
    const v = this.speed;
    const k = Math.min(1, v / 8);
    this.phase = (this.phase + dt * (0.6 + v * 0.17)) % 1;
    for (const l of LEGS) {
      const ph = ((this.phase + GALLOP[l]) % 1) * Math.PI * 2;
      const front = l[0] === 'F';
      const swing = Math.sin(ph) * (front ? 0.75 : 0.6) * k;
      const bend = Math.max(0, Math.cos(ph)) * (front ? 1.2 : -0.9) * k;
      this.legs[l].hip.rotation.z = swing;
      this.legs[l].knee.rotation.z = front ? -bend : bend;
    }
    this.body.rotation.z = Math.sin(this.phase * Math.PI * 2) * 0.06 * k;
    this.body.position.y = this.bodyY + Math.abs(Math.sin(this.phase * Math.PI * 2)) * 0.08 * k;
    this.neck.rotation.z = -0.25 * k + Math.sin(this.phase * Math.PI * 2 + 1) * 0.12 * k + Math.sin(this.t * 0.7) * 0.05 * (1 - k);
    this.tail.rotation.z = -0.6 * k + Math.sin(this.t * 2) * 0.1;
    if (this.dead > 0) {
      // 倒向右側
      this.root.rotation.x = Math.min(1, this.dead) * 1.45;
      this.root.position.y = this.baseY + Math.min(1, this.dead) * 0.25;
      for (const l of LEGS) this.legs[l].hip.rotation.z = 0.3;
    }
  }
}
