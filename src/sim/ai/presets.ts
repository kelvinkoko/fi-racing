import type { DriverPreset, DriverWeights } from "@/config/car";

export const DRIVER_PRESETS: Record<DriverPreset, DriverWeights> = {
  safe: {
    corneringMargin: 0.85,
    brakingMargin: 0.85,
    steeringGain: 1.0,
    mistakeRate: 0.005,
  },
  aggressive: {
    corneringMargin: 0.98,
    brakingMargin: 0.96,
    steeringGain: 1.3,
    mistakeRate: 0.02,
  },
  overtaker: {
    corneringMargin: 0.93,
    brakingMargin: 0.92,
    steeringGain: 1.15,
    mistakeRate: 0.012,
  },
};

export function resolveWeights(preset: DriverPreset, override?: Partial<DriverWeights>): DriverWeights {
  return { ...DRIVER_PRESETS[preset], ...(override ?? {}) };
}
