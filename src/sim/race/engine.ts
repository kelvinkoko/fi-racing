// Fixed-timestep race engine. Two entry points:
//   - createRaceRunner: stateful, steppable controller for live rendering.
//   - runRace: headless one-shot for tests / async batch races.

import type { CarConfig } from "@/config/car";
import type { CarState, RaceConfig, RaceState, Vec2 } from "./state";
import { stepVehicle } from "../physics/vehicle";
import { decideInputs } from "../ai/driver";
import { TelemetryRecorder, type RaceRecording } from "./recorder";
import type { PreparedTrack } from "../track/track";
import { dist, projectToCenterline } from "../track/track";
import { createRng, type Rng } from "./rng";

export interface CarEntry {
  id: string;
  config: CarConfig;
}

export const DEFAULT_DT = 1 / 120;

export function createInitialRaceState(cars: CarEntry[], track: PreparedTrack): RaceState {
  const grid = track.data.startGrid;
  if (cars.length > grid.length) {
    throw new Error(`Track has ${grid.length} grid slots, ${cars.length} cars provided`);
  }
  return {
    tick: 0,
    time: 0,
    finished: false,
    cars: cars.map((c, i) => initCarState(c, grid[i].position, grid[i].heading)),
  };
}

function initCarState(entry: CarEntry, pos: Vec2, heading: number): CarState {
  return {
    id: entry.id,
    config: entry.config,
    position: { x: pos.x, y: pos.y },
    heading,
    velocity: { x: 0, y: 0 },
    yawRate: 0,
    gear: 1,
    engineRPM: entry.config.engine.idleRPM,
    tireWearFront: 0,
    tireWearRear: 0,
    tireTempFront: 360,
    tireTempRear: 360,
    inputThrottle: 0,
    inputBrake: 0,
    inputSteering: 0,
    lap: 0,
    lapDistance: 0,
    totalDistance: 0,
    finished: false,
  };
}

export interface RaceRunner {
  readonly state: RaceState;
  readonly track: PreparedTrack;
  readonly raceConfig: RaceConfig;
  /** Advance the simulation by exactly one fixed-timestep tick. */
  tick(): void;
  /** Snapshot telemetry (does not stop the runner). */
  snapshot(): RaceRecording;
}

export function createRaceRunner(
  cars: CarEntry[],
  track: PreparedTrack,
  raceConfig: RaceConfig,
  options: { sampleHz?: number } = {},
): RaceRunner {
  const dt = raceConfig.dt || DEFAULT_DT;
  const recorder = new TelemetryRecorder(cars.map((c) => c.id), options.sampleHz ?? 30);
  const state = createInitialRaceState(cars, track);

  const masterRng = createRng(raceConfig.seed);
  const carRngs = new Map<string, Rng>();
  cars.forEach((c, i) => carRngs.set(c.id, masterRng.fork(i + 1)));

  const prevS = new Map<string, number>();
  for (const car of state.cars) {
    const { s } = projectToCenterline(track, car.position);
    prevS.set(car.id, s);
  }

  const tick = (): void => {
    if (state.finished) return;

    // Sort cars by total distance to find car ahead.
    const ordered = [...state.cars].sort((a, b) => b.totalDistance - a.totalDistance);
    const positionByCar = new Map<string, number>();
    ordered.forEach((c, idx) => positionByCar.set(c.id, idx));

    for (const car of state.cars) {
      if (car.finished) continue;
      const myPos = positionByCar.get(car.id)!;
      let carAheadDistance: number | undefined;
      if (myPos > 0) {
        const ahead = ordered[myPos - 1];
        carAheadDistance = dist(car.position, ahead.position);
      }
      const inputs = decideInputs(car, {
        track,
        rng: carRngs.get(car.id)!,
        carAheadDistance,
      });
      stepVehicle(car, inputs, dt);
    }

    // Lap progress.
    const lapLen = track.lapLength;
    for (const car of state.cars) {
      if (car.finished) continue;
      const { s } = projectToCenterline(track, car.position);
      const prev = prevS.get(car.id)!;
      let delta = s - prev;
      if (delta < -lapLen / 2) {
        delta += lapLen;
        car.lap += 1;
      } else if (delta > lapLen / 2) {
        delta -= lapLen;
      }
      car.lapDistance = s;
      car.totalDistance += Math.max(0, delta);
      prevS.set(car.id, s);
      if (car.lap >= raceConfig.laps) car.finished = true;
    }

    state.tick += 1;
    state.time = state.tick * dt;
    recorder.onTick(state, dt);

    if (state.cars.every((c) => c.finished)) state.finished = true;
  };

  return {
    state,
    track,
    raceConfig,
    tick,
    snapshot: () => {
      const rec = recorder.finish(state);
      rec.trackId = raceConfig.trackId;
      rec.seed = raceConfig.seed;
      rec.laps = raceConfig.laps;
      return rec;
    },
  };
}

export interface RunOptions {
  maxTime?: number;
  sampleHz?: number;
}

export function runRace(
  cars: CarEntry[],
  track: PreparedTrack,
  raceConfig: RaceConfig,
  options: RunOptions = {},
): RaceRecording {
  const runner = createRaceRunner(cars, track, raceConfig, { sampleHz: options.sampleHz });
  const dt = raceConfig.dt || DEFAULT_DT;
  const maxTicks = Math.floor((options.maxTime ?? 60 * 30) / dt);
  let n = 0;
  while (!runner.state.finished && n < maxTicks) {
    runner.tick();
    n += 1;
  }
  return runner.snapshot();
}
