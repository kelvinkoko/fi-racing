import { Track } from "../game/track";
import { perp, Vec2 } from "../game/spline";

// Pre-rendered, cached track layers. Drawn once into an offscreen canvas so the
// per-frame cost is just a single drawImage. Big visual win for performance.
export type TrackArt = {
  canvas: HTMLCanvasElement;
  worldToArt: (x: number, y: number) => Vec2;
  artToWorld: (x: number, y: number) => Vec2;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  padding: number;
};

export function renderTrackArt(track: Track, scale = 1): TrackArt {
  const padding = 220;
  const w = Math.ceil((track.bounds.maxX - track.bounds.minX) + padding * 2);
  const h = Math.ceil((track.bounds.maxY - track.bounds.minY) + padding * 2);

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.translate(-track.bounds.minX + padding, -track.bounds.minY + padding);

  drawGrass(ctx, track, padding);
  drawRunoff(ctx, track);
  drawAsphalt(ctx, track);
  drawCurbs(ctx, track);
  drawCenterDashes(ctx, track);
  drawStartLine(ctx, track);

  const worldToArt = (x: number, y: number): Vec2 => ({
    x: (x - track.bounds.minX + padding) * scale,
    y: (y - track.bounds.minY + padding) * scale
  });
  const artToWorld = (x: number, y: number): Vec2 => ({
    x: x / scale + track.bounds.minX - padding,
    y: y / scale + track.bounds.minY - padding
  });

  return {
    canvas,
    worldToArt,
    artToWorld,
    bounds: track.bounds,
    padding
  };
}

function drawGrass(ctx: CanvasRenderingContext2D, track: Track, padding: number) {
  const { minX, minY, maxX, maxY } = track.bounds;
  const grad = ctx.createLinearGradient(minX, minY, maxX, maxY);
  grad.addColorStop(0, "#1f3b22");
  grad.addColorStop(1, "#16291a");
  ctx.fillStyle = grad;
  ctx.fillRect(minX - padding, minY - padding, (maxX - minX) + padding * 2, (maxY - minY) + padding * 2);

  // Subtle stripe pattern for that mowed-grass feel.
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#0a1a0d";
  const stripe = 18;
  for (let y = minY - padding; y < maxY + padding; y += stripe * 2) {
    ctx.fillRect(minX - padding, y, (maxX - minX) + padding * 2, stripe);
  }
  ctx.restore();
}

function drawRunoff(ctx: CanvasRenderingContext2D, track: Track) {
  // Wider sand/gravel ring, slightly offset so it shows around the curbs.
  const offset = 36;
  const outerRing = expandRing(track.outer, track.center, +offset);
  const innerRing = expandRing(track.inner, track.center, -offset);

  ctx.fillStyle = "#c2a878";
  ringFill(ctx, outerRing, track.outer);
  ringFill(ctx, track.inner, innerRing);
  void track; // satisfy lints
}

function drawAsphalt(ctx: CanvasRenderingContext2D, track: Track) {
  // Asphalt body (between inner and outer ring).
  ctx.beginPath();
  polyPath(ctx, track.outer);
  polyPath(ctx, [...track.inner].reverse());
  ctx.fillStyle = "#2a2d33";
  ctx.fill("evenodd");

  // Subtle radial sheen via a clipped overlay.
  ctx.save();
  ctx.beginPath();
  polyPath(ctx, track.outer);
  polyPath(ctx, [...track.inner].reverse());
  ctx.clip("evenodd");
  const cx = (track.bounds.minX + track.bounds.maxX) / 2;
  const cy = (track.bounds.minY + track.bounds.maxY) / 2;
  const r = Math.hypot(track.bounds.maxX - cx, track.bounds.maxY - cy);
  const sheen = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
  sheen.addColorStop(0, "rgba(255,255,255,0.06)");
  sheen.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = sheen;
  ctx.fillRect(track.bounds.minX - 200, track.bounds.minY - 200, (track.bounds.maxX - track.bounds.minX) + 400, (track.bounds.maxY - track.bounds.minY) + 400);
  ctx.restore();

  // Edge lines (white outer, white inner).
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#f1f3f7";
  strokeClosed(ctx, track.outer);
  strokeClosed(ctx, track.inner);
}

function drawCurbs(ctx: CanvasRenderingContext2D, track: Track) {
  // Place red/white curb segments wherever the centerline curves sharply.
  const samples = track.center.length;
  const curvature: number[] = new Array(samples).fill(0);
  for (let i = 0; i < samples; i++) {
    const a = track.tangents[(i - 4 + samples) % samples];
    const b = track.tangents[(i + 4) % samples];
    // Cross product magnitude (z component) tells us turn direction + sharpness.
    curvature[i] = a.x * b.y - a.y * b.x;
  }

  let i = 0;
  let segId = 0;
  while (i < samples) {
    const c = curvature[i];
    if (Math.abs(c) > 0.18) {
      const sign = Math.sign(c);
      let j = i;
      while (j < samples && Math.sign(curvature[j]) === sign && Math.abs(curvature[j]) > 0.08) j++;
      drawCurbSegment(ctx, track, i, j, sign, segId++);
      i = j;
    } else {
      i++;
    }
  }
}

function drawCurbSegment(
  ctx: CanvasRenderingContext2D,
  track: Track,
  from: number,
  to: number,
  sign: number,
  segId: number
) {
  // sign > 0: turn is to the left (in screen coords y-down) — apex on inner side
  // We pick the corresponding edge polygon side.
  const edge: Vec2[] = [];
  const outerEdge: Vec2[] = [];
  const curbWidth = 14;
  for (let k = from; k <= to; k++) {
    const t = track.tangents[k];
    const n = perp(t);
    const apexSide = sign > 0 ? 1 : -1; // pick the side of the apex
    const base = {
      x: track.center[k].x + n.x * track.width * apexSide,
      y: track.center[k].y + n.y * track.width * apexSide
    };
    const out = {
      x: base.x + n.x * curbWidth * apexSide,
      y: base.y + n.y * curbWidth * apexSide
    };
    edge.push(base);
    outerEdge.push(out);
  }
  // Draw alternating red/white tiles along the curb strip.
  const tiles = Math.max(4, Math.floor((to - from) / 1.2));
  for (let k = 0; k < tiles; k++) {
    const a0 = Math.floor((k / tiles) * (edge.length - 1));
    const a1 = Math.floor(((k + 1) / tiles) * (edge.length - 1));
    ctx.beginPath();
    ctx.moveTo(edge[a0].x, edge[a0].y);
    ctx.lineTo(outerEdge[a0].x, outerEdge[a0].y);
    ctx.lineTo(outerEdge[a1].x, outerEdge[a1].y);
    ctx.lineTo(edge[a1].x, edge[a1].y);
    ctx.closePath();
    ctx.fillStyle = (k + segId) % 2 === 0 ? "#e63a3a" : "#f4f4f4";
    ctx.fill();
  }
}

function drawCenterDashes(ctx: CanvasRenderingContext2D, track: Track) {
  // Yellow dashed line down the middle, suppressed in tight corners.
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 220, 80, 0.45)";
  ctx.setLineDash([18, 22]);
  ctx.beginPath();
  for (let i = 0; i < track.center.length; i++) {
    const p = track.center[i];
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawStartLine(ctx: CanvasRenderingContext2D, track: Track) {
  const idx = track.startIndex;
  const t = track.tangents[idx];
  const n = perp(t);
  const c = track.center[idx];
  const w = track.width;
  const depth = 28;
  const cells = 12;

  // Build a quad for the start line.
  const a = { x: c.x + n.x * w, y: c.y + n.y * w };
  const b = { x: c.x - n.x * w, y: c.y - n.y * w };
  const a2 = { x: a.x + t.x * depth, y: a.y + t.y * depth };
  const b2 = { x: b.x + t.x * depth, y: b.y + t.y * depth };

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(b2.x, b2.y);
  ctx.lineTo(a2.x, a2.y);
  ctx.closePath();
  ctx.clip();

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < cells; col++) {
      const u0 = col / cells;
      const u1 = (col + 1) / cells;
      const v0 = row / 2;
      const v1 = (row + 1) / 2;
      const p00 = quad(a, b, a2, b2, u0, v0);
      const p10 = quad(a, b, a2, b2, u1, v0);
      const p11 = quad(a, b, a2, b2, u1, v1);
      const p01 = quad(a, b, a2, b2, u0, v1);
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(p10.x, p10.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(p01.x, p01.y);
      ctx.closePath();
      ctx.fillStyle = (row + col) % 2 === 0 ? "#0c0c0c" : "#f7f7f7";
      ctx.fill();
    }
  }
  ctx.restore();
}

function quad(a: Vec2, b: Vec2, a2: Vec2, b2: Vec2, u: number, v: number): Vec2 {
  // Bilinear interp across the quad.
  const top = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  const bot = { x: a2.x + (b2.x - a2.x) * u, y: a2.y + (b2.y - a2.y) * u };
  return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
}

function expandRing(edge: Vec2[], center: Vec2[], offset: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < edge.length; i++) {
    const dx = edge[i].x - center[i].x;
    const dy = edge[i].y - center[i].y;
    const l = Math.hypot(dx, dy) || 1;
    out.push({
      x: edge[i].x + (dx / l) * offset,
      y: edge[i].y + (dy / l) * offset
    });
  }
  return out;
}

function ringFill(ctx: CanvasRenderingContext2D, outer: Vec2[], inner: Vec2[]) {
  ctx.beginPath();
  polyPath(ctx, outer);
  polyPath(ctx, [...inner].reverse());
  ctx.fill("evenodd");
}

function polyPath(ctx: CanvasRenderingContext2D, pts: Vec2[]) {
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

function strokeClosed(ctx: CanvasRenderingContext2D, pts: Vec2[]) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.stroke();
}
