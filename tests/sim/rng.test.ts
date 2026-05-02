import { describe, it, expect } from "vitest";
import { createRng } from "@/sim/race/rng";

describe("rng", () => {
  it("produces the same stream for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 1000; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("produces different streams for different seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    let differs = 0;
    for (let i = 0; i < 100; i++) {
      if (a.next() !== b.next()) differs++;
    }
    expect(differs).toBeGreaterThan(90);
  });

  it("forks produce independent but reproducible streams", () => {
    const parentA = createRng(7);
    const parentB = createRng(7);
    const a1 = parentA.fork(1);
    const b1 = parentB.fork(1);
    for (let i = 0; i < 100; i++) {
      expect(a1.next()).toBe(b1.next());
    }
  });

  it("gaussian has approximately zero mean and unit variance", () => {
    const r = createRng(123);
    const N = 5000;
    let sum = 0;
    let sum2 = 0;
    for (let i = 0; i < N; i++) {
      const v = r.gaussian();
      sum += v;
      sum2 += v * v;
    }
    const mean = sum / N;
    const variance = sum2 / N - mean * mean;
    expect(Math.abs(mean)).toBeLessThan(0.1);
    expect(Math.abs(variance - 1)).toBeLessThan(0.1);
  });

  it("range respects bounds", () => {
    const r = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = r.range(-3, 5);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(5);
    }
  });
});
