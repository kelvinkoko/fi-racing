import { LandmarkIcon } from "../game/track";

// Stylised mini-illustrations for each Fukuoka landmark. Drawn into the
// cached track art (one canvas), so there's no per-frame cost. Each
// function assumes the context has been translated to the icon's centre
// and draws the silhouette around (0, 0) within roughly a 40×40 box
// (the tower is taller).
export function drawLandmarkIcon(ctx: CanvasRenderingContext2D, type: LandmarkIcon) {
  switch (type) {
    case "station":  return drawStation(ctx);
    case "canal":    return drawCanal(ctx);
    case "nakasu":   return drawNakasu(ctx);
    case "tenjin":   return drawTenjin(ctx);
    case "ohori":    return drawOhori(ctx);
    case "castle":   return drawCastle(ctx);
    case "dome":     return drawDome(ctx);
    case "tower":    return drawTower(ctx);
    case "beach":    return drawBeach(ctx);
    case "bay":      return drawBay(ctx);
  }
}

function drawStation(ctx: CanvasRenderingContext2D) {
  // Modern train station: glass roof + colonnade + clock.
  ctx.fillStyle = "#3a4258";
  ctx.fillRect(-18, -2, 36, 16);
  ctx.fillStyle = "#5a6377";
  ctx.beginPath();
  ctx.moveTo(-20, -2);
  ctx.lineTo(0, -12);
  ctx.lineTo(20, -2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffd23f";
  ctx.beginPath();
  ctx.arc(0, -5, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(180, 220, 255, 0.55)";
  for (let i = -2; i <= 2; i++) ctx.fillRect(i * 6 - 2, 1, 4, 8);
}

function drawCanal(ctx: CanvasRenderingContext2D) {
  // Canal City: trademark wavy curved facade.
  ctx.fillStyle = "#5a3550";
  ctx.beginPath();
  ctx.moveTo(-16, 12);
  ctx.bezierCurveTo(-12, -10, -6,  -2, 0, -6);
  ctx.bezierCurveTo( 6,  -10, 12, 6, 16, -4);
  ctx.lineTo(16, 12);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#ff6b8a";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-16, 0);
  ctx.bezierCurveTo(-12, -14, -6, -6, 0, -10);
  ctx.bezierCurveTo( 6, -14, 12,  2, 16, -8);
  ctx.stroke();
}

function drawNakasu(ctx: CanvasRenderingContext2D) {
  // Yatai food stall: pitched-roof tent + paper lantern.
  ctx.fillStyle = "#5a3030";
  ctx.beginPath();
  ctx.moveTo(-13, -2);
  ctx.lineTo(0, -12);
  ctx.lineTo(13, -2);
  ctx.lineTo(13, 10);
  ctx.lineTo(-13, 10);
  ctx.closePath();
  ctx.fill();
  // Curtain stripes
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  for (let x = -10; x < 12; x += 4) ctx.fillRect(x, 0, 2, 10);
  // Lantern
  ctx.fillStyle = "#ff8030";
  ctx.beginPath();
  ctx.ellipse(0, -4, 3, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-3, -4); ctx.lineTo(3, -4);
  ctx.stroke();
}

function drawTenjin(ctx: CanvasRenderingContext2D) {
  // Cluster of department-store skyscrapers with lit windows.
  const towers = [
    { w: 8, h: 26, c: "#3a4258" },
    { w: 9, h: 32, c: "#4a5268" },
    { w: 7, h: 22, c: "#3a4258" },
    { w: 8, h: 28, c: "#4a5268" },
  ];
  let x = -16;
  for (const t of towers) {
    ctx.fillStyle = t.c;
    ctx.fillRect(x, -t.h, t.w, t.h);
    ctx.fillStyle = "rgba(255, 230, 130, 0.55)";
    for (let row = 1; row < t.h / 4; row++) {
      ctx.fillRect(x + 1, -t.h + row * 4, t.w - 2, 1.6);
    }
    x += t.w;
  }
}

function drawOhori(ctx: CanvasRenderingContext2D) {
  // Calm pond with reflective highlight + a few trees.
  ctx.fillStyle = "#3a7ca5";
  ctx.beginPath();
  ctx.ellipse(0, 2, 16, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.ellipse(-3, 0, 6, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const tx of [-14, -6, 6, 14]) {
    ctx.fillStyle = "#2a5a2a";
    ctx.beginPath();
    ctx.arc(tx, -8, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5a3a18";
    ctx.fillRect(tx - 0.6, -6, 1.2, 3);
  }
}

function drawCastle(ctx: CanvasRenderingContext2D) {
  // Japanese tenshu — stone base, two roof tiers, tiny finial.
  ctx.fillStyle = "#888";
  ctx.beginPath();
  ctx.moveTo(-15,  10);
  ctx.lineTo(-11, -2);
  ctx.lineTo( 11, -2);
  ctx.lineTo( 15,  10);
  ctx.closePath();
  ctx.fill();
  // First floor
  ctx.fillStyle = "#f0e8d8";
  ctx.fillRect(-10, -10, 20, 8);
  // Lower roof
  ctx.fillStyle = "#3a4458";
  ctx.beginPath();
  ctx.moveTo(-13, -10);
  ctx.lineTo(-8,  -16);
  ctx.lineTo( 8,  -16);
  ctx.lineTo( 13, -10);
  ctx.closePath();
  ctx.fill();
  // Top floor
  ctx.fillStyle = "#f0e8d8";
  ctx.fillRect(-7, -22, 14, 6);
  // Upper roof
  ctx.fillStyle = "#3a4458";
  ctx.beginPath();
  ctx.moveTo(-10, -22);
  ctx.lineTo(-5,  -28);
  ctx.lineTo( 5,  -28);
  ctx.lineTo( 10, -22);
  ctx.closePath();
  ctx.fill();
  // Finial
  ctx.fillStyle = "#ffd23f";
  ctx.fillRect(-0.7, -32, 1.4, 4);
}

function drawDome(ctx: CanvasRenderingContext2D) {
  // PayPay Dome — silver half-sphere on a base.
  const grad = ctx.createLinearGradient(0, -12, 0, 6);
  grad.addColorStop(0, "#cdd5e0");
  grad.addColorStop(1, "#7c8597");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 6, 17, Math.PI, 2 * Math.PI);
  ctx.closePath();
  ctx.fill();
  // Highlight
  ctx.fillStyle = "rgba(255,255,255,0.38)";
  ctx.beginPath();
  ctx.ellipse(-5, -2, 8, 4, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // Seam
  ctx.strokeStyle = "rgba(0,0,0,0.32)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(0, 6, 14, Math.PI + 0.2, 2 * Math.PI - 0.2);
  ctx.stroke();
  // Base
  ctx.fillStyle = "#5a6378";
  ctx.fillRect(-19, 6, 38, 4);
}

function drawTower(ctx: CanvasRenderingContext2D) {
  // Fukuoka Tower — tall mirrored triangular shaft + antenna.
  const grad = ctx.createLinearGradient(-6, 0, 6, 0);
  grad.addColorStop(0,    "#4a7894");
  grad.addColorStop(0.5,  "#a8d2e8");
  grad.addColorStop(1,    "#4a7894");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-4,  26);
  ctx.lineTo( 4,  26);
  ctx.lineTo( 2, -28);
  ctx.lineTo(-2, -28);
  ctx.closePath();
  ctx.fill();
  // Reflective horizontal panels
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 0.5;
  for (let i = -26; i < 26; i += 4) {
    ctx.beginPath();
    ctx.moveTo(-3, i);
    ctx.lineTo( 3, i);
    ctx.stroke();
  }
  // Antenna
  ctx.strokeStyle = "#ddd";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -28);
  ctx.lineTo(0, -38);
  ctx.stroke();
  // Base
  ctx.fillStyle = "#445566";
  ctx.fillRect(-8, 26, 16, 3);
}

function drawBeach(ctx: CanvasRenderingContext2D) {
  // Sand strip + parasol + waves.
  ctx.fillStyle = "#e8d28a";
  ctx.fillRect(-16, -2, 32, 6);
  // Parasol
  ctx.fillStyle = "#ff6b6b";
  ctx.beginPath();
  ctx.arc(-8, -2, 5, Math.PI, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(-8, -2, 2.5, Math.PI, 2 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = "#9a3030";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-8, -2);
  ctx.lineTo(-8,  4);
  ctx.stroke();
  // Waves under sand
  ctx.strokeStyle = "#3a7ca5";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -16; x < 14; x += 4) {
    ctx.moveTo(x, 8);
    ctx.quadraticCurveTo(x + 2, 6, x + 4, 8);
  }
  ctx.stroke();
}

function drawBay(ctx: CanvasRenderingContext2D) {
  // Wave lines + a tiny sailing boat.
  ctx.strokeStyle = "#5a9bc4";
  ctx.lineWidth = 1.2;
  for (const row of [-2, 2, 6]) {
    ctx.beginPath();
    for (let x = -16; x < 16; x += 4) {
      ctx.moveTo(x, row);
      ctx.quadraticCurveTo(x + 2, row - 2, x + 4, row);
    }
    ctx.stroke();
  }
  // Boat hull
  ctx.fillStyle = "#8a4a2a";
  ctx.beginPath();
  ctx.moveTo(-7, -8);
  ctx.lineTo( 7, -8);
  ctx.lineTo( 5, -4);
  ctx.lineTo(-5, -4);
  ctx.closePath();
  ctx.fill();
  // Sail
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(0,  -8);
  ctx.lineTo(0, -16);
  ctx.lineTo(5, -10);
  ctx.closePath();
  ctx.fill();
}
