// Wire protocol for host-authoritative racing.
// Keep payloads tiny — Trystero packs each action into a single message.

export const APP_ID = "fi-racing-v1";
export const MAX_PLAYERS = 4;

export const CAR_COLORS = ["#ff2e4d", "#2bd4ff", "#ffd23f", "#36d399"];

export type PlayerInfo = {
  id: string;
  name: string;
  colorIndex: number;
  joinedAt: number; // ms epoch; oldest = host
};

// Lobby snapshot broadcast by host (or by anyone, peers reconcile).
export type LobbyMsg = {
  players: PlayerInfo[];
  hostId: string;
};

// Race start signal from host.
export type StartMsg = {
  seed: number;
  totalLaps: number;
  startAt: number; // host clock ms when green light
  order: string[]; // player IDs in grid order
};

// Per-player input sent client → host at ~30 Hz.
export type InputMsg = {
  seq: number;
  t: number; // throttle 0..1
  b: number; // brake 0..1
  l: number; // desired lane index (0..NUM_LANES-1)
};

// Snapshot from host → all clients at ~20 Hz.
export type SnapshotMsg = {
  tick: number;
  t: number; // sim seconds
  cars: SnapshotCar[];
  laps: SnapshotLap[];
  finished: boolean;
};

export type SnapshotCar = {
  id: string;
  x: number;
  y: number;
  a: number; // angle radians
  v: number; // forward speed (for HUD)
  d: 0 | 1;  // desloted flag
  w: 0 | 1;  // warning flag
  p: number; // progress around current lap, 0..1
};

export type SnapshotLap = {
  id: string;
  lap: number;
  bestMs: number; // 0 if none
  finished: boolean;
  finishMs: number; // 0 if not finished
};

export type ChatMsg = { text: string };
