// Core simulation types. SI units everywhere internally
// (kg, m, N, m/s, rad, s, K). Convert at UI boundary.

import type { CarConfig } from "@/config/car";

export interface Vec2 {
  x: number;
  y: number;
}

// Body-frame velocity: vx forward (+), vy left (+ in standard math frame).
// Yaw psi measured CCW from +x axis (radians).
export interface CarState {
  id: string;
  config: CarConfig;

  position: Vec2; // world frame, meters
  heading: number; // psi, radians
  velocity: Vec2; // body frame, m/s
  yawRate: number; // r, rad/s

  // Drivetrain
  gear: number; // 1..N (0 = neutral, -1 = reverse, unused in v1)
  engineRPM: number;

  // Tires (per axle for bicycle model)
  tireWearFront: number; // 0..1, 0 = fresh
  tireWearRear: number;
  tireTempFront: number; // K
  tireTempRear: number;

  // Driver inputs applied last tick (0..1, steering -1..1)
  inputThrottle: number;
  inputBrake: number;
  inputSteering: number; // [-1, 1]; positive = left (CCW yaw)

  // Race progress
  lap: number;
  lapDistance: number; // arc-length along centerline this lap, meters
  totalDistance: number; // cumulative arc-length across all laps
  finished: boolean;
  retirementReason?: string;
}

export interface RaceConfig {
  trackId: string;
  laps: number;
  seed: number;
  /** Simulation timestep in seconds (fixed). 1/120 default. */
  dt: number;
}

export interface RaceState {
  tick: number; // monotonic since start
  time: number; // tick * dt, seconds
  cars: CarState[];
  finished: boolean;
}
