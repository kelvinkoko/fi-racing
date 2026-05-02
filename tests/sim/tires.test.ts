import { describe, it, expect } from "vitest";
import {
  applyFrictionCircle,
  effectiveMu,
  lateralForcePure,
  longitudinalCapacity,
} from "@/sim/physics/tires";

const tires = { compound: "medium", pressure: 165 } as const;

describe("tires", () => {
  it("zero slip yields zero lateral force", () => {
    const Fy = lateralForcePure(tires, 0, 5000, 0, 350);
    expect(Math.abs(Fy)).toBeLessThan(1e-6);
  });

  it("lateral force opposes slip angle and scales with load", () => {
    const FySmall = lateralForcePure(tires, 0.05, 2000, 0, 350);
    const FyLarge = lateralForcePure(tires, 0.05, 4000, 0, 350);
    expect(FySmall).toBeLessThan(0); // positive slip -> negative force
    expect(Math.abs(FyLarge)).toBeGreaterThan(Math.abs(FySmall));
  });

  it("lateral force saturates near peak grip", () => {
    const Fz = 5000;
    const cap = longitudinalCapacity(tires, Fz, 0, 350);
    // At very high slip, |Fy| should approach mu*Fz from below.
    const Fy = Math.abs(lateralForcePure(tires, 1.0, Fz, 0, 350));
    expect(Fy).toBeLessThanOrEqual(cap + 1e-6);
    expect(Fy).toBeGreaterThan(cap * 0.5);
  });

  it("wear reduces effective grip", () => {
    const fresh = effectiveMu(tires, 0, 360);
    const worn = effectiveMu(tires, 1, 360);
    expect(worn).toBeLessThan(fresh);
  });

  it("friction circle bounds total force magnitude", () => {
    const Fmax = 4000;
    const out = applyFrictionCircle(3000, 3000, Fmax);
    const mag = Math.hypot(out.Fx, out.Fy);
    expect(mag).toBeLessThanOrEqual(Fmax + 1e-6);
  });

  it("friction circle preserves lateral up to Fmax, then trims longitudinal", () => {
    const out = applyFrictionCircle(100, 5000, 4000);
    expect(Math.abs(out.Fy)).toBeCloseTo(4000, 6);
    expect(out.Fx).toBeCloseTo(0, 6);
  });
});
