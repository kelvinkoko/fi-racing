import { Car } from "./car";
import { Track } from "./track";

export type LapState = {
  currentLap: number; // 1..totalLaps; becomes totalLaps+1 when finished
  totalLaps: number;
  lapTimes: number[];
  bestLap: number | null;
  currentLapStart: number; // sim time (seconds)
  raceStart: number;
  finished: boolean;
  finishTime: number | null;
  prevProgress: number;
};

export function newLapState(totalLaps: number, now: number): LapState {
  return {
    currentLap: 1,
    totalLaps,
    lapTimes: [],
    bestLap: null,
    currentLapStart: now,
    raceStart: now,
    finished: false,
    finishTime: null,
    prevProgress: 1.0 // cars start just behind the line
  };
}

// Returns true if a lap was just completed.
export function tickLap(state: LapState, car: Car, _track: Track, now: number): boolean {
  if (state.finished) return false;
  const p = car.progress;
  const prev = state.prevProgress;
  state.prevProgress = p;

  // Forward crossing of start/finish line: prev close to 1, p close to 0.
  const crossedForward = prev > 0.85 && p < 0.15;
  if (!crossedForward) return false;

  const lapTime = now - state.currentLapStart;
  // Reject crossings during the first half-second to avoid spawn-position glitches.
  if (lapTime < 0.5) {
    state.currentLapStart = now;
    return false;
  }

  state.lapTimes.push(lapTime);
  if (state.bestLap === null || lapTime < state.bestLap) state.bestLap = lapTime;
  state.currentLapStart = now;

  if (state.currentLap >= state.totalLaps) {
    state.finished = true;
    state.finishTime = now - state.raceStart;
    return true;
  }
  state.currentLap += 1;
  return true;
}

export function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return "—";
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  const sec = Math.floor(rem);
  const ms = Math.floor((rem - sec) * 1000);
  return `${m}:${String(sec).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}
