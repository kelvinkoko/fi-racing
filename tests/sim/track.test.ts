import { describe, it, expect } from "vitest";
import { prepareTrack, projectToCenterline, racingLinePointAt } from "@/sim/track/track";
import { makeOval } from "@/data/tracks/oval";

describe("track", () => {
  it("computes a positive lap length", () => {
    const t = prepareTrack(makeOval());
    expect(t.lapLength).toBeGreaterThan(100);
  });

  it("projects a known point near the centerline correctly", () => {
    const t = prepareTrack(makeOval());
    const p = t.data.centerline[5];
    const r = projectToCenterline(t, { x: p.x + 0.1, y: p.y });
    expect(r.dist).toBeLessThan(0.5);
  });

  it("racing line lookup wraps cleanly", () => {
    const t = prepareTrack(makeOval());
    const p1 = racingLinePointAt(t, 0);
    const p2 = racingLinePointAt(t, t.racingLineLength);
    expect(p2.x).toBeCloseTo(p1.x, 5);
    expect(p2.y).toBeCloseTo(p1.y, 5);
  });
});
