// Telemetry recorder. Captures per-car timeseries at a chosen rate (default
// 30 Hz). Sim runs faster (120 Hz default) so we decimate to keep memory in
// check while still giving smooth replay/graphs.

import type { RaceState } from "./state";

export interface TelemetrySample {
  t: number; // seconds since start
  x: number;
  y: number;
  heading: number;
  speed: number; // m/s, longitudinal body
  ax: number; // longitudinal accel
  ay: number; // lateral accel
  yawRate: number;
  throttle: number;
  brake: number;
  steering: number;
  gear: number;
  rpm: number;
  tireWearFront: number;
  tireWearRear: number;
  tireTempFront: number;
  tireTempRear: number;
  lap: number;
  lapDistance: number;
}

export interface CarTelemetry {
  carId: string;
  samples: TelemetrySample[];
  /** Lap times in seconds, indexed by completed lap (lap 1 first). */
  lapTimes: number[];
}

export interface RaceRecording {
  trackId: string;
  seed: number;
  laps: number;
  cars: CarTelemetry[];
  /** Total race wallclock-equivalent in seconds. */
  duration: number;
}

export class TelemetryRecorder {
  private samplesByCar = new Map<string, TelemetrySample[]>();
  private prevSpeed = new Map<string, number>();
  private prevVy = new Map<string, number>();
  private prevTime = new Map<string, number>();
  private lapTimes = new Map<string, number[]>();
  private lastLapStart = new Map<string, number>();
  private prevLap = new Map<string, number>();
  private accumulator = 0;
  private readonly samplePeriod: number;

  constructor(
    private readonly carIds: string[],
    sampleHz = 30,
  ) {
    this.samplePeriod = 1 / sampleHz;
    for (const id of carIds) {
      this.samplesByCar.set(id, []);
      this.lapTimes.set(id, []);
      this.lastLapStart.set(id, 0);
      this.prevLap.set(id, 0);
      this.prevSpeed.set(id, 0);
      this.prevVy.set(id, 0);
      this.prevTime.set(id, 0);
    }
  }

  /** Record per-tick lap completions (called every sim tick) and a sampled
   *  telemetry frame at the configured Hz. */
  onTick(state: RaceState, dt: number): void {
    // Lap times: detect lap increment between ticks.
    for (const car of state.cars) {
      const prevLap = this.prevLap.get(car.id) ?? 0;
      if (car.lap > prevLap) {
        const start = this.lastLapStart.get(car.id) ?? 0;
        const lapTime = state.time - start;
        this.lapTimes.get(car.id)!.push(lapTime);
        this.lastLapStart.set(car.id, state.time);
        this.prevLap.set(car.id, car.lap);
      }
    }

    // Sample at fixed rate.
    this.accumulator += dt;
    if (this.accumulator + 1e-9 < this.samplePeriod) return;
    this.accumulator -= this.samplePeriod;

    for (const car of state.cars) {
      const samples = this.samplesByCar.get(car.id)!;
      const speed = car.velocity.x;
      const vy = car.velocity.y;
      const dtSample = state.time - (this.prevTime.get(car.id) ?? state.time) || this.samplePeriod;
      const ax = (speed - (this.prevSpeed.get(car.id) ?? speed)) / dtSample;
      const ay = (vy - (this.prevVy.get(car.id) ?? vy)) / dtSample;
      this.prevSpeed.set(car.id, speed);
      this.prevVy.set(car.id, vy);
      this.prevTime.set(car.id, state.time);

      samples.push({
        t: state.time,
        x: car.position.x,
        y: car.position.y,
        heading: car.heading,
        speed,
        ax,
        ay,
        yawRate: car.yawRate,
        throttle: car.inputThrottle,
        brake: car.inputBrake,
        steering: car.inputSteering,
        gear: car.gear,
        rpm: car.engineRPM,
        tireWearFront: car.tireWearFront,
        tireWearRear: car.tireWearRear,
        tireTempFront: car.tireTempFront,
        tireTempRear: car.tireTempRear,
        lap: car.lap,
        lapDistance: car.lapDistance,
      });
    }
  }

  finish(state: RaceState): RaceRecording {
    // Close out any in-progress lap as a lap time only if the car finished it.
    for (const car of state.cars) {
      if (!car.finished) continue;
      const prevLap = this.prevLap.get(car.id) ?? 0;
      if (car.lap > prevLap) {
        const start = this.lastLapStart.get(car.id) ?? 0;
        this.lapTimes.get(car.id)!.push(state.time - start);
        this.prevLap.set(car.id, car.lap);
      }
    }
    return {
      trackId: "",
      seed: 0,
      laps: 0,
      duration: state.time,
      cars: this.carIds.map((id) => ({
        carId: id,
        samples: this.samplesByCar.get(id) ?? [],
        lapTimes: this.lapTimes.get(id) ?? [],
      })),
    };
  }

  carTelemetry(carId: string): TelemetrySample[] {
    return this.samplesByCar.get(carId) ?? [];
  }

  carLapTimes(carId: string): number[] {
    return this.lapTimes.get(carId) ?? [];
  }
}
