import { SIM_DT } from "./constants";
import { NUM_LANES, sampleAtProgress, Track } from "./track";
import { Vec2 } from "./spline";

export const SLOT = {
  accel: 320,            // px/s^2 at full throttle
  brake: 600,            // F1 carbon brakes - ferocious
  drag: 0.55,            // exponential drag coefficient (per second)
  rollingFriction: 35,
  topSpeed: 420,         // ≈ 302 km/h with PX_PER_METER = 5
  // Maximum lateral g the slot tolerates before flying off. Smaller =
  // grippier. Tuned so most corners on this circuit demand braking from
  // top speed.
  maxCentripetal: 1900,
  warnRatio: 0.7,
  laneSwitchRate: 1.4,
  deslotDuration: 2.4,
  respawnSpeed: 50,
};

// 1 sim pixel ≈ 0.2 metres (5 px per metre). Lets the HUD show speeds in
// km/h that map roughly onto F1-scale numbers.
export const PX_PER_METER = 5;
export const KMH_PER_PX_S = 3.6 / PX_PER_METER; // 0.72

export type CarInput = {
  throttle: number; // 0..1
  brake: number;    // 0..1
  desiredLane: number; // 0..NUM_LANES-1 (clamped)
};

export type Car = {
  id: string;
  name: string;
  color: string;
  // Authoritative state
  progress: number;       // 0..1 around track
  speed: number;          // px / s along the lane
  laneCurrent: number;    // smooth lane (float)
  laneTarget: number;     // discrete int 0..NUM_LANES-1
  desloted: boolean;
  deslotTimer: number;    // remaining seconds in deslot
  deslotPos: Vec2;
  deslotVel: Vec2;
  deslotAngle: number;
  deslotSpin: number;     // angular velocity rad/s
  // Cached visual state (recomputed each step from authoritative state)
  pos: Vec2;
  angle: number;
  // Pose at the previous fixed-timestep tick — used to interpolate render
  // pose between sim ticks so motion stays smooth on high-refresh displays.
  prevPos: Vec2;
  prevAngle: number;
  curvature: number;      // signed curvature at current progress
  warning: boolean;       // close to deslot, warn HUD
  input: CarInput;
};

export function emptyInput(): CarInput {
  return { throttle: 0, brake: 0, desiredLane: 1 };
}

export function createSlotCar(seed: {
  id: string; name: string; color: string;
  progress: number; lane: number;
}, track: Track): Car {
  const sample = sampleAtProgress(track, seed.progress, seed.lane);
  return {
    id: seed.id,
    name: seed.name,
    color: seed.color,
    progress: seed.progress,
    speed: 0,
    laneCurrent: seed.lane,
    laneTarget: seed.lane,
    desloted: false,
    deslotTimer: 0,
    deslotPos: { x: sample.pos.x, y: sample.pos.y },
    deslotVel: { x: 0, y: 0 },
    deslotAngle: sample.angle,
    deslotSpin: 0,
    pos: { x: sample.pos.x, y: sample.pos.y },
    angle: sample.angle,
    prevPos: { x: sample.pos.x, y: sample.pos.y },
    prevAngle: sample.angle,
    curvature: sample.curvature,
    warning: false,
    input: emptyInput(),
  };
}

export function stepCar(car: Car, track: Track) {
  const dt = SIM_DT;
  const input = car.input;
  // Snapshot the pose entering this tick for render-time interpolation.
  car.prevPos.x = car.pos.x;
  car.prevPos.y = car.pos.y;
  car.prevAngle = car.angle;

  if (car.desloted) {
    // Free-body drift after flying off, then respawn on the lane.
    car.deslotVel = {
      x: car.deslotVel.x * Math.exp(-1.4 * dt),
      y: car.deslotVel.y * Math.exp(-1.4 * dt)
    };
    car.deslotPos = {
      x: car.deslotPos.x + car.deslotVel.x * dt,
      y: car.deslotPos.y + car.deslotVel.y * dt
    };
    car.deslotAngle += car.deslotSpin * dt;
    car.deslotSpin *= Math.exp(-1.0 * dt);
    car.pos = car.deslotPos;
    car.angle = car.deslotAngle;
    car.warning = false;

    car.deslotTimer -= dt;
    if (car.deslotTimer <= 0) {
      car.desloted = false;
      car.speed = SLOT.respawnSpeed;
      car.laneCurrent = car.laneTarget;
      const sample = sampleAtProgress(track, car.progress, car.laneCurrent);
      car.pos = { x: sample.pos.x, y: sample.pos.y };
      car.angle = sample.angle;
      car.curvature = sample.curvature;
    }
    return;
  }

  // ---- On-rails sim ----

  // Throttle / brake.
  let accel = SLOT.accel * input.throttle;
  if (input.brake > 0) accel -= SLOT.brake * input.brake;
  // Always-on rolling friction at low throttle.
  if (input.throttle < 0.05 && input.brake === 0) {
    accel -= Math.min(SLOT.rollingFriction, car.speed / Math.max(dt, 1e-3));
  }

  let v = car.speed + accel * dt;
  // Drag (proportional to speed).
  v -= v * SLOT.drag * dt;
  if (v < 0) v = 0;
  if (v > SLOT.topSpeed) v = SLOT.topSpeed;
  car.speed = v;

  // Lane lerp.
  const desired = clampLane(input.desiredLane);
  car.laneTarget = desired;
  const ld = car.laneTarget - car.laneCurrent;
  if (Math.abs(ld) > 1e-4) {
    const stepSize = Math.sign(ld) * Math.min(Math.abs(ld), SLOT.laneSwitchRate * dt);
    car.laneCurrent += stepSize;
  }

  // Advance progress (arc length per second / total length).
  car.progress = (car.progress + (v * dt) / track.totalLength + 1) % 1;

  // Sample world pose.
  const sample = sampleAtProgress(track, car.progress, car.laneCurrent);
  car.pos = { x: sample.pos.x, y: sample.pos.y };
  car.angle = sample.angle;
  car.curvature = sample.curvature;

  // Centripetal check — too fast for the corner = deslot.
  const k = Math.abs(sample.curvature);
  const centripetal = v * v * k;
  car.warning = centripetal > SLOT.maxCentripetal * SLOT.warnRatio;
  if (centripetal > SLOT.maxCentripetal) {
    triggerDeslot(car, sample, k, sample.curvature >= 0 ? -1 : 1);
  }
}

function triggerDeslot(car: Car, sample: { pos: Vec2; angle: number }, _k: number, outwardSign: number) {
  car.desloted = true;
  car.deslotTimer = SLOT.deslotDuration;
  // Forward direction at the moment of deslot.
  const fx = Math.cos(sample.angle);
  const fy = Math.sin(sample.angle);
  // Outward = perpendicular away from the corner apex (where centrifugal
  // force was actually flinging the car).
  const ox = -fy * outwardSign;
  const oy = fx * outwardSign;
  // Carry most of the forward speed, plus a strong sideways kick — the car
  // ploughs off-line in the outward direction.
  const v = car.speed;
  car.deslotVel = {
    x: fx * v * 0.8 + ox * v * 0.95,
    y: fy * v * 0.8 + oy * v * 0.95
  };
  car.deslotPos = { x: sample.pos.x, y: sample.pos.y };
  car.deslotAngle = sample.angle;
  // Wild spin so the visual is unmistakable.
  car.deslotSpin = (Math.random() * 7 + 6) * outwardSign;
  car.speed = 0;
}

// Linear interpolation between the previous and current sim pose. `alpha`
// should be (acc / SIM_DT) so motion stays smooth between fixed-step ticks.
export function renderPose(car: Car, alpha: number): { x: number; y: number; angle: number } {
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  let dAngle = car.angle - car.prevAngle;
  while (dAngle > Math.PI) dAngle -= Math.PI * 2;
  while (dAngle < -Math.PI) dAngle += Math.PI * 2;
  return {
    x: car.prevPos.x + (car.pos.x - car.prevPos.x) * a,
    y: car.prevPos.y + (car.pos.y - car.prevPos.y) * a,
    angle: car.prevAngle + dAngle * a
  };
}

// Max speed the slot can sustain at a given absolute curvature without
// exceeding maxCentripetal. Returns Infinity for straights.
export function maxSafeSpeedFor(absCurvature: number): number {
  if (absCurvature < 1e-6) return SLOT.topSpeed;
  return Math.sqrt(SLOT.maxCentripetal / absCurvature);
}

export function clampLane(l: number): number {
  if (l < 0) return 0;
  if (l > NUM_LANES - 1) return NUM_LANES - 1;
  return Math.round(l);
}
