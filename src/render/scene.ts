import { Track } from "../game/track";
import { TrackArt } from "./trackRender";
import { Vec2 } from "../game/spline";

export type CarVisual = {
  pos: Vec2;
  angle: number;
  color: string;
  name?: string;
  isLocal?: boolean;
  desloted?: boolean;
  warning?: boolean;
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
  ctx.save();
  ctx.translate(car.pos.x, car.pos.y);
  ctx.rotate(car.angle);

  if (car.warning && !car.desloted) {
    const pulse = 0.45 + 0.35 * Math.sin(performance.now() / 80);
    ctx.shadowColor = `rgba(255, 210, 64, ${pulse})`;
    ctx.shadowBlur = 22;
  }
  if (car.desloted) ctx.globalAlpha = 0.7;

  drawF1Body(ctx, car.color);

  ctx.shadowBlur = 0;

  if (car.isLocal) {
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 12, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

// Draw an F1-style car oriented along +x (nose pointing right). Total
// footprint roughly 38 long × 22 wide including wheels.
function drawF1Body(ctx: CanvasRenderingContext2D, color: string) {
  const lighter = lighten(color, 0.22);
  const darker = darken(color, 0.22);

  // Cast shadow
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(0, 2, 20, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // Floor/underbody (dark base silhouette so wing/body sit on top)
  ctx.fillStyle = "#0d0f14";
  roundRect(ctx, -16, -7, 30, 14, 3);
  ctx.fill();

  // Rear wheels (drawn before the body so the body overlaps slightly)
  drawWheel(ctx, -10, -8.5);
  drawWheel(ctx, -10, 8.5);
  // Front wheels — slightly smaller, more outboard
  drawWheel(ctx, 9, -8.5, 0.9);
  drawWheel(ctx, 9, 8.5, 0.9);

  // Sidepods — wider mid-body, team colour
  ctx.fillStyle = darker;
  ctx.beginPath();
  ctx.moveTo(-12, -7);
  ctx.lineTo(2, -8.5);
  ctx.lineTo(8, -6);
  ctx.lineTo(8, 6);
  ctx.lineTo(2, 8.5);
  ctx.lineTo(-12, 7);
  ctx.closePath();
  ctx.fill();

  // Main body / engine cover — sleek, narrowing toward nose
  const bodyGrad = ctx.createLinearGradient(0, -6, 0, 6);
  bodyGrad.addColorStop(0, lighter);
  bodyGrad.addColorStop(0.5, color);
  bodyGrad.addColorStop(1, darker);
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(-13, -3);   // tail of engine cover
  ctx.lineTo(-4, -5);
  ctx.lineTo(2, -4.5);   // shoulder near cockpit
  ctx.lineTo(13, -2);    // nose taper
  ctx.lineTo(15, 0);     // nose tip
  ctx.lineTo(13, 2);
  ctx.lineTo(2, 4.5);
  ctx.lineTo(-4, 5);
  ctx.lineTo(-13, 3);
  ctx.closePath();
  ctx.fill();

  // Cockpit / halo
  ctx.fillStyle = "rgba(15, 18, 25, 0.95)";
  ctx.beginPath();
  ctx.ellipse(1, 0, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(220, 226, 235, 0.5)";
  ctx.lineWidth = 0.7;
  ctx.stroke();

  // Driver helmet stripe
  ctx.fillStyle = lighten(color, 0.4);
  ctx.fillRect(0, -1, 2, 2);

  // Front wing — wide, with white plane and team-colour endplates
  ctx.fillStyle = "#e8ecf3";
  roundRect(ctx, 13, -9, 4, 18, 1.2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(13, -9.5, 4, 1.5);
  ctx.fillRect(13, 8, 4, 1.5);

  // Rear wing — vertical, with endplates
  ctx.fillStyle = "#1a1f2b";
  ctx.fillRect(-17.5, -7.5, 1.6, 15);          // beam
  ctx.fillStyle = color;
  ctx.fillRect(-18.5, -8.5, 2, 4);             // top-left endplate
  ctx.fillRect(-18.5, 4.5, 2, 4);              // top-right endplate
  ctx.fillStyle = "#e8ecf3";
  ctx.fillRect(-16.5, -6, 0.8, 12);            // light upper element

  // Tiny mirrors
  ctx.fillStyle = "#0d0f14";
  ctx.fillRect(3, -5.5, 1.2, 1);
  ctx.fillRect(3, 4.5, 1.2, 1);
}

function drawWheel(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  const w = 7 * scale;
  const h = 3.4 * scale;
  // Tyre
  ctx.fillStyle = "#0c0d11";
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 1.2);
  ctx.fill();
  // Sidewall highlight
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(x - w / 2 + 1, y - h / 2 + 0.4, w - 2, 0.6);
  // Hub (small lighter dot)
  ctx.fillStyle = "#3a3f4d";
  ctx.beginPath();
  ctx.ellipse(x, y, 1.2, 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
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
