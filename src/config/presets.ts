// Starter car presets — used as defaults in the garage and as references in
// tests. Tuned to behave plausibly with the v1 physics model.

import type { CarConfig } from "./car";

export function balancedCar(name = "Balanced"): CarConfig {
  return {
    schema: 1,
    name,
    color: "#3b82f6",
    chassis: {
      mass: 740,
      inertiaZ: 1100,
      wheelbase: 3.2,
      weightDistribution: 0.46,
      cogHeight: 0.35,
      maxSteerAngle: 0.5, // ~28.6 deg
    },
    engine: {
      peakPower: 600_000, // 600 kW (~800 hp)
      peakPowerRPM: 11_500,
      idleRPM: 4_000,
      redlineRPM: 13_000,
    },
    gearbox: {
      ratios: [3.0, 2.4, 1.95, 1.6, 1.3, 1.05, 0.85, 0.7],
      finalDrive: 3.5,
      efficiency: 0.92,
      upshiftRPM: 12_500,
      downshiftRPM: 7_000,
    },
    tires: {
      compound: "medium",
      pressure: 165,
    },
    aero: {
      dragArea: 1.0,
      downforceArea: 3.5,
      frontBalance: 0.42,
    },
    brakes: {
      maxForce: 35_000,
      frontBias: 0.58,
    },
    driver: { preset: "safe" },
  };
}

export function powerCar(name = "Power"): CarConfig {
  const base = balancedCar(name);
  return {
    ...base,
    color: "#ef4444",
    engine: { ...base.engine, peakPower: 680_000 },
    aero: { ...base.aero, downforceArea: 2.8, dragArea: 0.85 },
    driver: { preset: "aggressive" },
  };
}

export function gripCar(name = "Grip"): CarConfig {
  const base = balancedCar(name);
  return {
    ...base,
    color: "#10b981",
    aero: { ...base.aero, downforceArea: 4.5, dragArea: 1.15 },
    tires: { ...base.tires, compound: "soft" },
    driver: { preset: "overtaker" },
  };
}
