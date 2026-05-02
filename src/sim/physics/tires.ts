// Simplified Pacejka-style lateral force from slip angle, with combined-slip
// friction circle for longitudinal coupling. Good enough to exhibit
// understeer/oversteer, grip-limited cornering, and trail braking effects.

import type { TireConfig, TireCompound } from "@/config/car";

interface CompoundParams {
  /** Peak friction coefficient, dry asphalt. */
  muPeak: number;
  /** Pacejka-like stiffness factor B (rad^-1). */
  B: number;
  /** Pacejka-like shape factor C. */
  C: number;
  /** Wear rate per meter of slip distance, normalized. */
  wearRate: number;
  /** Optimal operating temp, K. */
  tempOpt: number;
}

const COMPOUNDS: Record<TireCompound, CompoundParams> = {
  soft: { muPeak: 1.55, B: 12, C: 1.45, wearRate: 1.0, tempOpt: 363 }, // 90C
  medium: { muPeak: 1.4, B: 11, C: 1.45, wearRate: 0.55, tempOpt: 368 },
  hard: { muPeak: 1.25, B: 10, C: 1.45, wearRate: 0.3, tempOpt: 373 },
};

/** Effective friction coefficient given wear and temperature. */
export function effectiveMu(
  tires: TireConfig,
  wear: number,
  tempK: number,
): number {
  const c = COMPOUNDS[tires.compound];
  // Wear: linear falloff up to ~30% loss when fully worn.
  const wearFactor = 1 - 0.3 * Math.max(0, Math.min(1, wear));
  // Temp: gentle quadratic falloff away from optimum, floored at 75% so
  // cold tires hurt without disabling the car at race start.
  const dT = (tempK - c.tempOpt) / 50;
  const tempFactor = Math.max(0.75, 1 - dT * dT);
  // Pressure: ignore in v1 (could add nominal-pressure penalty later).
  return c.muPeak * wearFactor * tempFactor;
}

/** Pure lateral force from slip angle (rad), normal load Fz (N). Sign: positive
 *  slip angle (slipping right relative to heading) yields negative force. */
export function lateralForcePure(
  tires: TireConfig,
  slipAngle: number,
  Fz: number,
  wear: number,
  tempK: number,
): number {
  if (Fz <= 0) return 0;
  const c = COMPOUNDS[tires.compound];
  const mu = effectiveMu(tires, wear, tempK);
  const D = mu * Fz;
  // Fy = -D sin(C atan(B α))  — restoring force opposes slip.
  return -D * Math.sin(c.C * Math.atan(c.B * slipAngle));
}

/** Maximum longitudinal grip available, N. */
export function longitudinalCapacity(
  tires: TireConfig,
  Fz: number,
  wear: number,
  tempK: number,
): number {
  return effectiveMu(tires, wear, tempK) * Math.max(0, Fz);
}

/** Apply friction-circle limit to a (Fx, Fy) demand at one axle.
 *  Lateral is preserved when possible; longitudinal is reduced first. */
export function applyFrictionCircle(
  Fx: number,
  Fy: number,
  Fmax: number,
): { Fx: number; Fy: number } {
  if (Fmax <= 0) return { Fx: 0, Fy: 0 };
  const FyAbs = Math.min(Math.abs(Fy), Fmax);
  const Fy2 = Math.sign(Fy) * FyAbs;
  const FxRoom = Math.sqrt(Math.max(0, Fmax * Fmax - Fy2 * Fy2));
  const Fx2 = Math.max(-FxRoom, Math.min(FxRoom, Fx));
  return { Fx: Fx2, Fy: Fy2 };
}

/** Update tire wear and temperature from this tick's loads.
 *  Coarse model: wear from slip + load, temp toward equilibrium based on work. */
export function updateTireState(
  tires: TireConfig,
  prevWear: number,
  prevTempK: number,
  slipMag: number,
  forceMag: number,
  speed: number,
  dt: number,
): { wear: number; tempK: number } {
  const c = COMPOUNDS[tires.compound];
  // Slip distance (m) this tick is roughly slipMag * speed * dt for small angles.
  const slipDist = Math.abs(slipMag) * Math.max(0.1, speed) * dt;
  const dWear = c.wearRate * 1e-5 * slipDist * (forceMag / 5000);
  const wear = Math.min(1, prevWear + dWear);

  // Heating from frictional work; cooling toward ambient (assume 300K).
  const work = forceMag * Math.abs(slipMag) * speed * dt; // J
  const heatGain = work * 1e-4; // K per J, tuned
  const ambient = 300;
  const cooling = (prevTempK - ambient) * 0.02 * dt;
  const tempK = prevTempK + heatGain - cooling;

  return { wear, tempK };
}

export const _internal = { COMPOUNDS };
