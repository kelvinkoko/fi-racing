export type Vec2 = { x: number; y: number };

export function add(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y }; }
export function sub(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y }; }
export function scale(a: Vec2, s: number): Vec2 { return { x: a.x * s, y: a.y * s }; }
export function len(a: Vec2): number { return Math.hypot(a.x, a.y); }
export function norm(a: Vec2): Vec2 {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
}
export function perp(a: Vec2): Vec2 { return { x: -a.y, y: a.x }; }
export function dot(a: Vec2, b: Vec2): number { return a.x * b.x + a.y * b.y; }

// Centripetal Catmull-Rom spline through closed loop of control points.
// Returns sampled points and tangents.
export function sampleClosedCatmullRom(
  pts: Vec2[],
  samplesPerSegment = 24,
  alpha = 0.5
): { points: Vec2[]; tangents: Vec2[] } {
  const n = pts.length;
  const points: Vec2[] = [];
  const tangents: Vec2[] = [];

  const tj = (ti: number, pi: Vec2, pj: Vec2) => {
    const dx = pj.x - pi.x;
    const dy = pj.y - pi.y;
    return Math.pow(Math.hypot(dx, dy), alpha) + ti;
  };

  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];

    const t0 = 0;
    const t1 = tj(t0, p0, p1);
    const t2 = tj(t1, p1, p2);
    const t3 = tj(t2, p2, p3);

    for (let s = 0; s < samplesPerSegment; s++) {
      const t = t1 + (t2 - t1) * (s / samplesPerSegment);

      const a1 = lerp(p0, p1, (t - t0) / (t1 - t0));
      const a2 = lerp(p1, p2, (t - t1) / (t2 - t1));
      const a3 = lerp(p2, p3, (t - t2) / (t3 - t2));
      const b1 = lerp(a1, a2, (t - t0) / (t2 - t0));
      const b2 = lerp(a2, a3, (t - t1) / (t3 - t1));
      const c = lerp(b1, b2, (t - t1) / (t2 - t1));

      // Tangent via numerical derivative.
      const eps = 1e-3;
      const t_ = Math.min(t + eps, t2 - 1e-6);
      const a1n = lerp(p0, p1, (t_ - t0) / (t1 - t0));
      const a2n = lerp(p1, p2, (t_ - t1) / (t2 - t1));
      const a3n = lerp(p2, p3, (t_ - t2) / (t3 - t2));
      const b1n = lerp(a1n, a2n, (t_ - t0) / (t2 - t0));
      const b2n = lerp(a2n, a3n, (t_ - t1) / (t3 - t1));
      const cn = lerp(b1n, b2n, (t_ - t1) / (t2 - t1));

      points.push(c);
      tangents.push(norm(sub(cn, c)));
    }
  }
  return { points, tangents };
}

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
