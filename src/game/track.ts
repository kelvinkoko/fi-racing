import { perp, sampleClosedCatmullRom, Vec2, sub, len, dot, norm } from "./spline";

export type Track = {
  name: string;
  width: number; // half-width of asphalt
  center: Vec2[]; // sampled centerline (closed)
  tangents: Vec2[]; // unit tangents per sample
  inner: Vec2[]; // inner edge polygon
  outer: Vec2[]; // outer edge polygon
  cumulativeLength: number[]; // arc length at each sample
  totalLength: number;
  startIndex: number; // sample index of start/finish line
  startPos: Vec2;
  startDir: Vec2; // unit forward at start
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

// F1-style fictional layout. Hand-tuned control points form a flowing circuit:
// long start straight, fast right kink, S-chicane, hairpin, sweeping double-apex,
// returning down a back straight to the start.
const CONTROL_POINTS: Vec2[] = [
  { x: 0,    y: 0    }, // start/finish
  { x: 600,  y: -20  },
  { x: 950,  y: -120 }, // fast right kink
  { x: 1200, y: -340 },
  { x: 1320, y: -640 },
  { x: 1180, y: -880 }, // entry to chicane
  { x: 980,  y: -820 }, // chicane apex 1
  { x: 880,  y: -640 }, // chicane apex 2
  { x: 720,  y: -560 },
  { x: 500,  y: -700 },
  { x: 280,  y: -940 }, // approach hairpin
  { x: 120,  y: -1080 },
  { x: -120, y: -1060 }, // hairpin apex
  { x: -260, y: -880 },
  { x: -200, y: -640 }, // sweeping double-apex entry
  { x: -380, y: -440 },
  { x: -560, y: -300 },
  { x: -680, y: -120 },
  { x: -640, y: 80   },
  { x: -440, y: 160  },
  { x: -200, y: 120  },
];

export function buildTrack(width = 60): Track {
  const { points: center, tangents } = sampleClosedCatmullRom(CONTROL_POINTS, 28);

  const inner: Vec2[] = [];
  const outer: Vec2[] = [];
  for (let i = 0; i < center.length; i++) {
    const n = perp(tangents[i]);
    inner.push({ x: center[i].x + n.x * width, y: center[i].y + n.y * width });
    outer.push({ x: center[i].x - n.x * width, y: center[i].y - n.y * width });
  }

  const cumulativeLength: number[] = [0];
  for (let i = 1; i < center.length; i++) {
    cumulativeLength.push(cumulativeLength[i - 1] + len(sub(center[i], center[i - 1])));
  }
  const totalLength = cumulativeLength[cumulativeLength.length - 1] + len(sub(center[0], center[center.length - 1]));

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of outer.concat(inner)) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    name: "Circuit Alpha",
    width,
    center,
    tangents,
    inner,
    outer,
    cumulativeLength,
    totalLength,
    startIndex: 0,
    startPos: center[0],
    startDir: tangents[0],
    bounds: { minX, minY, maxX, maxY }
  };
}

// Find nearest centerline sample index to a world point.
export function nearestSample(track: Track, p: Vec2): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < track.center.length; i++) {
    const dx = track.center[i].x - p.x;
    const dy = track.center[i].y - p.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Signed lateral offset from the centerline at sample index. Positive = inner side.
export function lateralOffset(track: Track, p: Vec2, idx: number): number {
  const n = perp(track.tangents[idx]);
  return dot(sub(p, track.center[idx]), n);
}

// Are we on asphalt at this point?
export function onTrack(track: Track, p: Vec2): boolean {
  const idx = nearestSample(track, p);
  return Math.abs(lateralOffset(track, p, idx)) <= track.width;
}

// Progress along track in [0,1) from arbitrary point.
export function progressAt(track: Track, p: Vec2): number {
  const idx = nearestSample(track, p);
  // Refine with projection onto local tangent.
  const t = track.tangents[idx];
  const proj = dot(sub(p, track.center[idx]), t);
  const arc = (track.cumulativeLength[idx] + proj) / track.totalLength;
  return ((arc % 1) + 1) % 1;
}

// Grid positions: staggered behind start line on the alternate sides.
export function gridPositions(track: Track, count: number): { pos: Vec2; angle: number }[] {
  const out: { pos: Vec2; angle: number }[] = [];
  const dir = track.startDir;
  const right = perp(dir);
  const angle = Math.atan2(dir.y, dir.x);
  for (let i = 0; i < count; i++) {
    const back = -60 - i * 50;
    const lateral = (i % 2 === 0 ? -1 : 1) * (track.width * 0.45);
    out.push({
      pos: {
        x: track.startPos.x + dir.x * back + right.x * lateral,
        y: track.startPos.y + dir.y * back + right.y * lateral,
      },
      angle
    });
  }
  return out;
}

export { norm };
