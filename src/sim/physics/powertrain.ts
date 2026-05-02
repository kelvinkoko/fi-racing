// Engine + gearbox model. Auto gear selection.

import type { CarConfig } from "@/config/car";
import { RAD_S_TO_RPM, RPM_TO_RAD_S, WHEEL_RADIUS } from "./constants";

/** Convert wheel longitudinal speed (m/s) and current gear to engine RPM. */
export function engineRPM(config: CarConfig, gear: number, vx: number): number {
  if (gear < 1) return config.engine.idleRPM;
  const ratio = gearTotalRatio(config, gear);
  const wheelOmega = Math.max(0, vx) / WHEEL_RADIUS; // rad/s
  const engineOmega = wheelOmega * ratio;
  const rpm = engineOmega * RAD_S_TO_RPM;
  return Math.max(config.engine.idleRPM, Math.min(config.engine.redlineRPM, rpm));
}

export function gearTotalRatio(config: CarConfig, gear: number): number {
  const idx = Math.max(1, Math.min(config.gearbox.ratios.length, gear)) - 1;
  return config.gearbox.ratios[idx] * config.gearbox.finalDrive;
}

/** Engine torque (Nm) at a given RPM and throttle (0..1). Bell-shaped curve. */
export function engineTorque(config: CarConfig, rpm: number, throttle: number): number {
  const { peakPower, peakPowerRPM, idleRPM, redlineRPM } = config.engine;
  if (rpm >= redlineRPM) return 0; // rev limiter
  const peakTorque = peakPower / (peakPowerRPM * RPM_TO_RAD_S);
  // Normalized RPM around peak: torque shape like 1 - 0.6*(x-1)^2, clamped.
  const x = Math.max(0.1, rpm / peakPowerRPM);
  const shape = Math.max(0.1, 1 - 0.6 * (x - 1) * (x - 1));
  // Below idle, no torque (engine wouldn't be running anyway).
  const idleScale = rpm < idleRPM ? 0 : 1;
  return peakTorque * shape * idleScale * Math.max(0, Math.min(1, throttle));
}

/** Drive force at the rear-wheel contact patch, N. */
export function driveForce(config: CarConfig, gear: number, rpm: number, throttle: number): number {
  const Te = engineTorque(config, rpm, throttle);
  const ratio = gearTotalRatio(config, gear);
  return (Te * ratio * config.gearbox.efficiency) / WHEEL_RADIUS;
}

/** Auto-gear selection. Returns next gear given current state. */
export function selectGear(config: CarConfig, currentGear: number, rpm: number): number {
  const { ratios, upshiftRPM, downshiftRPM } = config.gearbox;
  const maxGear = ratios.length;
  let g = Math.max(1, Math.min(maxGear, currentGear || 1));
  if (rpm >= upshiftRPM && g < maxGear) g += 1;
  else if (rpm <= downshiftRPM && g > 1) g -= 1;
  return g;
}
