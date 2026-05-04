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

  drawF1Body(ctx, car.color, !!car.braking);

  ctx.shadowBlur = 0;

  ctx.restore();
}

// Draw an F1-style car oriented along +x (nose pointing in the direction
// of travel). Total footprint roughly 44 long × 22 wide including the
// front wing. Silhouette is deliberately rear-wide / nose-narrow so the
// orientation reads at a glance from a top-down view.
function drawF1Body(ctx: CanvasRenderingContext2D, color: string, braking: boolean) {
  const lighter = lighten(color, 0.22);
  const darker = darken(color, 0.22);

  // Wheels first (drawn under body). Rear wheels are larger.
  drawWheel(ctx, -10, -9, 1.0);
  drawWheel(ctx,  10, -9, 0.85);
  drawWheel(ctx, -10,  9, 1.0);
  drawWheel(ctx,  10,  9, 0.85);

  // Sidepods + chassis silhouette: WIDE at the rear, tapering forward to
  // a thin nose cone that extends past the front wheels.
  ctx.beginPath();
  ctx.moveTo(-15, -6);   // rear of engine cover (left)
  ctx.lineTo(-6, -8);    // sidepod widest mid-rear (left)
  ctx.lineTo(2, -6);     // narrowing toward cockpit
  ctx.lineTo(8, -3);     // shoulder of nose cone
  ctx.lineTo(17, -1.4);  // nose tapering
  ctx.lineTo(20, 0);     // nose tip
  ctx.lineTo(17, 1.4);
  ctx.lineTo(8, 3);
  ctx.lineTo(2, 6);
  ctx.lineTo(-6, 8);
  ctx.lineTo(-15, 6);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, -8, 0, 8);
  grad.addColorStop(0, lighter);
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, darker);
  ctx.fillStyle = grad;
  ctx.fill();

  // Engine cover spine (subtle dark stripe down the back half).
  ctx.fillStyle = darker;
  ctx.beginPath();
  ctx.moveTo(-15, -2.5);
  ctx.lineTo(-2, -2);
  ctx.lineTo(0, 0);
  ctx.lineTo(-2, 2);
  ctx.lineTo(-15, 2.5);
  ctx.closePath();
  ctx.fill();

  // Cockpit + halo (positioned slightly behind centre, in front of the
  // sidepods).
  ctx.fillStyle = "#1a1f2b";
  ctx.beginPath();
  ctx.ellipse(-1, 0, 3.6, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(220, 226, 235, 0.55)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // Helmet stripe — clearly forward-of-centre on the cockpit.
  ctx.fillStyle = lighten(color, 0.45);
  ctx.fillRect(-1.5, -1, 2, 2);

  // Mirrors just ahead of cockpit shoulders.
  ctx.fillStyle = "#0d0f14";
  ctx.fillRect(2, -5.5, 1.4, 1);
  ctx.fillRect(2, 4.5, 1.4, 1);

  // Front wing — wide, sits at the very front past the nose tip.
  ctx.fillStyle = "#e8ecf3";
  roundRect(ctx, 18, -10, 4, 20, 1.2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(18, -10.5, 4, 1.5); // top endplate strip
  ctx.fillRect(18, 9, 4, 1.5);     // bottom endplate strip

  // Rear wing — narrower than the front wing so the silhouette tapers
  // visibly from rear to nose.
  ctx.fillStyle = "#1a1f2b";
  ctx.fillRect(-18.5, -7, 1.4, 14); // upright beam
  ctx.fillStyle = "#e8ecf3";
  ctx.fillRect(-17, -6, 0.8, 12);   // light upper element
  ctx.fillStyle = color;
  ctx.fillRect(-19.5, -7.5, 1.6, 3); // tiny endplate (top-left)
  ctx.fillRect(-19.5, 4.5, 1.6, 3);  // tiny endplate (bottom-left)

  // Brake light on the rear-wing centerline. Bright red with a glow when
  // the player is on the brake; dim when off so the position is still
  // visible at a glance.
  if (braking) {
    ctx.shadowColor = "rgba(255, 60, 80, 0.95)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#ff3344";
    ctx.fillRect(-17.6, -2, 1.4, 4);
    ctx.shadowBlur = 0;
  } else {
    ctx.fillStyle = "#5a1a22";
    ctx.fillRect(-17.6, -2, 1.4, 4);
  }
}

function drawWheel(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  const w = 8 * scale;     // along x (rolling direction)
  const h = 3.6 * scale;   // tyre thickness
  // Tyre
  ctx.fillStyle = "#0c0d11";
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 1.4);
  ctx.fill();
  // Sidewall highlight
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(x - w / 2 + 1, y - h / 2 + 0.4, w - 2, 0.6);
  // Hub
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
