// Track representation and helpers. A track is a closed polyline (centerline)
// with a width, plus a racing line (hand-authored polyline with target speeds)
// and a start/finish line plus grid positions.
//
// Distances are arc-length along the racing line for AI lookahead. Lap
// progress is tracked along the centerline.

import type { Vec2 } from "../race/state";

export interface RacingLinePoint {
  x: number;
  y: number;
  /** Target speed at this point, m/s. */
  vTarget: number;
}

export interface GridSlot {
  position: Vec2;
  /** Heading in radians, world frame. */
  heading: number;
}

export interface TrackData {
  schema: 1;
  id: string;
  name: string;
  /** Track full width, m. */
  width: number;
  /** Closed polyline (last point should not duplicate the first). */
  centerline: Vec2[];
  racingLine: RacingLinePoint[];
  /** Start positions for cars (>= 4 expected). */
  startGrid: GridSlot[];
  /** Index in centerline that defines the start/finish crossing. */
  startLineIndex: number;
}

export interface PreparedTrack {
  data: TrackData;
  /** Cumulative arc length to each centerline vertex; last entry is total length. */
  centerlineCum: number[];
  /** Total centerline length, m (one lap). */
  lapLength: number;
  /** Cumulative arc length along the racing line. */
  racingLineCum: number[];
  racingLineLength: number;
}

/** Pre-compute arc-length tables for fast lookups. */
export function prepareTrack(data: TrackData): PreparedTrack {
  const cl = arcLengths(data.centerline, true);
  const rl = arcLengths(
    data.racingLine.map((p) => ({ x: p.x, y: p.y })),
    true,
  );
  return {
    data,
    centerlineCum: cl.cum,
    lapLength: cl.total,
    racingLineCum: rl.cum,
    racingLineLength: rl.total,
  };
}

function arcLengths(points: Vec2[], closed: boolean): { cum: number[]; total: number } {
  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const d = dist(points[i - 1], points[i]);
    cum.push(cum[i - 1] + d);
  }
  if (closed && points.length > 1) {
    const last = dist(points[points.length - 1], points[0]);
    cum.push(cum[cum.length - 1] + last);
  }
  return { cum, total: cum[cum.length - 1] };
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Find arc-length s along the centerline closest to the given world point.
 *  Uses segment projection. Returns { s, dist, segIndex, t }. */
export function projectToCenterline(
  track: PreparedTrack,
  p: Vec2,
): { s: number; dist: number; segIndex: number; t: number } {
  return projectToPolyline(track.data.centerline, track.centerlineCum, p, true);
}

/** Look up a point on the racing line at arc-length s (wraps around). */
export function racingLinePointAt(track: PreparedTrack, s: number): RacingLinePoint {
  const total = track.racingLineLength;
  const sw = ((s % total) + total) % total;
  const cum = track.racingLineCum;
  const pts = track.data.racingLine;
  // Binary search for segment.
  let lo = 0;
  let hi = cum.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= sw) lo = mid;
    else hi = mid;
  }
  const a = pts[lo % pts.length];
  const b = pts[(lo + 1) % pts.length];
  const segLen = cum[lo + 1] - cum[lo];
  const t = segLen > 1e-9 ? (sw - cum[lo]) / segLen : 0;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    vTarget: a.vTarget + (b.vTarget - a.vTarget) * t,
  };
}

/** Project a world point onto a closed polyline. */
function projectToPolyline(
  pts: Vec2[],
  cum: number[],
  p: Vec2,
  closed: boolean,
): { s: number; dist: number; segIndex: number; t: number } {
  let bestDist2 = Infinity;
  let bestS = 0;
  let bestSeg = 0;
  let bestT = 0;
  const n = pts.length;
  const segCount = closed ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) continue;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const d2 = (p.x - px) * (p.x - px) + (p.y - py) * (p.y - py);
    if (d2 < bestDist2) {
      bestDist2 = d2;
      bestSeg = i;
      bestT = t;
      const segLen = Math.sqrt(len2);
      bestS = cum[i] + segLen * t;
    }
  }
  return { s: bestS, dist: Math.sqrt(bestDist2), segIndex: bestSeg, t: bestT };
}

/** Find arc-length s along the racing line closest to the given world point. */
export function projectToRacingLine(
  track: PreparedTrack,
  p: Vec2,
): { s: number; dist: number } {
  const r = projectToPolyline(
    track.data.racingLine.map((pt) => ({ x: pt.x, y: pt.y })),
    track.racingLineCum,
    p,
    true,
  );
  return { s: r.s, dist: r.dist };
}
