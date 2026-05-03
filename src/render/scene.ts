import { Track } from "../game/track";
import { TrackArt } from "./trackRender";
import { Vec2 } from "../game/spline";

export type CarVisual = {
  pos: Vec2;
  angle: number;
  color: string;
  name?: string;
  isLocal?: boolean;
};

export type Camera = {
  x: number;
  y: number;
  zoom: number;
};

export function createCamera(): Camera {
  return { x: 0, y: 0, zoom: 1.1 };
}

export function followCamera(cam: Camera, target: Vec2, viewportW: number, viewportH: number, dt: number) {
  // Smooth follow with velocity-aware lookahead would be nicer; keep simple for now.
  const k = 1 - Math.exp(-dt * 6);
  cam.x += (target.x - cam.x) * k;
  cam.y += (target.y - cam.y) * k;
  void viewportW; void viewportH;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  track: Track,
  art: TrackArt,
  cars: CarVisual[],
  viewportW: number,
  viewportH: number
) {
  // Backdrop already cleared by caller; draw a vignette/bg first.
  ctx.fillStyle = "#0b0d12";
  ctx.fillRect(0, 0, viewportW, viewportH);

  ctx.save();
  ctx.translate(viewportW / 2, viewportH / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  // Draw cached track. The art canvas was rendered with a translation so its
  // pixel (0,0) corresponds to (minX-padding, minY-padding) in world coords.
  ctx.drawImage(
    art.canvas,
    track.bounds.minX - art.padding,
    track.bounds.minY - art.padding
  );

  for (const c of cars) drawCar(ctx, c);

  ctx.restore();

  // Subtle vignette overlay in screen space.
  const vg = ctx.createRadialGradient(viewportW / 2, viewportH / 2, Math.min(viewportW, viewportH) * 0.4, viewportW / 2, viewportH / 2, Math.max(viewportW, viewportH) * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, viewportW, viewportH);
}

function drawCar(ctx: CanvasRenderingContext2D, car: CarVisual) {
  const w = 28;
  const h = 14;
  ctx.save();
  ctx.translate(car.pos.x, car.pos.y);
  ctx.rotate(car.angle);

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  roundRect(ctx, -w / 2 + 2, -h / 2 + 3, w, h, 3);
  ctx.fill();

  // Body
  const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  grad.addColorStop(0, lighten(car.color, 0.25));
  grad.addColorStop(1, darken(car.color, 0.15));
  ctx.fillStyle = grad;
  roundRect(ctx, -w / 2, -h / 2, w, h, 3);
  ctx.fill();

  // Cockpit
  ctx.fillStyle = "rgba(20,24,34,0.85)";
  roundRect(ctx, -3, -h / 2 + 3, 9, h - 6, 2);
  ctx.fill();

  // Front wing hint
  ctx.fillStyle = darken(car.color, 0.3);
  ctx.fillRect(w / 2 - 3, -h / 2 - 1, 3, h + 2);

  // Rear wing
  ctx.fillRect(-w / 2 - 1, -h / 2 - 2, 3, h + 4);

  if (car.isLocal) {
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1.2;
    roundRect(ctx, -w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 3, 4);
    ctx.stroke();
  }

  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const v = m.length === 3
    ? m.split("").map(c => parseInt(c + c, 16))
    : [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
  return [v[0], v[1], v[2]];
}
function rgb(c: [number, number, number]): string {
  return `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;
}
function lighten(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgb([r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t]);
}
function darken(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgb([r * (1 - t), g * (1 - t), b * (1 - t)]);
}
