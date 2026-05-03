import { Car, CarInput, emptyInput, stepCar } from "../game/car";
import { LapState, newLapState, tickLap } from "../game/race";
import { gridPositions, Track } from "../game/track";
import {
  CAR_COLORS, InputMsg, PlayerInfo, SnapshotCar, SnapshotLap, SnapshotMsg, StartMsg
} from "./protocol";
import { SIM_DT } from "../game/constants";

export type HostState = {
  cars: Map<string, Car>;
  inputs: Map<string, CarInput>;
  lastInputSeq: Map<string, number>;
  laps: Map<string, LapState>;
  totalLaps: number;
  simTime: number;
  tick: number;
  startedAt: number; // performance.now() at green light
  raceOver: boolean;
};

export function createHostState(
  players: PlayerInfo[],
  track: Track,
  totalLaps: number
): HostState {
  const grid = gridPositions(track, players.length);
  const cars = new Map<string, Car>();
  const inputs = new Map<string, CarInput>();
  const lastInputSeq = new Map<string, number>();
  const laps = new Map<string, LapState>();
  players.forEach((p, i) => {
    cars.set(p.id, {
      id: p.id,
      name: p.name,
      color: CAR_COLORS[p.colorIndex],
      pos: { ...grid[i].pos },
      vel: { x: 0, y: 0 },
      angle: grid[i].angle,
      speed: 0,
      input: emptyInput()
    });
    inputs.set(p.id, emptyInput());
    lastInputSeq.set(p.id, -1);
    laps.set(p.id, newLapState(totalLaps, 0));
  });
  return {
    cars, inputs, lastInputSeq, laps,
    totalLaps,
    simTime: 0,
    tick: 0,
    startedAt: performance.now(),
    raceOver: false
  };
}

export function applyHostInput(state: HostState, fromId: string, msg: InputMsg) {
  const lastSeq = state.lastInputSeq.get(fromId) ?? -1;
  if (msg.seq <= lastSeq) return;
  state.lastInputSeq.set(fromId, msg.seq);
  state.inputs.set(fromId, {
    throttle: clamp01(msg.t),
    brake: clamp01(msg.b),
    steer: Math.max(-1, Math.min(1, msg.s))
  });
}

export function stepHost(state: HostState, track: Track) {
  state.simTime += SIM_DT;
  state.tick += 1;
  let allFinished = true;
  for (const [id, car] of state.cars) {
    const lap = state.laps.get(id)!;
    if (!lap.finished) {
      car.input = state.inputs.get(id) ?? emptyInput();
      stepCar(car, track);
      tickLap(lap, car, track, state.simTime);
    }
    if (!lap.finished) allFinished = false;
  }
  if (allFinished) state.raceOver = true;
}

export function buildSnapshot(state: HostState): SnapshotMsg {
  const cars: SnapshotCar[] = [];
  for (const car of state.cars.values()) {
    cars.push({
      id: car.id,
      x: round(car.pos.x, 2),
      y: round(car.pos.y, 2),
      a: round(car.angle, 3),
      v: round(car.speed, 1)
    });
  }
  const laps: SnapshotLap[] = [];
  for (const [id, l] of state.laps) {
    laps.push({
      id,
      lap: Math.min(l.currentLap, l.totalLaps),
      bestMs: Math.round((l.bestLap ?? 0) * 1000),
      finished: l.finished,
      finishMs: Math.round((l.finishTime ?? 0) * 1000)
    });
  }
  return {
    tick: state.tick,
    t: round(state.simTime, 3),
    cars,
    laps,
    finished: state.raceOver
  };
}

// Encodes the start grid order as the player list.
export function makeStartMsg(players: PlayerInfo[], totalLaps: number, countdownMs = 3500): StartMsg {
  return {
    seed: Math.floor(Math.random() * 2 ** 30),
    totalLaps,
    startAt: Date.now() + countdownMs,
    order: players.map((p) => p.id)
  };
}

// Drives one host tick from a wall-clock loop. Caller passes acc; we step
// fixed timesteps and return the new acc and how many snapshots to emit.
export function hostFixedStep(
  state: HostState, track: Track, dt: number, acc: number
): { acc: number; ticks: number } {
  acc += dt;
  let ticks = 0;
  while (acc >= SIM_DT) {
    stepHost(state, track);
    acc -= SIM_DT;
    ticks += 1;
  }
  return { acc, ticks };
}

export type ClientView = {
  // Latest snapshot we've integrated into per-car render state.
  cars: Map<string, { pos: { x: number; y: number }; angle: number; speed: number; targetPos?: { x: number; y: number }; targetAngle?: number }>;
  laps: Map<string, SnapshotLap>;
  simTime: number;
  tick: number;
  finished: boolean;
};

export function makeClientView(): ClientView {
  return { cars: new Map(), laps: new Map(), simTime: 0, tick: 0, finished: false };
}

export function applySnapshot(view: ClientView, snap: SnapshotMsg) {
  if (snap.tick < view.tick) return;
  view.tick = snap.tick;
  view.simTime = snap.t;
  view.finished = snap.finished;
  for (const c of snap.cars) {
    const cur = view.cars.get(c.id);
    if (!cur) {
      view.cars.set(c.id, { pos: { x: c.x, y: c.y }, angle: c.a, speed: c.v });
    } else {
      cur.targetPos = { x: c.x, y: c.y };
      cur.targetAngle = c.a;
      cur.speed = c.v;
    }
  }
  view.laps.clear();
  for (const l of snap.laps) view.laps.set(l.id, l);
}

export function lerpClientView(view: ClientView, dt: number) {
  // Simple critically-damped follow. Good enough at 20-30 Hz updates.
  const k = 1 - Math.exp(-dt * 14);
  for (const car of view.cars.values()) {
    if (car.targetPos) {
      car.pos.x += (car.targetPos.x - car.pos.x) * k;
      car.pos.y += (car.targetPos.y - car.pos.y) * k;
    }
    if (car.targetAngle !== undefined) {
      let da = car.targetAngle - car.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      car.angle += da * k;
    }
  }
}

function clamp01(v: number) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function round(v: number, dp: number) { const m = Math.pow(10, dp); return Math.round(v * m) / m; }
