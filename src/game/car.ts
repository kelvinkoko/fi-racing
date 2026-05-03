import { CAR, SIM_DT } from "./constants";
import { Track, onTrack, nearestSample, lateralOffset } from "./track";
import { perp, sub, dot, len, Vec2 } from "./spline";

export type CarInput = {
  throttle: number; // 0..1
  brake: number;    // 0..1
  steer: number;    // -1 (left) .. 1 (right)
};

export type Car = {
  id: string;
  name: string;
  color: string;
  pos: Vec2;
  vel: Vec2; // world-space velocity
  angle: number; // facing
  speed: number; // signed forward speed
  input: CarInput;
};

export function emptyInput(): CarInput {
  return { throttle: 0, brake: 0, steer: 0 };
}

export function stepCar(car: Car, track: Track) {
  const dt = SIM_DT;
  const fwd: Vec2 = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  const right = perp(fwd);

  // Forward signed speed = velocity dot forward.
  const fwdSpeed = dot(car.vel, fwd);
  const latSpeed = dot(car.vel, right);

  const offTrack = !onTrack(track, car.pos);
  const dragMul = offTrack ? CAR.offTrackDragMul : 1;
  const gripMul = offTrack ? CAR.offTrackGripMul : 1;
  const topMul = offTrack ? CAR.offTrackTopSpeedMul : 1;

  // Throttle / brake.
  let accel = 0;
  if (car.input.throttle > 0 && fwdSpeed >= -1) {
    accel += CAR.accel * car.input.throttle;
  } else if (car.input.throttle > 0) {
    // Coming out of reverse — apply brake to slow it.
    accel += CAR.brake * car.input.throttle;
  }
  if (car.input.brake > 0) {
    if (fwdSpeed > 1) accel -= CAR.brake * car.input.brake;
    else accel -= CAR.reverseAccel * car.input.brake;
  }

  // Rolling friction when no input.
  if (car.input.throttle === 0 && car.input.brake === 0) {
    if (fwdSpeed > 0) accel -= Math.min(CAR.rollingFriction, fwdSpeed / dt);
    else if (fwdSpeed < 0) accel += Math.min(CAR.rollingFriction, -fwdSpeed / dt);
  }

  let newFwdSpeed = fwdSpeed + accel * dt;

  // Drag.
  newFwdSpeed -= newFwdSpeed * CAR.drag * dragMul * dt;

  // Speed cap.
  const top = CAR.topSpeed * topMul;
  const revTop = CAR.reverseTopSpeed * topMul;
  if (newFwdSpeed > top) newFwdSpeed = top;
  if (newFwdSpeed < -revTop) newFwdSpeed = -revTop;

  // Steering — turn rate scales down with speed.
  const speedNorm = Math.min(1, Math.abs(newFwdSpeed) / CAR.topSpeed);
  const turnScale = 1 - (1 - CAR.turnSpeedFactor) * speedNorm;
  const dirSign = newFwdSpeed >= 0 ? 1 : -1;
  car.angle += car.input.steer * CAR.turnRate * turnScale * dirSign * dt;

  // Lateral grip — bleed lateral velocity towards zero.
  const grip = CAR.lateralGrip * gripMul;
  const newLat = latSpeed * Math.exp(-grip * dt);

  // Recompose velocity.
  const newFwd: Vec2 = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  const newRight = perp(newFwd);
  car.vel = {
    x: newFwd.x * newFwdSpeed + newRight.x * newLat,
    y: newFwd.y * newFwdSpeed + newRight.y * newLat
  };
  car.speed = newFwdSpeed;

  // Integrate position.
  car.pos = { x: car.pos.x + car.vel.x * dt, y: car.pos.y + car.vel.y * dt };

  // Soft wall collision: if too far from centerline, push back and bleed speed.
  const idx = nearestSample(track, car.pos);
  const lat = lateralOffset(track, car.pos, idx);
  const limit = track.width + 60; // runoff allowance before "wall"
  if (Math.abs(lat) > limit) {
    const n = perp(track.tangents[idx]);
    const sign = Math.sign(lat);
    const overshoot = Math.abs(lat) - limit;
    car.pos = {
      x: car.pos.x - n.x * sign * overshoot,
      y: car.pos.y - n.y * sign * overshoot
    };
    // Reflect velocity around the wall normal (which is -sign*n).
    const wallN: Vec2 = { x: -sign * n.x, y: -sign * n.y };
    const vn = dot(car.vel, wallN);
    if (vn < 0) {
      car.vel = {
        x: car.vel.x - (1 + CAR.wallBounce) * vn * wallN.x,
        y: car.vel.y - (1 + CAR.wallBounce) * vn * wallN.y
      };
    }
  }

  void sub; void len;
}
