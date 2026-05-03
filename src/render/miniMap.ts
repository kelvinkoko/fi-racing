import { Track } from "../game/track";

export type MiniMapProjection = {
  scale: number;
  ox: number;
  oy: number;
  width: number;
  height: number;
};

export function buildMiniMapProjection(track: Track, width: number, height: number, padding = 8): MiniMapProjection {
  const tw = track.bounds.maxX - track.bounds.minX;
  const th = track.bounds.maxY - track.bounds.minY;
  const scale = Math.min((width - padding * 2) / tw, (height - padding * 2) / th);
  const ox = (width - tw * scale) / 2 - track.bounds.minX * scale;
  const oy = (height - th * scale) / 2 - track.bounds.minY * scale;
  return { scale, ox, oy, width, height };
}

// Pre-render the static track outline to an offscreen canvas. The per-frame
// mini-map then just blits this and overlays the moving car dots.
export function buildMiniMapBackground(track: Track, proj: MiniMapProjection): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = proj.width;
  canvas.height = proj.height;
  const ctx = canvas.getContext("2d")!;

  // Track ribbon (drawn slightly thick so the racing line reads at small scale).
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(60, 70, 90, 0.95)";
  ctx.lineWidth = 6;
  drawTrackPath(ctx, track, proj);

  ctx.strokeStyle = "rgba(232, 236, 243, 0.85)";
  ctx.lineWidth = 1.6;
  drawTrackPath(ctx, track, proj);

  // Start/finish dot.
  const sx = track.startPos.x * proj.scale + proj.ox;
  const sy = track.startPos.y * proj.scale + proj.oy;
  ctx.fillStyle = "#ffd23f";
  ctx.beginPath();
  ctx.arc(sx, sy, 3, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}

function drawTrackPath(ctx: CanvasRenderingContext2D, track: Track, proj: MiniMapProjection) {
  ctx.beginPath();
  for (let i = 0; i < track.center.length; i++) {
    const p = track.center[i];
    const x = p.x * proj.scale + proj.ox;
    const y = p.y * proj.scale + proj.oy;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
}

export type MiniDot = {
  x: number;
  y: number;
  color: string;
  isLocal: boolean;
  desloted: boolean;
};

export function drawMiniMap(
  ctx: CanvasRenderingContext2D,
  bg: HTMLCanvasElement,
  proj: MiniMapProjection,
  dots: MiniDot[]
) {
  ctx.clearRect(0, 0, proj.width, proj.height);
  ctx.drawImage(bg, 0, 0);
  for (const d of dots) {
    const x = d.x * proj.scale + proj.ox;
    const y = d.y * proj.scale + proj.oy;
    if (d.desloted) ctx.globalAlpha = 0.5;
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(x, y, d.isLocal ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
    if (d.isLocal) {
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
