// Schematic F1-tracker style 2D rendering. World units are meters; we set up a
// camera that fits the track in view and use ctx transforms to draw in world
// space. y is flipped so that +y is up on screen.

import type { PreparedTrack } from "@/sim/track/track";
import type { CarState } from "@/sim/race/state";

export interface CameraFit {
  scale: number; // pixels per meter
  offsetX: number; // pixels
  offsetY: number; // pixels
  worldW: number;
  worldH: number;
}

export function fitCamera(
  track: PreparedTrack,
  canvasW: number,
  canvasH: number,
  paddingPx = 40,
): CameraFit {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of track.data.centerline) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const margin = track.data.width;
  minX -= margin;
  minY -= margin;
  maxX += margin;
  maxY += margin;

  const worldW = maxX - minX;
  const worldH = maxY - minY;
  const sx = (canvasW - 2 * paddingPx) / worldW;
  const sy = (canvasH - 2 * paddingPx) / worldH;
  const scale = Math.min(sx, sy);
  const drawW = worldW * scale;
  const drawH = worldH * scale;
  const offsetX = (canvasW - drawW) / 2 - minX * scale;
  // y is flipped: world +y -> screen -y
  const offsetY = (canvasH - drawH) / 2 + maxY * scale;
  return { scale, offsetX, offsetY, worldW, worldH };
}

export function applyCamera(ctx: CanvasRenderingContext2D, cam: CameraFit): void {
  ctx.setTransform(cam.scale, 0, 0, -cam.scale, cam.offsetX, cam.offsetY);
}

export function drawTrack(
  ctx: CanvasRenderingContext2D,
  track: PreparedTrack,
  cam: CameraFit,
): void {
  const cl = track.data.centerline;
  if (cl.length < 2) return;

  // Track surface — wide stroked polyline.
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = track.data.width;
  ctx.strokeStyle = "#1f2937"; // panel-ish
  ctx.beginPath();
  ctx.moveTo(cl[0].x, cl[0].y);
  for (let i = 1; i < cl.length; i++) ctx.lineTo(cl[i].x, cl[i].y);
  ctx.closePath();
  ctx.stroke();

  // Outer + inner edge lines.
  ctx.lineWidth = Math.max(0.4, 1 / cam.scale);
  ctx.strokeStyle = "#374151";
  // Approximate edges by stroking the same path with smaller widths layered.
  ctx.lineWidth = track.data.width;
  ctx.strokeStyle = "#1a2030";
  ctx.beginPath();
  ctx.moveTo(cl[0].x, cl[0].y);
  for (let i = 1; i < cl.length; i++) ctx.lineTo(cl[i].x, cl[i].y);
  ctx.closePath();
  ctx.stroke();

  // Centerline (dashed, faint).
  ctx.setLineDash([2, 4]);
  ctx.lineWidth = Math.max(0.3, 0.5 / cam.scale);
  ctx.strokeStyle = "#4b5563";
  ctx.beginPath();
  ctx.moveTo(cl[0].x, cl[0].y);
  for (let i = 1; i < cl.length; i++) ctx.lineTo(cl[i].x, cl[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  // Racing line (subtle).
  const rl = track.data.racingLine;
  if (rl.length >= 2) {
    ctx.lineWidth = Math.max(0.4, 0.6 / cam.scale);
    ctx.strokeStyle = "rgba(96, 165, 250, 0.35)";
    ctx.beginPath();
    ctx.moveTo(rl[0].x, rl[0].y);
    for (let i = 1; i < rl.length; i++) ctx.lineTo(rl[i].x, rl[i].y);
    ctx.closePath();
    ctx.stroke();
  }

  // Start/finish line: short perpendicular at startLineIndex.
  const idx = track.data.startLineIndex;
  const a = cl[idx];
  const b = cl[(idx + 1) % cl.length];
  const tx = b.x - a.x;
  const ty = b.y - a.y;
  const len = Math.hypot(tx, ty) || 1;
  const nx = -ty / len;
  const ny = tx / len;
  const half = track.data.width / 2;
  ctx.strokeStyle = "#f3f4f6";
  ctx.lineWidth = Math.max(0.5, 1 / cam.scale);
  ctx.beginPath();
  ctx.moveTo(a.x - nx * half, a.y - ny * half);
  ctx.lineTo(a.x + nx * half, a.y + ny * half);
  ctx.stroke();
}

export interface CarSnapshot {
  x: number;
  y: number;
  heading: number;
  brake: number;
  color?: string;
}

export function drawCar(
  ctx: CanvasRenderingContext2D,
  car: CarState,
  cam: CameraFit,
): void {
  drawCarSnapshot(
    ctx,
    {
      x: car.position.x,
      y: car.position.y,
      heading: car.heading,
      brake: car.inputBrake,
      color: car.config.color,
    },
    cam,
  );
}

export function drawCarSnapshot(
  ctx: CanvasRenderingContext2D,
  snap: CarSnapshot,
  cam: CameraFit,
): void {
  const len = 4.5;
  const wid = 1.9;
  const color = snap.color ?? "#60a5fa";
  ctx.save();
  ctx.translate(snap.x, snap.y);
  ctx.rotate(snap.heading);
  // Body
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = Math.max(0.05, 0.5 / cam.scale);
  roundRect(ctx, -len / 2, -wid / 2, len, wid, 0.4);
  ctx.fill();
  ctx.stroke();
  // Direction nose
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  roundRect(ctx, len / 2 - 0.7, -wid / 4, 0.7, wid / 2, 0.2);
  ctx.fill();
  // Brake glow
  if (snap.brake > 0.2) {
    ctx.fillStyle = `rgba(248, 113, 113, ${Math.min(1, snap.brake)})`;
    roundRect(ctx, -len / 2, -wid / 2, 0.5, wid, 0.1);
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
