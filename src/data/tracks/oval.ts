// A simple stadium oval used as the M1 test track. Generated programmatically
// so we don't ship a verbose JSON for development. Real v1 tracks (M6) live as
// hand-authored JSON files.

import type { TrackData } from "@/sim/track/track";

export function makeOval(): TrackData {
  const straight = 240; // m
  const radius = 80; // m
  const cx1 = -straight / 2;
  const cx2 = straight / 2;
  const cy = 0;

  const centerline: { x: number; y: number }[] = [];
  const racingLine: { x: number; y: number; vTarget: number }[] = [];

  // Lower straight, left -> right.
  const straightSamples = 16;
  for (let i = 0; i < straightSamples; i++) {
    const t = i / straightSamples;
    const x = cx1 + straight * t;
    centerline.push({ x, y: -radius });
    racingLine.push({ x, y: -radius + 2, vTarget: 85 });
  }

  // Right semicircle, bottom -> top, CCW around (cx2, cy).
  const arcSamples = 24;
  for (let i = 0; i < arcSamples; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / arcSamples;
    centerline.push({ x: cx2 + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
    // Racing line cuts the apex (smaller effective radius).
    const rRL = radius - 4;
    racingLine.push({
      x: cx2 + rRL * Math.cos(a),
      y: cy + rRL * Math.sin(a),
      vTarget: 38, // m/s ~ 137 km/h corner
    });
  }

  // Upper straight, right -> left.
  for (let i = 0; i < straightSamples; i++) {
    const t = i / straightSamples;
    const x = cx2 - straight * t;
    centerline.push({ x, y: radius });
    racingLine.push({ x, y: radius - 2, vTarget: 85 });
  }

  // Left semicircle, top -> bottom, CCW around (cx1, cy).
  for (let i = 0; i < arcSamples; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / arcSamples;
    centerline.push({ x: cx1 + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
    const rRL = radius - 4;
    racingLine.push({
      x: cx1 + rRL * Math.cos(a),
      y: cy + rRL * Math.sin(a),
      vTarget: 38,
    });
  }

  // Start grid: 4 cars, on the lower straight, staggered.
  const startGrid = [0, 1, 2, 3].map((i) => ({
    position: { x: cx1 + 30 + i * 8, y: -radius + (i % 2 === 0 ? 2.5 : -2.5) },
    heading: 0, // facing +x
  }));

  return {
    schema: 1,
    id: "test-oval",
    name: "Test Oval",
    width: 14,
    centerline,
    racingLine,
    startGrid,
    startLineIndex: 0,
  };
}
