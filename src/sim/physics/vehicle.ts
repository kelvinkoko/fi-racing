// Bicycle model with weight transfer, simplified Pacejka tires, aero, and
// rear-wheel drive. Integrated with semi-implicit Euler at fixed dt.
//
// Body frame convention: vx forward, vy left (math-positive), yaw psi CCW from +x.
// Steering input s in [-1, 1]: positive turns the steered wheel "to the left"
// in body frame (so the car yaws CCW). Driver UI inverts as needed.

import type { CarState } from "../race/state";
import { G } from "./constants";
import { dragForce, downforceSplit } from "./aero";
import {
  applyFrictionCircle,
  lateralForcePure,
  longitudinalCapacity,
  updateTireState,
} from "./tires";
import { driveForce, engineRPM, selectGear } from "./powertrain";

export interface DriverInputs {
  throttle: number; // 0..1
  brake: number; // 0..1
  steering: number; // -1..1
}

/** Step a single car forward by dt seconds. Mutates the passed state. */
export function stepVehicle(state: CarState, inputs: DriverInputs, dt: number): void {
  const c = state.config;
  const chassis = c.chassis;

  // ---- Sanitize inputs ----
  const throttle = clamp01(inputs.throttle);
  const brake = clamp01(inputs.brake);
  const steerInput = clamp(inputs.steering, -1, 1);
  const delta = steerInput * chassis.maxSteerAngle; // rad at steered wheel

  // ---- Geometry ----
  const L = chassis.wheelbase;
  const a = L * chassis.weightDistribution; // CoG to front axle
  const b = L - a; // CoG to rear axle

  // ---- Body-frame velocity ----
  const vx = state.velocity.x;
  const vy = state.velocity.y;
  const r = state.yawRate;

  // ---- Aero ----
  const drag = dragForce(c.aero, vx);
  const df = downforceSplit(c.aero, Math.abs(vx));

  // ---- Longitudinal demands (computed first so we can estimate weight
  // transfer before clamping forces by axle grip) ----
  const rpmNow = engineRPM(c, state.gear, vx);
  const newGear = selectGear(c, state.gear, rpmNow);
  const rpm = engineRPM(c, newGear, vx);

  const Fdrive_demand = driveForce(c, newGear, rpm, throttle);
  const Fbrake_total = c.brakes.maxForce * brake;
  const Fbrake_f = Fbrake_total * c.brakes.frontBias;
  const Fbrake_r = Fbrake_total * (1 - c.brakes.frontBias);

  // Engine braking when off throttle: small drag through the drivetrain.
  const Feng_brake = throttle < 0.05 && newGear >= 1 ? Math.min(800, 12 * rpm * 0.001) : 0;

  const Fx_f_demand = -Math.sign(vx || 1) * Fbrake_f;
  const Fx_r_demand =
    Fdrive_demand - Math.sign(vx || 1) * Fbrake_r - Math.sign(vx || 1) * Feng_brake;

  // Estimate longitudinal acceleration ignoring grip & lateral coupling, just
  // to get a weight-transfer estimate. Drag included.
  const Fx_demand_total = Fx_f_demand + Fx_r_demand - drag * Math.sign(vx || 1);
  const ax_est = Fx_demand_total / chassis.mass;

  // ---- Normal loads with weight transfer + aero downforce ----
  const dFz = (chassis.mass * ax_est * chassis.cogHeight) / L;
  const Fz_f = Math.max(0, (chassis.mass * G * b) / L + df.front - dFz);
  const Fz_r = Math.max(0, (chassis.mass * G * a) / L + df.rear + dFz);

  // ---- Slip angles (guard low speed) ----
  const vxSafe = Math.max(2.0, Math.abs(vx)) * Math.sign(vx || 1);
  const alpha_f = Math.atan2(vy + a * r, Math.abs(vxSafe)) - delta;
  const alpha_r = Math.atan2(vy - b * r, Math.abs(vxSafe));

  // ---- Lateral forces (pure) ----
  const Fy_f_pure = lateralForcePure(c.tires, alpha_f, Fz_f, state.tireWearFront, state.tireTempFront);
  const Fy_r_pure = lateralForcePure(c.tires, alpha_r, Fz_r, state.tireWearRear, state.tireTempRear);

  // ---- Friction-circle clamp per axle (using transferred Fz) ----
  const muF_cap = longitudinalCapacity(c.tires, Fz_f, state.tireWearFront, state.tireTempFront);
  const muR_cap = longitudinalCapacity(c.tires, Fz_r, state.tireWearRear, state.tireTempRear);

  const front = applyFrictionCircle(Fx_f_demand, Fy_f_pure, muF_cap);
  const rear = applyFrictionCircle(Fx_r_demand, Fy_r_pure, muR_cap);

  // Project front-axle force into body frame through steering angle.
  const cosD = Math.cos(delta);
  const sinD = Math.sin(delta);
  const Fxf_body = front.Fx * cosD - front.Fy * sinD;
  const Fyf_body = front.Fx * sinD + front.Fy * cosD;
  const Fxr_body = rear.Fx;
  const Fyr_body = rear.Fy;

  // Net body-frame forces.
  const Fx_total = Fxf_body + Fxr_body - drag * Math.sign(vx || 1);
  const Fy_total = Fyf_body + Fyr_body;

  // ---- Accelerations ----
  const ax = Fx_total / chassis.mass + vy * r;
  const ay = Fy_total / chassis.mass - vx * r;
  const yawAccel = (a * Fyf_body - b * Fyr_body) / chassis.inertiaZ;

  // ---- Integrate (semi-implicit Euler) ----
  let vx_new = vx + ax * dt;
  let vy_new = vy + ay * dt;
  const r_new = r + yawAccel * dt;

  // Prevent reversing past zero from braking alone in v1.
  if (vx > 0 && vx_new < 0 && throttle < 0.05) vx_new = 0;

  // Update world position from body velocity rotated by current heading.
  const cosP = Math.cos(state.heading);
  const sinP = Math.sin(state.heading);
  const dx = (vx_new * cosP - vy_new * sinP) * dt;
  const dy = (vx_new * sinP + vy_new * cosP) * dt;
  state.position.x += dx;
  state.position.y += dy;
  state.heading = wrapAngle(state.heading + r_new * dt);
  state.velocity.x = vx_new;
  state.velocity.y = vy_new;
  state.yawRate = r_new;
  state.gear = newGear;
  state.engineRPM = rpm;

  // ---- Tire wear/temp update ----
  const slipF = Math.abs(alpha_f);
  const slipR = Math.abs(alpha_r);
  const forceF = Math.hypot(front.Fx, front.Fy);
  const forceR = Math.hypot(rear.Fx, rear.Fy);
  const speedAbs = Math.max(0.1, Math.abs(vx_new));
  const f = updateTireState(c.tires, state.tireWearFront, state.tireTempFront, slipF, forceF, speedAbs, dt);
  const rT = updateTireState(c.tires, state.tireWearRear, state.tireTempRear, slipR, forceR, speedAbs, dt);
  state.tireWearFront = f.wear;
  state.tireTempFront = f.tempK;
  state.tireWearRear = rT.wear;
  state.tireTempRear = rT.tempK;

  state.inputThrottle = throttle;
  state.inputBrake = brake;
  state.inputSteering = steerInput;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

/** Wrap angle to (-pi, pi]. */
export function wrapAngle(a: number): number {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x <= -Math.PI) x += 2 * Math.PI;
  return x;
}
