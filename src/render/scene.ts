import { Track } from "../game/track";
import { TrackArt } from "./trackRender";
import { Vec2 } from "../game/spline";
import { Particles } from "./particles";

export type CarVisual = {
  pos: Vec2;
  angle: number;
  color: string;
  name?: string;
  isLocal?: boolean;
  desloted?: boolean;
  warning?: boolean;
  braking?: boolean;
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
  viewportH: number,
  particles?: Particles
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

  if (particles) particles.draw(ctx);

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

  drawGTBody(ctx, car.color, !!car.braking);

  ctx.shadowBlur = 0;

  ctx.restore();
}

// Draw a GT-style car (Le Mans / Gran Turismo silhouette) oriented with
// the nose along +x. Total footprint roughly 40 long × 22 wide
// including the rear spoiler endplates.
function drawGTBody(ctx: CanvasRenderingContext2D, color: string, braking: boolean) {
  const lighter = lighten(color, 0.22);
  const darker  = darken(color, 0.22);

  // Cast shadow underneath the chassis
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  roundRect(ctx, -17, -10 + 1.5, 36, 20, 6);
  ctx.fill();

  // Main body — rounded enclosed chassis (no exposed wheels)
  const bodyGrad = ctx.createLinearGradient(0, -10, 0, 10);
  bodyGrad.addColorStop(0,    lighter);
  bodyGrad.addColorStop(0.5,  color);
  bodyGrad.addColorStop(1,    darker);
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, -18, -10, 36, 20, 6);
  ctx.fill();

  // Wheel-arch shading (subtle dark patches over the four fender areas)
  ctx.fillStyle = "rgba(0,0,0,0.30)";
  ctx.fillRect(8,   -10,  6, 1.6); // front-left arch
  ctx.fillRect(8,    8.4, 6, 1.6); // front-right arch
  ctx.fillRect(-14, -10,  6, 1.6); // rear-left
  ctx.fillRect(-14,  8.4, 6, 1.6); // rear-right

  // Greenhouse base — dark cabin shape
  ctx.fillStyle = "#1a1f2b";
  roundRect(ctx, -10, -7, 18, 14, 3.5);
  ctx.fill();

  // Windshield (front of greenhouse)
  ctx.fillStyle = "rgba(180, 220, 240, 0.45)";
  ctx.beginPath();
  ctx.moveTo(8,   -6);
  ctx.lineTo(2,   -6.6);
  ctx.lineTo(2,    6.6);
  ctx.lineTo(8,    6);
  ctx.closePath();
  ctx.fill();

  // Rear window
  ctx.fillStyle = "rgba(180, 220, 240, 0.28)";
  ctx.beginPath();
  ctx.moveTo(-2, -6.6);
  ctx.lineTo(-9, -6);
  ctx.lineTo(-9,  6);
  ctx.lineTo(-2,  6.6);
  ctx.closePath();
  ctx.fill();

  // Roof number disc (a la GT3 car number rondel)
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.beginPath();
  ctx.arc(-3, 0, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 0.6;
  ctx.stroke();

  // Hood lines (subtle vents / panel gaps)
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(9,  -4); ctx.lineTo(15, -4);
  ctx.moveTo(9,   4); ctx.lineTo(15,  4);
  ctx.stroke();

  // Headlights — bright clusters at the front corners
  ctx.fillStyle = "rgba(255, 240, 200, 0.95)";
  roundRect(ctx, 15.5, -8.5, 2.5, 2.6, 0.5);
  ctx.fill();
  roundRect(ctx, 15.5,  5.9, 2.5, 2.6, 0.5);
  ctx.fill();

  // Front grille (small slot in centre of nose)
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  roundRect(ctx, 16.5, -2.6, 1.6, 5.2, 0.5);
  ctx.fill();

  // Side mirrors mounted just outside the A-pillars
  ctx.fillStyle = darker;
  roundRect(ctx, 6, -10.8, 2, 1.4, 0.5);
  ctx.fill();
  roundRect(ctx, 6,  9.4, 2, 1.4, 0.5);
  ctx.fill();

  // Door cut-line on each side
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, -10); ctx.lineTo(0, -7);
  ctx.moveTo(0,  10); ctx.lineTo(0,  7);
  ctx.stroke();

  // Rear spoiler — slim element across the back, with team-colour
  // endplate caps.
  ctx.fillStyle = "#1a1f2b";
  ctx.fillRect(-19, -10, 2, 20);
  ctx.fillStyle = color;
  ctx.fillRect(-20, -10.5, 1.5, 3);
  ctx.fillRect(-20,  7.5,  1.5, 3);

  // Taillights — bright red when braking, dim wine when not.
  if (braking) {
    ctx.shadowColor = "rgba(255, 60, 80, 0.95)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#ff3344";
  } else {
    ctx.fillStyle = "#7a1a26";
  }
  roundRect(ctx, -17.5, -8,  1.6, 2.5, 0.4);
  ctx.fill();
  roundRect(ctx, -17.5,  5.5, 1.6, 2.5, 0.4);
  ctx.fill();
  ctx.shadowBlur = 0;
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
