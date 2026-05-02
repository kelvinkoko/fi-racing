import { describe, it, expect } from "vitest";
import { runRace } from "@/sim/race/engine";
import { prepareTrack } from "@/sim/track/track";
import { makeOval } from "@/data/tracks/oval";
import { balancedCar, gripCar, powerCar } from "@/config/presets";

const trackData = makeOval();

describe("race engine", () => {
  it("is deterministic for the same seed", () => {
    const t = prepareTrack(trackData);
    const cars = [
      { id: "A", config: balancedCar("A") },
      { id: "B", config: powerCar("B") },
    ];
    const cfg = { trackId: "test-oval", laps: 1, seed: 12345, dt: 1 / 120 };
    const r1 = runRace(cars, t, cfg, { sampleHz: 30, maxTime: 300 });
    const r2 = runRace(cars, t, cfg, { sampleHz: 30, maxTime: 300 });
    expect(r1.duration).toBe(r2.duration);
    for (let i = 0; i < r1.cars.length; i++) {
      expect(r1.cars[i].samples.length).toBe(r2.cars[i].samples.length);
      const last1 = r1.cars[i].samples.at(-1)!;
      const last2 = r2.cars[i].samples.at(-1)!;
      expect(last1.x).toBe(last2.x);
      expect(last1.y).toBe(last2.y);
      expect(last1.speed).toBe(last2.speed);
    }
  });

  it("different seeds produce different outcomes (variation works)", () => {
    const t = prepareTrack(trackData);
    const cars = [
      { id: "A", config: balancedCar("A") },
      { id: "B", config: powerCar("B") },
    ];
    const r1 = runRace(cars, t, { trackId: "test-oval", laps: 1, seed: 1, dt: 1 / 120 }, { maxTime: 300 });
    const r2 = runRace(cars, t, { trackId: "test-oval", laps: 1, seed: 999, dt: 1 / 120 }, { maxTime: 300 });
    const lastA1 = r1.cars[0].samples.at(-1)!;
    const lastA2 = r2.cars[0].samples.at(-1)!;
    // Some sample should differ thanks to mistake noise.
    expect(lastA1.x !== lastA2.x || lastA1.y !== lastA2.y || lastA1.speed !== lastA2.speed).toBe(true);
  });

  it("at least one car completes a lap on the test oval", () => {
    const t = prepareTrack(trackData);
    const cars = [
      { id: "A", config: balancedCar("A") },
      { id: "B", config: powerCar("B") },
      { id: "C", config: gripCar("C") },
      { id: "D", config: balancedCar("D") },
    ];
    const rec = runRace(
      cars,
      t,
      { trackId: "test-oval", laps: 1, seed: 7, dt: 1 / 120 },
      { maxTime: 240 },
    );
    const anyFinished = rec.cars.some((c) => c.lapTimes.length >= 1);
    expect(anyFinished).toBe(true);
  });
});
