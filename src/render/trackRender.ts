import { gridPositions, LANDMARKS, LANE_OFFSETS, Track } from "../game/track";
import { perp, Vec2 } from "../game/spline";
import { drawLandmarkIcon } from "./landmarkIcons";

const MAX_GRID_SLOTS = 4;

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
  drawLaneStripes(ctx, track);
  drawStartLine(ctx, track);
  drawStartGrid(ctx, track);
  drawLandmarks(ctx);

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
  // Variable run-off: gravel where the corner is dangerous, tarmac
  // run-off everywhere else. The cheap approximation is a per-sample
  // curvature lookup -- consecutive same-class samples become a single
  // visual quad strip, so the colour change reads as a continuous patch
  // rather than a checker pattern.
  const offset = 36;
  const outerRing = expandRing(track.outer, track.center, +offset);
  const innerRing = expandRing(track.inner, track.center, -offset);

  const GRAVEL_KAPPA = 0.012;   // tighter than this gets gravel
  const gravel = "#c2a878";
  const tarmac = "#3d4350";     // darker grey runoff for safer sections

  const n = track.center.length;
  // Outer side patches.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const k = Math.max(Math.abs(track.curvature[i]), Math.abs(track.curvature[j]));
    ctx.fillStyle = k > GRAVEL_KAPPA ? gravel : tarmac;
    ctx.beginPath();
    ctx.moveTo(track.outer[i].x, track.outer[i].y);
    ctx.lineTo(track.outer[j].x, track.outer[j].y);
    ctx.lineTo(outerRing[j].x, outerRing[j].y);
    ctx.lineTo(outerRing[i].x, outerRing[i].y);
    ctx.closePath();
    ctx.fill();
  }
  // Inner side patches.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const k = Math.max(Math.abs(track.curvature[i]), Math.abs(track.curvature[j]));
    ctx.fillStyle = k > GRAVEL_KAPPA ? gravel : tarmac;
    ctx.beginPath();
    ctx.moveTo(track.inner[i].x, track.inner[i].y);
    ctx.lineTo(track.inner[j].x, track.inner[j].y);
    ctx.lineTo(innerRing[j].x, innerRing[j].y);
    ctx.lineTo(innerRing[i].x, innerRing[i].y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawAsphalt(ctx: CanvasRenderingContext2D, track: Track) {
  // Slot-car body: glossy near-black plastic with a focused top-light
  // highlight (like the model is sitting on a table under a single bulb).
  ctx.beginPath();
  polyPath(ctx, track.outer);
  polyPath(ctx, [...track.inner].reverse());
  ctx.fillStyle = "#0d0f15";
  ctx.fill("evenodd");

  // Inner darker shading near the edges — fakes a slightly rolled plastic
  // edge so the track reads as a solid moulded piece rather than a flat
  // painted shape.
  ctx.save();
  ctx.beginPath();
  polyPath(ctx, track.outer);
  polyPath(ctx, [...track.inner].reverse());
  ctx.clip("evenodd");

  // Cool blue-white plastic highlight, biased upper-left to imply lighting.
  const cx = (track.bounds.minX + track.bounds.maxX) / 2;
  const cy = (track.bounds.minY + track.bounds.maxY) / 2;
  const r = Math.hypot(track.bounds.maxX - cx, track.bounds.maxY - cy);
  const sheen = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.45, r * 0.05, cx, cy, r);
  sheen.addColorStop(0,    "rgba(180, 200, 225, 0.22)");
  sheen.addColorStop(0.35, "rgba(60, 70, 90, 0.05)");
  sheen.addColorStop(1,    "rgba(0, 0, 0, 0.35)");
  ctx.fillStyle = sheen;
  ctx.fillRect(
    track.bounds.minX - 200,
    track.bounds.minY - 200,
    (track.bounds.maxX - track.bounds.minX) + 400,
    (track.bounds.maxY - track.bounds.minY) + 400
  );
  ctx.restore();

  // Edge lines — bright white, a touch thicker for a moulded look.
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = "#f3f6fb";
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

  // Cap the maximum curb length to keep tight corners from looking like
  // the curb wraps the whole apex zone — F1 curbs are typically short
  // strips focused on the apex itself.
  const MAX_CURB_SAMPLES = 14;

  let i = 0;
  let segId = 0;
  while (i < samples) {
    const c = curvature[i];
    if (Math.abs(c) > 0.22) {
      const sign = Math.sign(c);
      let j = i;
      while (j < samples
        && (j - i) < MAX_CURB_SAMPLES
        && Math.sign(curvature[j]) === sign
        && Math.abs(curvature[j]) > 0.12) j++;
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
  if (to <= from) return;
  if (to > track.center.length) to = track.center.length;

  const apexSide = sign > 0 ? 1 : -1;
  const curbWidth = 14;
  const tileLengthPx = 18; // target physical length of one red/white tile

  // Build the inner (track-edge) and outer (curb-outside) polylines for
  // this segment, then walk them by *arc length* so every tile has a
  // consistent visual size regardless of sample density.
  const edge: Vec2[] = [];
  const outerEdge: Vec2[] = [];
  for (let k = from; k < to; k++) {
    const t = track.tangents[k];
    const n = perp(t);
    edge.push({
      x: track.center[k].x + n.x * track.width * apexSide,
      y: track.center[k].y + n.y * track.width * apexSide
    });
    outerEdge.push({
      x: track.center[k].x + n.x * (track.width + curbWidth) * apexSide,
      y: track.center[k].y + n.y * (track.width + curbWidth) * apexSide
    });
  }
  if (edge.length < 2) return;

  // Cumulative arc length along the inner edge.
  const cum: number[] = [0];
  for (let k = 1; k < edge.length; k++) {
    cum.push(cum[k - 1] + Math.hypot(edge[k].x - edge[k - 1].x, edge[k].y - edge[k - 1].y));
  }
  const totalArc = cum[cum.length - 1];
  if (totalArc <= 0) return;

  const tiles = Math.max(4, Math.round(totalArc / tileLengthPx));

  for (let tile = 0; tile < tiles; tile++) {
    const arcStart = (tile / tiles) * totalArc;
    const arcEnd = ((tile + 1) / tiles) * totalArc;

    // Locate the sample-index range that this tile spans.
    let s0 = 0;
    for (let k = 0; k < cum.length; k++) {
      if (cum[k] <= arcStart) s0 = k;
    }
    let s1 = s0;
    for (let k = s0; k < cum.length; k++) {
      if (cum[k] < arcEnd) s1 = k;
    }

    // Exact start/end points by interpolating between sample chords.
    const p0i = lerpAlong(edge, cum, arcStart);
    const p0o = lerpAlong(outerEdge, cum, arcStart);
    const p1i = lerpAlong(edge, cum, arcEnd);
    const p1o = lerpAlong(outerEdge, cum, arcEnd);

    // Build a polygon that follows the polyline (rather than a flat chord)
    // for both inner and outer curb edges between the endpoint pair.
    ctx.beginPath();
    ctx.moveTo(p0i.x, p0i.y);
    for (let k = s0 + 1; k <= s1; k++) ctx.lineTo(edge[k].x, edge[k].y);
    ctx.lineTo(p1i.x, p1i.y);
    ctx.lineTo(p1o.x, p1o.y);
    for (let k = s1; k > s0; k--) ctx.lineTo(outerEdge[k].x, outerEdge[k].y);
    ctx.lineTo(p0o.x, p0o.y);
    ctx.closePath();
    ctx.fillStyle = (tile + segId) % 2 === 0 ? "#e63a3a" : "#f4f4f4";
    ctx.fill();
  }
}

function lerpAlong(poly: Vec2[], cum: number[], targetArc: number): Vec2 {
  const n = poly.length;
  if (n === 0) return { x: 0, y: 0 };
  const total = cum[n - 1];
  if (targetArc <= 0) return { x: poly[0].x, y: poly[0].y };
  if (targetArc >= total) return { x: poly[n - 1].x, y: poly[n - 1].y };
  for (let k = 1; k < n; k++) {
    if (cum[k] >= targetArc) {
      const segLen = cum[k] - cum[k - 1] || 1;
      const t = (targetArc - cum[k - 1]) / segLen;
      return {
        x: poly[k - 1].x + (poly[k].x - poly[k - 1].x) * t,
        y: poly[k - 1].y + (poly[k].y - poly[k - 1].y) * t
      };
    }
  }
  return { x: poly[n - 1].x, y: poly[n - 1].y };
}

function drawLaneStripes(ctx: CanvasRenderingContext2D, track: Track) {
  // Build polylines along each lane offset and draw them as faint dashed
  // guides. Boundaries between lanes get a subtle solid line.
  const samples = track.center.length;
  ctx.save();
  ctx.lineWidth = 1.6;
  ctx.setLineDash([10, 14]);
  ctx.strokeStyle = "rgba(235, 240, 250, 0.32)";
  for (const off of LANE_OFFSETS) {
    ctx.beginPath();
    for (let i = 0; i <= samples; i++) {
      const idx = i % samples;
      const t = track.tangents[idx];
      const n = perp(t);
      const x = track.center[idx].x + n.x * off;
      const y = track.center[idx].y + n.y * off;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

// Draw the actual landmark buildings into the cached track art so they
// sit in the world like real city scenery — the track passes by them,
// no labels and no connector lines, the silhouette has to read on its
// own.
function drawLandmarks(ctx: CanvasRenderingContext2D) {
  const SCALE = 1.8;
  for (const lm of LANDMARKS) {
    ctx.save();
    ctx.translate(lm.pos.x, lm.pos.y);
    ctx.scale(SCALE, SCALE);
    drawLandmarkIcon(ctx, lm.icon);
    ctx.restore();
  }
}

// Paint white "[ ]" brackets at every grid slot so the grid is visible on
// the asphalt before the lights go out, like a real F1 starting box.
function drawStartGrid(ctx: CanvasRenderingContext2D, track: Track) {
  const slots = gridPositions(track, MAX_GRID_SLOTS);
  ctx.save();
  ctx.strokeStyle = "#f0f3f8";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "square";

  // Footprint we want to outline (slightly larger than the rendered car).
  const halfLen = 22;
  const halfWid = 12;
  const armLen = 5;

  for (const slot of slots) {
    ctx.save();
    ctx.translate(slot.pos.x, slot.pos.y);
    ctx.rotate(slot.angle);
    drawBracket(ctx,  halfLen, -halfWid, -armLen,  armLen);  // front-left
    drawBracket(ctx,  halfLen,  halfWid, -armLen, -armLen);  // front-right
    drawBracket(ctx, -halfLen, -halfWid,  armLen,  armLen);  // back-left
    drawBracket(ctx, -halfLen,  halfWid,  armLen, -armLen);  // back-right
    ctx.restore();
  }
  ctx.restore();
}

// Draws an L-shaped corner mark anchored at (cx, cy) with arms extending by
// (dx, 0) and (0, dy) in local space.
function drawBracket(ctx: CanvasRenderingContext2D, cx: number, cy: number, dx: number, dy: number) {
  ctx.beginPath();
  ctx.moveTo(cx + dx, cy);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx, cy + dy);
  ctx.stroke();
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
