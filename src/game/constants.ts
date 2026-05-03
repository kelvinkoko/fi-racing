export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

// Arcade car constants. Tuned for fun, not realism.
export const CAR = {
  accel: 520,            // px/s^2
  brake: 900,            // px/s^2 when braking forward
  reverseAccel: 260,
  topSpeed: 360,         // px/s
  reverseTopSpeed: 120,
  drag: 0.6,             // linear drag coefficient (per second)
  rollingFriction: 60,   // base deceleration with no input
  turnRate: 2.8,         // rad/s at moderate speed
  turnSpeedFactor: 0.4,  // fraction of full turn at top speed
  lateralGrip: 5.5,      // higher = less slide
  offTrackGripMul: 0.35, // grip drop on grass/gravel
  offTrackDragMul: 2.4,  // extra drag off track
  offTrackTopSpeedMul: 0.55,
  wallBounce: 0.35
};
