import { describe, it, expect } from "vitest";
import { stepVehicle } from "@/sim/physics/vehicle";
import type { CarState } from "@/sim/race/state";
import { balancedCar } from "@/config/presets";

function freshState(): CarState {
  const cfg = balancedCar();
  return {
    id: "test",
    config: cfg,
    position: { x: 0, y: 0 },
    heading: 0,
    velocity: { x: 0, y: 0 },
    yawRate: 0,
    gear: 1,
    engineRPM: cfg.engine.idleRPM,
    tireWearFront: 0,
    tireWearRear: 0,
    tireTempFront: 320,
    tireTempRear: 320,
    inputThrottle: 0,
    inputBrake: 0,
    inputSteering: 0,
    lap: 0,
    lapDistance: 0,
    totalDistance: 0,
    finished: false,
  };
}

describe("vehicle dynamics", () => {
  it("car accelerates from rest under full throttle", () => {
    const s = freshState();
    const dt = 1 / 120;
    for (let i = 0; i < 120; i++) {
      stepVehicle(s, { throttle: 1, brake: 0, steering: 0 }, dt);
    }
    // After 1s of full throttle from rest, grip-limited launch ~5-7 m/s.
    expect(s.velocity.x).toBeGreaterThan(5);
    expect(s.position.x).toBeGreaterThan(2);
    expect(Math.abs(s.position.y)).toBeLessThan(0.1); // straight line
  });

  it("car brakes from speed", () => {
    const s = freshState();
    const dt = 1 / 120;
    // Spin up.
    for (let i = 0; i < 600; i++) stepVehicle(s, { throttle: 1, brake: 0, steering: 0 }, dt);
    const v0 = s.velocity.x;
    // Brake.
    for (let i = 0; i < 240; i++) stepVehicle(s, { throttle: 0, brake: 1, steering: 0 }, dt);
    expect(s.velocity.x).toBeLessThan(v0 - 10);
  });

  it("reaches a terminal velocity under sustained throttle (drag balance)", () => {
    const s = freshState();
    const dt = 1 / 120;
    for (let i = 0; i < 30 * 120; i++) {
      stepVehicle(s, { throttle: 1, brake: 0, steering: 0 }, dt);
    }
    // Should not run away; balanced car has finite top speed in low 100s m/s.
    expect(s.velocity.x).toBeGreaterThan(50);
    expect(s.velocity.x).toBeLessThan(150);
  });

  it("steering input induces yaw and curved path", () => {
    const s = freshState();
    const dt = 1 / 120;
    // Get rolling.
    for (let i = 0; i < 240; i++) stepVehicle(s, { throttle: 0.5, brake: 0, steering: 0 }, dt);
    const headingBefore = s.heading;
    // Steer left for 1s.
    for (let i = 0; i < 120; i++) stepVehicle(s, { throttle: 0.5, brake: 0, steering: -0.5 }, dt);
    expect(s.heading).not.toBeCloseTo(headingBefore, 2);
    expect(Math.abs(s.position.y)).toBeGreaterThan(0.5);
  });

  it("upshifts as RPM rises", () => {
    const s = freshState();
    const dt = 1 / 120;
    const startGear = s.gear;
    for (let i = 0; i < 1500; i++) stepVehicle(s, { throttle: 1, brake: 0, steering: 0 }, dt);
    expect(s.gear).toBeGreaterThan(startGear);
  });
});
