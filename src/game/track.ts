import { perp, sampleClosedCatmullRom, Vec2, sub, len, dot, norm } from "./spline";

export const LANE_OFFSETS = [-28, 0, 28] as const;
export const NUM_LANES = LANE_OFFSETS.length;

export type Track = {
  name: string;
  width: number; // half-width of asphalt
  center: Vec2[]; // sampled centerline (closed)
  tangents: Vec2[]; // unit tangents per sample
  curvature: number[]; // signed curvature per sample (rad / px)
  inner: Vec2[]; // inner edge polygon
  outer: Vec2[]; // outer edge polygon
  cumulativeLength: number[]; // arc length at each sample
  totalLength: number;
  startIndex: number; // sample index of start/finish line
  startPos: Vec2;
  startDir: Vec2; // unit forward at start
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

// Fukuoka city-tour layout. Clockwise loop visiting the famous landmarks
// roughly in their real geographic order:
//   south side  (Hakata → Canal City → Nakasu → Tenjin) — long start
//                straight along the city's east-west main road
//   south-west  (Ohori Park → Fukuoka Castle ruins detour)
//   far west    (PayPay Dome → Fukuoka Tower)
//   north side  (Momochi Beach → Hakata Bay coast — the back stretch)
//   east return turn-in to the Hakata Station start straight
//
// Y is screen-down so "north" (the bay) is at NEGATIVE y, matching how
// real maps print Fukuoka with the bay at the top of the page.
const CONTROL_POINTS: Vec2[] = [
  // Start straight along Hakata–Tenjin (samples 0..3 colinear on y=0).
  // Three points on y=0 ahead of the start guarantee a pure-west tangent
  // through the whole grid section.
  { x: 530,  y: 0    },  // 0  HAKATA STATION — start / finish
  { x: 380,  y: 0    },  // 1
  { x: 220,  y: 0    },  // 2  Canal City run
  { x: 60,   y: 0    },  // 3  Nakasu / Tenjin run
  // South dip down to the Castle ruins, then back north.
  { x: -100, y: 30   },  // 4  Akasaka
  { x: -240, y: 70   },  // 5  Ohori area
  { x: -360, y: 170  },  // 6  FUKUOKA CASTLE (south detour apex)
  { x: -520, y: 110  },  // 7
  // West / north-west to the coast.
  { x: -640, y: -10  },  // 8  PayPay Dome run
  { x: -740, y: -150 },  // 9  Fukuoka Tower (far-west extreme)
  { x: -680, y: -290 },  // 10 Momochi Beach (turn east onto bay)
  // Bay-coast back stretch heading east.
  { x: -480, y: -340 },  // 11
  { x: -200, y: -360 },  // 12 Hakata Bay
  { x: 60,   y: -360 },  // 13
  { x: 320,  y: -340 },  // 14
  { x: 520,  y: -270 },  // 15
  // East-end hairpin: cars come in heading ESE, pivot south, then exit
  // pointing west — onto the start straight without overshoot.
  { x: 700,  y: -150 },  // 16 corner entry
  { x: 800,  y: -40  },  // 17 corner apex (off-straight)
  { x: 760,  y: 0    },  // 18 corner exit, just touching y=0
  { x: 650,  y: 0    },  // 19 first colinear point on the start straight
];

export type LandmarkIcon =
  | "station" | "canal" | "nakasu" | "tenjin" | "ohori"
  | "castle"  | "dome"  | "tower"  | "beach"  | "bay";

export type Landmark = {
  name: string;
  /** Where the icon + label should be drawn (in green / sea area near
   *  the track, hand-tuned for readability). */
  pos: Vec2;
  /** Anchor point on the track that the connector line points to so
   *  the player can tell which segment each spot belongs to. */
  anchor: Vec2;
  icon: LandmarkIcon;
};

// Famous Fukuoka spots. `anchor` is on/near the track, `pos` is where
// the stylised icon + label sit so they don't cover the asphalt.
export const LANDMARKS: Landmark[] = [
  { name: "Hakata Stn",     icon: "station", anchor: { x: 530,  y: 0    }, pos: { x: 580,  y: 110  } },
  { name: "Canal City",     icon: "canal",   anchor: { x: 380,  y: 0    }, pos: { x: 380,  y: 110  } },
  { name: "Nakasu",         icon: "nakasu",  anchor: { x: 220,  y: 0    }, pos: { x: 220,  y: 110  } },
  { name: "Tenjin",         icon: "tenjin",  anchor: { x: 60,   y: 0    }, pos: { x: 60,   y: 130  } },
  { name: "Ohori Park",     icon: "ohori",   anchor: { x: -240, y: 70   }, pos: { x: -180, y: -110 } },
  { name: "Fukuoka Castle", icon: "castle",  anchor: { x: -360, y: 170  }, pos: { x: -400, y: 260  } },
  { name: "PayPay Dome",    icon: "dome",    anchor: { x: -640, y: -10  }, pos: { x: -560, y: 130  } },
  { name: "Fukuoka Tower",  icon: "tower",   anchor: { x: -740, y: -150 }, pos: { x: -890, y: -170 } },
  { name: "Momochi Beach",  icon: "beach",   anchor: { x: -680, y: -290 }, pos: { x: -740, y: -440 } },
  { name: "Hakata Bay",     icon: "bay",     anchor: { x: -100, y: -360 }, pos: { x: -100, y: -470 } },
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

  // Per-sample signed curvature (rad / px). Compute from tangent rotation
  // between neighbours divided by arc length between them.
  const n = center.length;
  const curvature: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const a = tangents[(i - 1 + n) % n];
    const b = tangents[(i + 1) % n];
    const cross = a.x * b.y - a.y * b.x;
    const dotV = a.x * b.x + a.y * b.y;
    const dAngle = Math.atan2(cross, dotV); // signed turn over 2 samples
    const i0 = (i - 1 + n) % n;
    const i1 = (i + 1) % n;
    const ds = len(sub(center[i1], center[i0])) || 1;
    curvature[i] = dAngle / ds;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of outer.concat(inner)) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    name: "Fukuoka Street Circuit",
    width,
    center,
    tangents,
    curvature,
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

// Grid positions: staggered behind start line on alternating lanes.
export function gridPositions(track: Track, count: number): { pos: Vec2; angle: number; lane: number; progress: number }[] {
  const out: { pos: Vec2; angle: number; lane: number; progress: number }[] = [];
  for (let i = 0; i < count; i++) {
    const lane = i % NUM_LANES;
    const back = 60 + i * 45; // arc length behind start, in px
    const progress = ((1 - back / track.totalLength) % 1 + 1) % 1;
    const sample = sampleAtProgress(track, progress, lane);
    out.push({ pos: sample.pos, angle: sample.angle, lane, progress });
  }
  return out;
}

// Sample world-space position + tangent angle at fractional track progress
// [0,1) and a (possibly fractional) lane index. Progress is interpreted as
// a fraction of arc length around the loop, so a constant speed produces
// constant world-space motion through both straights and tight corners.
export function sampleAtProgress(track: Track, progress: number, lane: number): { pos: Vec2; angle: number; curvature: number } {
  const arcLen = (((progress % 1) + 1) % 1) * track.totalLength;
  const { i0, i1, t } = indexAtArc(track, arcLen);

  const c0 = track.center[i0];
  const c1 = track.center[i1];
  const tg0 = track.tangents[i0];
  const tg1 = track.tangents[i1];

  // Centerline at progress.
  const cx = c0.x + (c1.x - c0.x) * t;
  const cy = c0.y + (c1.y - c0.y) * t;
  const tx = tg0.x + (tg1.x - tg0.x) * t;
  const ty = tg0.y + (tg1.y - tg0.y) * t;
  const tl = Math.hypot(tx, ty) || 1;
  const tnx = tx / tl;
  const tny = ty / tl;

  // Lane offset (perpendicular to tangent).
  const offset = laneOffsetValue(lane);
  // perp of (tnx, tny) is (-tny, tnx).
  const px = cx + (-tny) * offset;
  const py = cy + (tnx) * offset;

  const angle = Math.atan2(tny, tnx);
  const k0 = track.curvature[i0];
  const k1 = track.curvature[i1];
  const kCenter = k0 + (k1 - k0) * t;
  const curvature = effectiveCurvature(kCenter, offset);

  return { pos: { x: px, y: py }, angle, curvature };
}

// Adjusts a centerline curvature for a perpendicular lane offset. With our
// perp convention (+offset = inside of a positive-κ turn), the lane on the
// inside has a tighter radius and therefore higher |κ|; the lane on the
// outside has a gentler radius and lower |κ|. This is what gives the
// outer lane an overtaking opportunity through corners.
//
//   r_lane = r_center − offset      → κ_lane = κ / (1 − κ·offset)
//
// Clamped to avoid the singularity when a lane offset would land at the
// turn's radius origin (physically the inside lane folding through itself).
export function laneAdjustedCurvature(kCenter: number, lateralOffset: number): number {
  const denom = 1 - kCenter * lateralOffset;
  if (denom <= 0.05) return kCenter / 0.05; // clamp tightly
  return kCenter / denom;
}

// Extra grip the outer lane gets on top of its geometric advantage. Pure
// arcade fudge — real slots/F1 cars can put more load on the outside, and
// this gives the player a meaningful incentive to take the long way round
// to overtake.
const OUTER_GRIP_BONUS = 0.30;

// Combined geometry + outer-lane grip bonus into a single effective
// curvature. Used by the deslot check and the HUD lookahead so both
// behave consistently. Outer side: |κ_eff| < |κ_lane|. Inner / centre /
// straight: no bonus.
export function effectiveCurvature(kCenter: number, lateralOffset: number): number {
  const kLane = laneAdjustedCurvature(kCenter, lateralOffset);
  if (Math.abs(kCenter) < 1e-6) return kLane;
  // outerness > 0 when the lane is on the outside of the curve.
  const outerness = -Math.sign(kCenter) * Math.sign(lateralOffset);
  return outerness > 0 ? kLane / (1 + OUTER_GRIP_BONUS) : kLane;
}

// Locate the sample segment containing a given arc-length offset from start.
// Returns the segment endpoints' indices and the [0,1] interpolation along it.
function indexAtArc(track: Track, arcLen: number): { i0: number; i1: number; t: number } {
  const lengths = track.cumulativeLength;
  const n = lengths.length;
  // Binary search for the largest i with lengths[i] <= arcLen.
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (lengths[mid] <= arcLen) lo = mid;
    else hi = mid - 1;
  }
  const i0 = lo;
  const i1 = (i0 + 1) % n;
  const endArc = i1 === 0 ? track.totalLength : lengths[i1];
  const segLen = endArc - lengths[i0];
  const t = segLen > 0 ? Math.max(0, Math.min(1, (arcLen - lengths[i0]) / segLen)) : 0;
  return { i0, i1, t };
}

// Convert a fractional lane index to a perpendicular offset (px). Lane indices
// outside [0, NUM_LANES-1] extrapolate by the same lane spacing.
export function laneOffsetValue(lane: number): number {
  const i0 = Math.floor(lane);
  const i1 = i0 + 1;
  const t = lane - i0;
  const a = sampleLane(i0);
  const b = sampleLane(i1);
  return a + (b - a) * t;
}

function sampleLane(i: number): number {
  if (i < 0) return LANE_OFFSETS[0] + i * laneSpacing();
  if (i >= NUM_LANES) return LANE_OFFSETS[NUM_LANES - 1] + (i - (NUM_LANES - 1)) * laneSpacing();
  return LANE_OFFSETS[i];
}

function laneSpacing(): number {
  return LANE_OFFSETS[1] - LANE_OFFSETS[0];
}

// Largest absolute curvature found in the next `distance` pixels of arc
// length ahead of `progress` for the given lane. Used by the HUD to show
// the upcoming speed limit before the player gets to the corner. Lane is
// honoured so the outer lane sees a gentler upcoming κ than the inner.
export function lookaheadMaxCurvature(track: Track, progress: number, distance: number, lane = 1, samples = 10): number {
  const startArc = (((progress % 1) + 1) % 1) * track.totalLength;
  const offset = laneOffsetValue(lane);
  let maxK = 0;
  const step = distance / Math.max(1, samples - 1);
  for (let i = 0; i < samples; i++) {
    const arc = (startArc + step * i) % track.totalLength;
    const { i0, i1, t } = indexAtArcExternal(track, arc);
    const kCenter = track.curvature[i0] + (track.curvature[i1] - track.curvature[i0]) * t;
    const k = Math.abs(effectiveCurvature(kCenter, offset));
    if (k > maxK) maxK = k;
  }
  return maxK;
}

function indexAtArcExternal(track: Track, arcLen: number): { i0: number; i1: number; t: number } {
  const lengths = track.cumulativeLength;
  const n = lengths.length;
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (lengths[mid] <= arcLen) lo = mid;
    else hi = mid - 1;
  }
  const i0 = lo;
  const i1 = (i0 + 1) % n;
  const endArc = i1 === 0 ? track.totalLength : lengths[i1];
  const segLen = endArc - lengths[i0];
  const t = segLen > 0 ? Math.max(0, Math.min(1, (arcLen - lengths[i0]) / segLen)) : 0;
  return { i0, i1, t };
}

export { norm };
