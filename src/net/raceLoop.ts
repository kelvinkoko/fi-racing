import { Car, CAR_LENGTH_PX, CarInput, createSlotCar, emptyInput, SLOT, stepCar } from "../game/car";
import { LapState, newLapState, tickLap } from "../game/race";
import { gridPositions, NUM_LANES, sampleAtProgress, Track } from "../game/track";
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
    const seed = grid[i];
    const car = createSlotCar({
      id: p.id,
      name: p.name,
      color: CAR_COLORS[p.colorIndex],
      progress: seed.progress,
      lane: seed.lane
    }, track);
    cars.set(p.id, car);
    const init = emptyInput();
    init.desiredLane = seed.lane;
    inputs.set(p.id, init);
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
  const desiredLane = Math.max(0, Math.min(NUM_LANES - 1, Math.round(msg.l)));
  state.inputs.set(fromId, {
    throttle: clamp01(msg.t),
    brake: clamp01(msg.b),
    desiredLane
  });
}

export function stepHost(state: HostState, track: Track) {
  state.simTime += SIM_DT;
  state.tick += 1;

  // Resolve same-lane traffic before stepping any car. Each car gets a
  // trafficCap = the speed of the nearest car ahead in the same lane (or
  // top speed if no traffic). stepCar then clamps to that cap so the car
  // behind can't accelerate through the one in front.
  applyTraffic(state, track);

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

  // Safety net: if a car overshot the one in front anyway (e.g. the leader
  // braked harder than our cap could anticipate), push it back to bumper-to-
  // bumper distance and match speeds.
  preventOverlap(state, track);

  if (allFinished) state.raceOver = true;
}

// Two cars are "in the same lane" if their smooth lane positions are within
// half a lane of each other. Easing into a different lane lifts the cap.
const SAME_LANE_TOL = 0.5;
// Ignore traffic gaps > 30% of a lap — that's a lapping situation, not a
// follow.
const FAR_GAP = 0.3;

function applyTraffic(state: HostState, track: Track) {
  const carLen = CAR_LENGTH_PX / track.totalLength;
  const followGap = carLen * 1.5;

  for (const a of state.cars.values()) {
    a.trafficCap = SLOT.topSpeed;
    if (a.desloted) continue;
    let bestGap = Infinity;
    let leader: Car | null = null;
    for (const b of state.cars.values()) {
      if (a === b || b.desloted) continue;
      if (Math.abs(a.laneCurrent - b.laneCurrent) > SAME_LANE_TOL) continue;
      let gap = b.progress - a.progress;
      if (gap < 0) gap += 1;
      if (gap > FAR_GAP || gap > followGap) continue;
      if (gap < bestGap) {
        bestGap = gap;
        leader = b;
      }
    }
    if (leader) a.trafficCap = leader.speed;
  }
}

function preventOverlap(state: HostState, track: Track) {
  const carLen = CAR_LENGTH_PX / track.totalLength;
  for (const a of state.cars.values()) {
    if (a.desloted) continue;
    for (const b of state.cars.values()) {
      if (a === b || b.desloted) continue;
      if (Math.abs(a.laneCurrent - b.laneCurrent) > SAME_LANE_TOL) continue;
      let gap = b.progress - a.progress;
      if (gap < 0) gap += 1;
      if (gap > FAR_GAP) continue; // wrap-around lapping case
      if (gap < carLen) {
        // Push a back behind b's bumper.
        a.progress = ((b.progress - carLen) % 1 + 1) % 1;
        const sample = sampleAtProgress(track, a.progress, a.laneCurrent);
        a.pos = { x: sample.pos.x, y: sample.pos.y };
        a.angle = sample.angle;
        a.curvature = sample.curvature;
        if (a.speed > b.speed) a.speed = b.speed;
      }
    }
  }
}

export function buildSnapshot(state: HostState): SnapshotMsg {
  const cars: SnapshotCar[] = [];
  for (const car of state.cars.values()) {
    cars.push({
      id: car.id,
      x: round(car.pos.x, 2),
      y: round(car.pos.y, 2),
      a: round(car.angle, 3),
      v: round(car.speed, 1),
      d: car.desloted ? 1 : 0,
      w: car.warning ? 1 : 0,
      p: round(car.progress, 4)
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

export type ClientCarView = {
  pos: { x: number; y: number };
  angle: number;
  speed: number;
  desloted: boolean;
  warning: boolean;
  progress: number;
  targetPos?: { x: number; y: number };
  targetAngle?: number;
};

export type ClientView = {
  cars: Map<string, ClientCarView>;
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
      view.cars.set(c.id, {
        pos: { x: c.x, y: c.y }, angle: c.a, speed: c.v,
        desloted: !!c.d, warning: !!c.w, progress: c.p
      });
    } else {
      cur.targetPos = { x: c.x, y: c.y };
      cur.targetAngle = c.a;
      cur.speed = c.v;
      cur.desloted = !!c.d;
      cur.warning = !!c.w;
      cur.progress = c.p;
    }
  }
  view.laps.clear();
  for (const l of snap.laps) view.laps.set(l.id, l);
}

export function lerpClientView(view: ClientView, dt: number) {
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
