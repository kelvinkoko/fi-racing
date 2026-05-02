// Racing-line follower with pure-pursuit steering and speed-target longitudinal
// control. M1 has no overtake/defend logic — cars follow the line and slow if
// they would rear-end the car ahead. Tactics layer comes in M3.5/post-v1.

import type { CarState } from "../race/state";
import type { PreparedTrack } from "../track/track";
import { projectToRacingLine, racingLinePointAt } from "../track/track";
import type { DriverInputs } from "../physics/vehicle";
import { resolveWeights } from "./presets";
import type { Rng } from "../race/rng";
import { wrapAngle } from "../physics/vehicle";

export interface DriverContext {
  track: PreparedTrack;
  rng: Rng;
  /** Optional: cars in front to avoid rear-ending. */
  carAheadDistance?: number;
}

/** Compute driver inputs for the next tick. */
export function decideInputs(state: CarState, ctx: DriverContext): DriverInputs {
  const w = resolveWeights(state.config.driver.preset, state.config.driver.weights);
  const speed = Math.max(0, state.velocity.x);

  // Lookahead distance scales with speed. Floor for low-speed stability.
  const lookahead = Math.max(6, speed * 0.35);

  // Project to racing line, then look ahead by `lookahead` meters.
  const { s: sNow } = projectToRacingLine(ctx.track, state.position);
  const target = racingLinePointAt(ctx.track, sNow + lookahead);

  // ---- Pure-pursuit steering ----
  // Vector from car to target in world frame.
  const dx = target.x - state.position.x;
  const dy = target.y - state.position.y;
  // Convert to body frame (rotate by -heading).
  const cosP = Math.cos(state.heading);
  const sinP = Math.sin(state.heading);
  const xb = dx * cosP + dy * sinP;
  const yb = -dx * sinP + dy * cosP;
  // Pure pursuit curvature: kappa = 2*y / L^2  (where L is lookahead distance)
  const Ld = Math.max(1, Math.hypot(xb, yb));
  const kappa = (2 * yb) / (Ld * Ld);
  // Convert curvature to required steering angle via bicycle: delta = atan(kappa * wheelbase)
  const wb = state.config.chassis.wheelbase;
  const desiredDelta = Math.atan(kappa * wb);
  // Map back to steering input in [-1, 1]. Both conventions are
  // "positive = left/CCW" so no sign flip is needed.
  const maxDelta = state.config.chassis.maxSteerAngle;
  let steering = clamp(desiredDelta / maxDelta, -1, 1) * w.steeringGain;
  steering = clamp(steering, -1, 1);

  // ---- Speed control ----
  // Target speed: blend racing line target with margin. Cornering margin scales
  // how close we run to the line's vTarget (which is the limit).
  const vTargetEff = target.vTarget * (0.6 + 0.4 * w.corneringMargin);

  // If a car is close ahead, cap target speed.
  let vCap = vTargetEff;
  if (ctx.carAheadDistance != null) {
    const gap = ctx.carAheadDistance;
    if (gap < 30) {
      // Match speed (approx), with a brake-bias if very close.
      const matchFactor = Math.max(0.4, gap / 30);
      vCap = Math.min(vCap, speed * matchFactor + 5);
    }
  }

  // Also brake earlier if far below vTarget at a point coming up — i.e. the
  // upcoming required speed at the racing line. Sample a bit further ahead.
  const brakeLookahead = Math.max(15, speed * speed * (1 - w.brakingMargin) * 0.05 + speed * 0.6);
  const futurePoint = racingLinePointAt(ctx.track, sNow + brakeLookahead);
  const vFuture = futurePoint.vTarget * (0.7 + 0.3 * w.corneringMargin);

  let throttle = 0;
  let brake = 0;
  const err = vCap - speed;
  if (err > 1) {
    throttle = clamp(err / 5, 0, 1);
  } else if (err < -1) {
    brake = clamp(-err / 8, 0, 1);
  }
  // Override with future-point braking if we'd otherwise blow it.
  if (vFuture < speed - 2) {
    const want = clamp((speed - vFuture) / 10, 0, 1);
    if (want > brake) {
      brake = want;
      throttle = 0;
    }
  }

  // Heading-vs-track misalignment kills throttle a bit (don't accelerate while
  // pointing wildly off line — keeps the car stable in tight corners).
  const headingErr = Math.abs(wrapAngle(Math.atan2(dy, dx) - state.heading));
  if (headingErr > 0.5) {
    throttle *= Math.max(0.2, 1 - (headingErr - 0.5));
  }

  // ---- Mistake noise (seeded) ----
  if (w.mistakeRate > 0) {
    steering += ctx.rng.gaussian() * w.mistakeRate * 0.3;
    throttle += ctx.rng.gaussian() * w.mistakeRate * 0.5;
    brake += ctx.rng.gaussian() * w.mistakeRate * 0.2;
  }

  return {
    throttle: clamp(throttle, 0, 1),
    brake: clamp(brake, 0, 1),
    steering: clamp(steering, -1, 1),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
