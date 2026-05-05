// Tiny particle system used for deslot sparks (and other one-off bursts).
// Each particle is integrated as a free body with exponential drag so the
// burst looks like impact debris.

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

export class Particles {
  private list: Particle[] = [];

  count() { return this.list.length; }

  spawn(p: Particle) {
    this.list.push(p);
  }

  spawnBurst(x: number, y: number, count: number, opts?: {
    speedMin?: number; speedMax?: number;
    lifeMin?: number; lifeMax?: number;
    sizeMin?: number; sizeMax?: number;
    color?: (i: number) => string;
  }) {
    const o = opts ?? {};
    const speedMin = o.speedMin ?? 80;
    const speedMax = o.speedMax ?? 320;
    const lifeMin = o.lifeMin ?? 0.5;
    const lifeMax = o.lifeMax ?? 1.1;
    const sizeMin = o.sizeMin ?? 1;
    const sizeMax = o.sizeMax ?? 2.5;
    const colorFn = o.color ?? (() => "#ffd23f");
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      const life = lifeMin + Math.random() * (lifeMax - lifeMin);
      this.list.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: sizeMin + Math.random() * (sizeMax - sizeMin),
        color: colorFn(i),
      });
    }
  }

  update(dt: number) {
    const decay = Math.exp(-2.0 * dt);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= decay;
      p.vy *= decay;
      p.life -= dt;
      if (p.life <= 0) this.list.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.list) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
