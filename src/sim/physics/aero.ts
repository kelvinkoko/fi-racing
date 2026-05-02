import { AIR_DENSITY } from "./constants";
import type { AeroConfig } from "@/config/car";

/** Aerodynamic drag force, N. Always opposing motion (use as -drag * sign(vx)). */
export function dragForce(aero: AeroConfig, speed: number): number {
  return 0.5 * AIR_DENSITY * aero.dragArea * speed * speed;
}

/** Total downforce magnitude, N. Acts downward, increases tire normal load. */
export function downforce(aero: AeroConfig, speed: number): number {
  return 0.5 * AIR_DENSITY * aero.downforceArea * speed * speed;
}

/** Splits downforce between front and rear axles per aero balance. */
export function downforceSplit(aero: AeroConfig, speed: number): {
  front: number;
  rear: number;
} {
  const total = downforce(aero, speed);
  return {
    front: total * aero.frontBalance,
    rear: total * (1 - aero.frontBalance),
  };
}
