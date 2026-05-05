import { useEffect, useRef, useState } from "react";
import { buildTrack, gridPositions, lookaheadMaxCurvature, NUM_LANES, Track } from "../game/track";
import { renderTrackArt } from "../render/trackRender";
import { buildMiniMapBackground, buildMiniMapProjection, drawMiniMap, MiniDot, MiniMapProjection } from "../render/miniMap";
import { initEngineAudio, stopEngineAudio, updateEngineAudio } from "../render/engineAudio";
import { Particles } from "../render/particles";
import { createCamera, drawScene, followCamera, CarVisual } from "../render/scene";
import { Car, createSlotCar, KMH_PER_PX_S, maxSafeSpeedFor, renderPose, SLOT, stepCar } from "../game/car";
import { Keyboard } from "../input/keyboard";
import { TouchControls, isTouchDevice } from "../input/touch";
import { SIM_DT } from "../game/constants";
import { LapState, formatTime, newLapState, tickLap } from "../game/race";
import { NetRoom } from "../net/room";
import { CAR_COLORS, InputMsg, PlayerInfo, SnapshotMsg, StartMsg } from "../net/protocol";
import {
  applyHostInput, applySnapshot, buildSnapshot, ClientView, createHostState,
  hostFixedStep, HostState, lerpClientView, makeClientView, makeStartMsg
} from "../net/raceLoop";

const TOTAL_LAPS = 5;
const TIME_TRIAL_LAPS = 999;
const REFERENCE_SPEED = 280; // px/s used to convert track-distance gaps into seconds
const BEST_LAP_KEY = "fi-racing.bestlap.circuit-alpha";
const SNAPSHOT_HZ = 20;
const INPUT_HZ = 30;

type Props = { net?: NetRoom; onExit?: () => void; timeTrial?: boolean; totalLaps?: number };

type HudData = {
  lap: number; totalLaps: number; curLap: number; lastLap: number | null;
  bestLap: number | null; total: number; speed: number; maxSafe: number;
  lane: number; warning: boolean; desloted: boolean; blocked: boolean;
  // Per-lane lookahead safe speed (px/s) at the player's current
  // progress. Drives the colour of each lane pip so the player sees at
  // a glance which lane has the most grip for the upcoming corner.
  laneSafe: number[];
  finished: boolean;
};

type StandingsRow = { id: string; name: string; color: string; lap: number; finishMs: number; bestMs: number };

type RankRow = {
  id: string;
  name: string;
  color: string;
  lap: number;
  totalLaps: number;
  isLocal: boolean;
  finished: boolean;
  finishMs: number;
  // For non-leader rows: gap to leader. Either a seconds string (formatted)
  // or a "+N L" lap-down string. Leader has gap = "LEADER".
  gap: string;
};

export default function Race({ net, onExit, timeTrial, totalLaps }: Props) {
  const lapCount = timeTrial ? TIME_TRIAL_LAPS : (totalLaps ?? TOTAL_LAPS);
  const [savedBestLap, setSavedBestLap] = useState<number | null>(() => {
    const v = localStorage.getItem(BEST_LAP_KEY);
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gasRef = useRef<HTMLDivElement | null>(null);
  const brakeRef = useRef<HTMLDivElement | null>(null);
  const laneLeftRef = useRef<HTMLDivElement | null>(null);
  const laneRightRef = useRef<HTMLDivElement | null>(null);
  const miniMapRef = useRef<HTMLCanvasElement | null>(null);
  const [touch] = useState(() => isTouchDevice());
  const [hud, setHud] = useState<HudData>({
    lap: 1, totalLaps: lapCount, curLap: 0, lastLap: null, bestLap: null, total: 0,
    speed: 0, maxSafe: 0, lane: 1, warning: false, desloted: false, blocked: false,
    laneSafe: [0, 0, 0], finished: false
  });
  const [tip, setTip] = useState<{ kind: "brake" | "lane"; text: string } | null>(null);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [ranking, setRanking] = useState<RankRow[]>([]);
  const [standings, setStandings] = useState<StandingsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let lastStep = "init";
    const step = <T,>(name: string, fn: () => T): T => {
      lastStep = name;
      return fn();
    };
    try {
      cleanup = setup(step);
    } catch (e) {
      const err = e as Error;
      console.error(`Race setup crashed at step "${lastStep}"`, err);
      setError(`Setup failed at "${lastStep}": ${err.message}\n${(err.stack ?? "").split("\n").slice(0, 3).join("\n")}`);
    }
    return () => { cleanup?.(); };

    function setup(step: <T>(name: string, fn: () => T) => T): () => void {
    const canvas = step("get-canvas", () => canvasRef.current!);
    if (!canvas) throw new Error("canvas ref missing");
    const ctx = step("get-ctx", () => canvas.getContext("2d", { alpha: false })!);
    if (!ctx) throw new Error("2d context unavailable");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const track = step("buildTrack", () => buildTrack(60));
    const art = step("renderTrackArt", () => renderTrackArt(track, 1));

    // Mini-map cached background + projection.
    const miniW = 168;
    const miniH = 110;
    const miniProj: MiniMapProjection = buildMiniMapProjection(track, miniW, miniH);
    const miniBg = step("renderMiniMap", () => buildMiniMapBackground(track, miniProj));
    const miniCanvas = miniMapRef.current;
    const miniCtx = miniCanvas ? miniCanvas.getContext("2d") : null;
    if (miniCanvas) {
      miniCanvas.width = miniW;
      miniCanvas.height = miniH;
    }

    const cam = createCamera();
    const particles = new Particles();
    // Track each car's previous deslot state so we can spawn sparks at the
    // exact moment of transition without re-emitting every frame.
    const prevDeslotState: Map<string, boolean> = new Map();
    const kb = new Keyboard();
    kb.attach();
    const tc = new TouchControls();
    if (touch && gasRef.current && brakeRef.current && laneLeftRef.current && laneRightRef.current) {
      tc.attach(gasRef.current, brakeRef.current, laneLeftRef.current, laneRightRef.current);
    }

    let myDesiredLane = 1; // middle lane by default

    const readInput = () => {
      const k = kb.read(myDesiredLane);
      let throttle = k.throttle;
      let brake = k.brake;
      let lane = k.desiredLane;
      if (tc.enabled) {
        const t = tc.read(lane);
        throttle = Math.max(throttle, t.throttle);
        brake = Math.max(brake, t.brake);
        lane = t.desiredLane;
      }
      myDesiredLane = lane;
      return { throttle, brake, desiredLane: lane };
    };

    const ensureSize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const targetW = Math.floor(w * dpr);
      const targetH = Math.floor(h * dpr);
      if (targetW > 0 && targetH > 0 && (canvas.width !== targetW || canvas.height !== targetH)) {
        canvas.width = targetW;
        canvas.height = targetH;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };
    const ro = new ResizeObserver(() => ensureSize());
    ro.observe(canvas);
    ensureSize();
    window.addEventListener("resize", ensureSize);
    window.addEventListener("orientationchange", ensureSize);

    const isMultiplayer = !!net;
    const isHost = isMultiplayer ? net!.isHost() : true;
    const players: PlayerInfo[] = isMultiplayer
      ? net!.snapshotLobby().players
      : [{ id: "local", name: "You", colorIndex: 0, joinedAt: 0 }];

    // Local-only fallback (no net): one slot car for the player.
    const localCar: Car = (() => {
      const grid = step("gridPositions", () => gridPositions(track, players.length));
      const me = players.find((p) => p.id === (net?.selfId ?? "local")) ?? players[0];
      const idx = players.indexOf(me);
      const seed = grid[idx];
      myDesiredLane = seed.lane;
      return createSlotCar({
        id: me.id, name: me.name, color: CAR_COLORS[me.colorIndex],
        progress: seed.progress, lane: seed.lane
      }, track);
    })();
    cam.x = localCar.pos.x; cam.y = localCar.pos.y;

    let simTime = 0;
    const lapState: LapState = newLapState(lapCount, simTime);

    // ---- Host & client networking state ----
    let hostState: HostState | null = null;
    let clientView: ClientView | null = null;
    let hostId = isMultiplayer ? net!.snapshotLobby().hostId : "local";
    let inputSeq = 0;
    let lastInputSent = 0;
    let lastSnapSent = 0;
    let started = !isMultiplayer;
    let lastTime = performance.now();
    let acc = 0;
    let raf = 0;
    let hudTick = 0;
    let blockedFor = 0;          // seconds the player has been blocked w/o switching lane
    let prevLaneTarget = 1;

    // Engine audio: needs a user gesture before AudioContext will play.
    const initAudioOnGesture = () => {
      initEngineAudio();
      window.removeEventListener("pointerdown", initAudioOnGesture);
      window.removeEventListener("keydown", initAudioOnGesture);
    };
    window.addEventListener("pointerdown", initAudioOnGesture);
    window.addEventListener("keydown", initAudioOnGesture);

    function announceCountdown(at: number) {
      const update = () => {
        const remain = (at - performance.now()) / 1000;
        if (remain <= 0) {
          setCountdown("GO!");
          started = true;
          setTimeout(() => setCountdown(null), 700);
          return;
        }
        setCountdown(String(Math.ceil(remain)));
        setTimeout(update, 100);
      };
      update();
    }

    if (isMultiplayer) {
      hostId = net!.snapshotLobby().hostId;

      if (isHost) {
        hostState = step("createHostState", () => createHostState(players, track, lapCount));
        const startMsg: StartMsg = step("makeStartMsg", () => makeStartMsg(players, lapCount));
        step("recordOwnStart", () => net!.recordOwnStart(startMsg));
        step("broadcastStart", () => net!.broadcastStart(startMsg));
        const me = hostState.cars.get(net!.selfId);
        if (me) myDesiredLane = me.laneTarget;
        const delay = startMsg.startAt - Date.now();
        announceCountdown(performance.now() + Math.max(0, delay));
      } else {
        clientView = makeClientView();
        const cached = net!.latestStart;
        if (cached) {
          const delay = cached.startAt - Date.now();
          announceCountdown(performance.now() + Math.max(0, delay));
        }
      }

      net!.on({
        onStart: (msg, fromId) => {
          if (fromId !== hostId) return;
          if (clientView) clientView = makeClientView();
          const delay = msg.startAt - Date.now();
          announceCountdown(performance.now() + Math.max(0, delay));
        },
        onInput: (msg, fromId) => {
          if (!hostState) return;
          applyHostInput(hostState, fromId, msg);
        },
        onSnapshot: (snap: SnapshotMsg) => {
          if (!clientView) return;
          applySnapshot(clientView, snap);
        },
        onPeerLeave: (id) => {
          if (id === hostId) setError("Host left — race ended.");
        }
      });
    }

    const loop = (now: number) => {
      try {
        loopBody(now);
      } catch (e) {
        console.error("Race loop crashed", e);
        setError(`Race loop error: ${(e as Error).message}`);
        return;
      }
      raf = requestAnimationFrame(loop);
    };

    const loopBody = (now: number) => {
      ensureSize();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      if (!isMultiplayer) {
        acc += dt;
        while (acc >= SIM_DT) {
          localCar.input = readInput();
          if (!lapState.finished && started) stepCar(localCar, track);
          if (started) simTime += SIM_DT;
          if (started) {
            const completed = tickLap(lapState, localCar, track, simTime);
            if (completed) emitLapToast(lapState);
          }
          acc -= SIM_DT;
        }
      } else if (isHost && hostState) {
        const myInput = readInput();
        applyHostInput(hostState, net!.selfId, {
          seq: ++inputSeq, t: myInput.throttle, b: myInput.brake, l: myInput.desiredLane
        });
        if (started) {
          const r = hostFixedStep(hostState, track, dt, acc);
          acc = r.acc;
          const myLap = hostState.laps.get(net!.selfId);
          if (myLap) syncLocalLap(myLap);
          if (now - lastSnapSent >= 1000 / SNAPSHOT_HZ) {
            net!.broadcastSnapshot(buildSnapshot(hostState));
            lastSnapSent = now;
          }
          if (hostState.raceOver) finishRace();
        }
      } else if (clientView) {
        if (started && now - lastInputSent >= 1000 / INPUT_HZ) {
          const myInput = readInput();
          const msg: InputMsg = {
            seq: ++inputSeq, t: myInput.throttle, b: myInput.brake, l: myInput.desiredLane
          };
          net!.sendInputTo(hostId, msg);
          lastInputSent = now;
        }
        lerpClientView(clientView, dt);
        if (clientView.finished) finishRace();
      }

      // Render-time alpha for fixed-timestep interpolation. acc is the
      // unsimulated time leftover after the last batch of sim ticks.
      const alpha = Math.max(0, Math.min(1, acc / SIM_DT));

      // Camera target — use the interpolated render pose so the camera
      // doesn't snap between sim ticks on high-refresh displays.
      let camTarget = renderPose(localCar, alpha);
      if (isMultiplayer && isHost && hostState) {
        const me = hostState.cars.get(net!.selfId);
        if (me) camTarget = renderPose(me, alpha);
      } else if (isMultiplayer && clientView) {
        const me = clientView.cars.get(net!.selfId);
        if (me) camTarget = { x: me.pos.x, y: me.pos.y, angle: me.angle };
      }
      followCamera(cam, camTarget, canvas.clientWidth, canvas.clientHeight, dt);

      // Resolve the local player's speed and throttle (used by the camera
      // shake below, the dust trail emitter, and the engine audio).
      const localSpeed = (() => {
        if (isMultiplayer && isHost && hostState) {
          return hostState.cars.get(net!.selfId)?.speed ?? 0;
        }
        if (isMultiplayer && clientView) {
          return clientView.cars.get(net!.selfId)?.speed ?? 0;
        }
        return localCar.speed;
      })();
      const localThrottle = (() => {
        if (!isMultiplayer) return localCar.input.throttle;
        const me = isHost && hostState ? hostState.inputs.get(net!.selfId) : null;
        return me ? me.throttle : 0;
      })();

      // Speed-based camera shake (sub-pixel jitter that scales with how
      // close to top speed the local player is). Below 70 % of top it
      // contributes nothing; at top it adds ~1 px of high-frequency
      // wobble — felt as engine rumble rather than seen.
      {
        const ratio = Math.min(1, localSpeed / SLOT.topSpeed);
        if (ratio > 0.7) {
          const k = (ratio - 0.7) / 0.3;
          const amp = k * 1.1;
          cam.x += (Math.random() - 0.5) * amp;
          cam.y += (Math.random() - 0.5) * amp;
        }
      }

      // Build car visuals.
      const cars: CarVisual[] = [];
      if (!isMultiplayer) {
        const r = renderPose(localCar, alpha);
        cars.push({
          pos: { x: r.x, y: r.y }, angle: r.angle, color: localCar.color,
          isLocal: true, desloted: localCar.desloted, warning: localCar.warning,
          braking: localCar.braking
        });
      } else if (isHost && hostState) {
        for (const car of hostState.cars.values()) {
          const r = renderPose(car, alpha);
          cars.push({
            pos: { x: r.x, y: r.y }, angle: r.angle, color: car.color,
            isLocal: car.id === net!.selfId,
            desloted: car.desloted, warning: car.warning,
            braking: car.braking
          });
        }
      } else if (clientView) {
        for (const [id, c] of clientView.cars) {
          const info = players.find((p) => p.id === id);
          cars.push({
            pos: c.pos, angle: c.angle,
            color: info ? CAR_COLORS[info.colorIndex] : "#888",
            isLocal: id === net!.selfId,
            desloted: c.desloted, warning: c.warning,
            braking: c.braking
          });
        }
      }

      // Engine audio for the local player.
      updateEngineAudio(localSpeed / SLOT.topSpeed, localThrottle);

      // Detect freshly-desloted cars and pop a spark burst at the impact.
      for (const c of cars) {
        const id = (c as CarVisual & { id?: string }).id ?? "";
        // CarVisual doesn't carry id today; fall back to position lookup
        // by matching against authoritative state.
        void id;
      }
      const seenIds: string[] = [];
      const deslotCheck = (id: string, isDesloted: boolean, x: number, y: number, color: string) => {
        seenIds.push(id);
        const prev = prevDeslotState.get(id) ?? false;
        if (!prev && isDesloted) {
          particles.spawnBurst(x, y, 24, {
            speedMin: 100, speedMax: 360,
            lifeMin: 0.5, lifeMax: 1.0,
            sizeMin: 1, sizeMax: 2.6,
            color: (i) => i % 3 === 0 ? color : (i % 3 === 1 ? "#ffd23f" : "#ff8a3a")
          });
        }
        prevDeslotState.set(id, isDesloted);
      };
      if (!isMultiplayer) {
        deslotCheck(localCar.id, localCar.desloted, localCar.pos.x, localCar.pos.y, localCar.color);
      } else if (isHost && hostState) {
        for (const car of hostState.cars.values()) {
          deslotCheck(car.id, car.desloted, car.pos.x, car.pos.y, car.color);
        }
      } else if (clientView) {
        for (const [id, c] of clientView.cars) {
          const info = players.find((p) => p.id === id);
          deslotCheck(id, c.desloted, c.pos.x, c.pos.y, info ? CAR_COLORS[info.colorIndex] : "#888");
        }
      }
      // Drop departed cars from the previous-state map.
      for (const id of [...prevDeslotState.keys()]) {
        if (!seenIds.includes(id)) prevDeslotState.delete(id);
      }

      // High-speed dust trail. For each car going faster than ~50 % of
      // top speed, emit a thin trail of small particles streaming
      // backwards along its facing direction. Density scales linearly
      // with speed; colour shifts cool/blue at top speed for a "going
      // really fast" feel.
      const TOP = SLOT.topSpeed;
      for (const c of cars) {
        if (c.desloted) continue;
        // Need a speed value for the visual car. Approximate from
        // authoritative state for accuracy.
        let s = 0;
        if (!isMultiplayer) s = localCar.speed;
        else if (isHost && hostState) {
          // Match by reference position — host has direct access.
          for (const car of hostState.cars.values()) {
            if (Math.hypot(car.pos.x - c.pos.x, car.pos.y - c.pos.y) < 1) { s = car.speed; break; }
          }
        } else if (clientView) {
          for (const cv of clientView.cars.values()) {
            if (Math.hypot(cv.pos.x - c.pos.x, cv.pos.y - c.pos.y) < 1) { s = cv.speed; break; }
          }
        }
        const ratio = Math.min(1, s / TOP);
        if (ratio < 0.5) continue;
        const rate = (ratio - 0.5) * 80;          // 0–40 particles/sec
        const expected = rate * dt;
        const count = Math.floor(expected) + (Math.random() < (expected % 1) ? 1 : 0);
        if (count <= 0) continue;
        const fx = -Math.cos(c.angle);            // backward in car frame
        const fy = -Math.sin(c.angle);
        const sideX = -Math.sin(c.angle);
        const sideY =  Math.cos(c.angle);
        const cool = ratio > 0.85;
        for (let i = 0; i < count; i++) {
          const side = (Math.random() - 0.5) * 14;
          const back = 14 + Math.random() * 4;
          const speed = 60 + Math.random() * (90 + ratio * 80);
          const life = 0.18 + Math.random() * 0.24;
          particles.spawn({
            x: c.pos.x + fx * back + sideX * side,
            y: c.pos.y + fy * back + sideY * side,
            vx: fx * speed + sideX * side * 0.6,
            vy: fy * speed + sideY * side * 0.6,
            life, maxLife: life,
            size: 1 + Math.random() * 0.8,
            color: cool ? "rgba(150,190,225,0.55)" : "rgba(170,170,180,0.45)"
          });
        }
      }

      particles.update(dt);

      drawScene(ctx, cam, track, art, cars, canvas.clientWidth, canvas.clientHeight, particles);

      if (miniCtx) {
        const dots: MiniDot[] = cars.map((c) => ({
          x: c.pos.x, y: c.pos.y, color: c.color,
          isLocal: !!c.isLocal, desloted: !!c.desloted
        }));
        drawMiniMap(miniCtx, miniBg, miniProj, dots);
      }

      // Track sustained blocking (for the "switch lane" tutorial prompt).
      // Reset whenever the player commits to a new lane target.
      const isBlockedNow = currentBlocked(isMultiplayer, isHost, hostState, clientView, localCar, net?.selfId);
      if (myDesiredLane !== prevLaneTarget) {
        blockedFor = 0;
        prevLaneTarget = myDesiredLane;
      } else if (isBlockedNow && started) {
        blockedFor += dt;
      } else {
        blockedFor = 0;
      }

      hudTick += dt;
      if (hudTick > 0.08) {
        hudTick = 0;
        const data = pickHudData(isMultiplayer, isHost, hostState, clientView, lapState, simTime, players, localCar, myDesiredLane, track, lapCount, net?.selfId);
        if (data) setHud(data);
        const rank = buildRanking(isMultiplayer, isHost, hostState, clientView, lapState, players, localCar, track.totalLength, lapCount, net?.selfId);
        setRanking(rank);

        // Pick a tutorial prompt: brake takes priority over lane.
        let nextTip: { kind: "brake" | "lane"; text: string } | null = null;
        if (data && started && !data.finished && !data.desloted) {
          if (data.maxSafe > 0 && data.speed > data.maxSafe + 25) {
            nextTip = { kind: "brake", text: "BRAKE!" };
          } else if (data.blocked && blockedFor > 1.5) {
            nextTip = { kind: "lane", text: "TAP LANE TO PASS" };
          }
        }
        setTip(nextTip);
      }
    };

    function emitLapToast(lap: LapState) {
      if (lap.finished) {
        setToast({ text: `Finish! ${formatTime(lap.finishTime!)}`, key: performance.now() });
      } else if (lap.lapTimes.length) {
        const last = lap.lapTimes[lap.lapTimes.length - 1];
        const isBest = lap.bestLap !== null && Math.abs(last - lap.bestLap) < 1e-6;
        // Time-trial mode: persist a new all-time best to localStorage and
        // show a star when the player has beaten their previous record.
        let beatRecord = false;
        if (timeTrial && (savedBestLap === null || last < savedBestLap)) {
          localStorage.setItem(BEST_LAP_KEY, String(last));
          setSavedBestLap(last);
          beatRecord = true;
        }
        const star = beatRecord ? " 🏆" : isBest ? " ★" : "";
        setToast({ text: `Lap ${lap.currentLap - 1}: ${formatTime(last)}${star}`, key: performance.now() });
      }
    }

    let prevLapCount = 0;
    function syncLocalLap(lap: LapState) {
      if (lap.lapTimes.length > prevLapCount) {
        prevLapCount = lap.lapTimes.length;
        emitLapToast(lap);
      }
    }

    function finishRace() {
      if (standings) return;
      const rows: StandingsRow[] = [];
      if (hostState) {
        for (const [id, l] of hostState.laps) {
          const info = players.find((p) => p.id === id);
          rows.push({
            id, name: info?.name ?? id.slice(0, 6),
            color: CAR_COLORS[info?.colorIndex ?? 0],
            lap: l.currentLap, finishMs: Math.round((l.finishTime ?? 0) * 1000),
            bestMs: Math.round((l.bestLap ?? 0) * 1000)
          });
        }
      } else if (clientView) {
        for (const [id, l] of clientView.laps) {
          const info = players.find((p) => p.id === id);
          rows.push({
            id, name: info?.name ?? id.slice(0, 6),
            color: CAR_COLORS[info?.colorIndex ?? 0],
            lap: l.lap, finishMs: l.finishMs, bestMs: l.bestMs
          });
        }
      }
      rows.sort((a, b) => {
        const af = a.finishMs > 0 ? a.finishMs : Infinity;
        const bf = b.finishMs > 0 ? b.finishMs : Infinity;
        if (af !== bf) return af - bf;
        return b.lap - a.lap;
      });
      setStandings(rows);
    }

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      kb.detach();
      tc.detach();
      ro.disconnect();
      window.removeEventListener("resize", ensureSize);
      window.removeEventListener("orientationchange", ensureSize);
      window.removeEventListener("pointerdown", initAudioOnGesture);
      window.removeEventListener("keydown", initAudioOnGesture);
      stopEngineAudio();
    };
    } // end setup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="results">
        <div className="card">
          <h1>Race ended</h1>
          <pre style={{
            color: "var(--muted)", whiteSpace: "pre-wrap", wordBreak: "break-word",
            fontSize: 12, margin: "8px 0 16px", maxHeight: 240, overflow: "auto"
          }}>{error}</pre>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="primary" onClick={onExit}>Back to lobby</button>
          </div>
        </div>
      </div>
    );
  }

  if (standings) {
    return (
      <div className="results">
        <div className="card">
          <h1>Results</h1>
          <div className="players">
            {standings.map((r, i) => (
              <div key={r.id} className="player">
                <span style={{ width: 20, color: "var(--muted)" }}>{i + 1}</span>
                <span className="dot" style={{ background: r.color }} />
                <span className="name">{r.name}</span>
                <span className="badge">
                  {r.finishMs > 0 ? formatTime(r.finishMs / 1000) : `Lap ${r.lap}`}
                  {r.bestMs > 0 && ` · best ${formatTime(r.bestMs / 1000)}`}
                </span>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="primary" onClick={onExit}>Back to lobby</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="race">
      <canvas ref={canvasRef} />
      <div className="hud">
        <div className="lap">{timeTrial ? `Lap ${hud.lap}` : `Lap ${hud.lap} / ${hud.totalLaps}`}</div>
        <div className="timer">{formatTime(hud.curLap)}</div>
        <div className="meta">Last {formatTime(hud.lastLap ?? -1)} · Best {formatTime(hud.bestLap ?? -1)}</div>
        {timeTrial
          ? <div className="meta">Record {savedBestLap !== null ? formatTime(savedBestLap) : "—"}</div>
          : <div className="meta">Total {formatTime(hud.total)}</div>}
        <div className="lane-pips" title="Grip per lane (red = will deslot, green = safe)">
          {Array.from({ length: NUM_LANES }, (_, i) => (
            <span
              key={i}
              className={"lane-pip" + (i === hud.lane ? " on" : "")}
              style={{ background: lanePipColor(hud.laneSafe[i] ?? 0, hud.speed) }}
            />
          ))}
        </div>
        <div className="minimap">
          <canvas ref={miniMapRef} />
        </div>
      </div>
      <div className="hud-right">
        <div className={"speed-big" + speedClass(hud)}>
          {Math.round(hud.speed * KMH_PER_PX_S)}
        </div>
        <div className="speed-unit">KM/H</div>
        <div className="speed-max">
          MAX <span className="speed-max-num">
            {hud.maxSafe ? Math.round(hud.maxSafe * KMH_PER_PX_S) : "—"}
          </span>
        </div>
        <div className="speed-bar">
          <div
            className={"speed-bar-fill" + (hud.maxSafe > 0 && hud.speed > hud.maxSafe ? " over" : "")}
            style={{
              width: `${Math.min(100, (hud.speed / Math.max(hud.maxSafe, 1)) * 100)}%`,
              background: speedBarColor(hud)
            }}
          />
        </div>
        {hud.warning && !hud.desloted && <div className="warn-text">CORNER!</div>}
        {hud.desloted && <div className="warn-text dead">DESLOT</div>}
      </div>
      {ranking.length > 0 && (
        <div className="ranking">
          {ranking.map((r, i) => (
            <div key={r.id} className={"rank-row" + (r.isLocal ? " local" : "")}>
              <span className="rank-pos">P{i + 1}</span>
              <span className="rank-dot" style={{ background: r.color }} />
              <span className="rank-name">{r.name}</span>
              <span className="rank-lap">L{r.lap}/{r.totalLaps}</span>
              <span className={"rank-gap" + (r.gap === "LEADER" ? " leader" : "")}>
                {r.gap}
              </span>
            </div>
          ))}
        </div>
      )}
      {countdown && <div className="toast" key={countdown + "-cd"}>{countdown}</div>}
      {toast && !countdown && <div className="toast" key={toast.key}>{toast.text}</div>}
      {tip && !countdown && (
        <div className={`race-tip ${tip.kind}`}>{tip.text}</div>
      )}
      {touch && (
        <div className="touch-controls">
          <div ref={laneLeftRef} className="touch-pad lane-left">◀ LANE</div>
          <div ref={laneRightRef} className="touch-pad lane-right">LANE ▶</div>
          <div ref={brakeRef} className="touch-pad brake">BRK</div>
          <div ref={gasRef} className="touch-pad gas">HOLD<br/>GAS</div>
        </div>
      )}
      {!touch && (
        <div className="keys-hint">
          <span><kbd>W</kbd>/<kbd>↑</kbd> throttle</span>
          <span><kbd>S</kbd>/<kbd>↓</kbd> brake</span>
          <span><kbd>A</kbd>/<kbd>←</kbd> lane left</span>
          <span><kbd>D</kbd>/<kbd>→</kbd> lane right</span>
        </div>
      )}
      {onExit && (
        <button
          style={{ position: "absolute", bottom: 16, left: 16 }}
          onClick={onExit}
        >
          Exit
        </button>
      )}
    </div>
  );
}

function speedClass(h: HudData): string {
  if (h.desloted) return " dead";
  if (h.warning) return " warn";
  if (h.maxSafe > 0 && h.speed > h.maxSafe) return " warn";
  return "";
}

function speedBarColor(h: HudData): string {
  if (h.desloted) return "#ff445f";
  const ratio = h.maxSafe > 0 ? h.speed / h.maxSafe : 0;
  if (ratio >= 1.0) return "#ff445f";
  if (ratio >= 0.85) return "#ffd23f";
  return "#36d399";
}

// Colour a lane pip by how this lane's safe speed compares to the player's
// current speed. Red = you would fly off if you switched here, yellow =
// close to the limit, green = comfortable. With the lane pips shown side
// by side, the player can see which lane has the most grip for the next
// corner without any text prompt.
function lanePipColor(laneSafe: number, currentSpeed: number): string {
  if (laneSafe <= 0) return "rgba(255,255,255,0.18)";
  const ratio = currentSpeed > 0 ? currentSpeed / laneSafe : 0;
  if (ratio >= 1.0) return "rgba(255, 68, 95, 0.85)";   // would deslot
  if (ratio >= 0.85) return "rgba(255, 210, 64, 0.85)"; // marginal
  return "rgba(54, 211, 153, 0.85)";                    // safe
}

function pickHudData(
  isMp: boolean, isHost: boolean,
  host: HostState | null, client: ClientView | null,
  localLap: LapState, localSim: number,
  players: PlayerInfo[], localCar: Car, myLane: number,
  track: Track, lapCount: number, selfId?: string
): HudData | null {
  // Look ~1 second of top-speed travel ahead so the player has time to brake.
  const lookaheadDist = 500;
  const safeFromProgress = (p: number, lane: number) => {
    const k = lookaheadMaxCurvature(track, p, lookaheadDist, lane);
    return Math.round(maxSafeSpeedFor(k));
  };
  const laneSafeAt = (p: number) => {
    const arr: number[] = [];
    for (let i = 0; i < NUM_LANES; i++) arr.push(safeFromProgress(p, i));
    return arr;
  };
  if (!isMp) {
    return {
      lap: Math.min(localLap.currentLap, localLap.totalLaps),
      totalLaps: localLap.totalLaps,
      curLap: localSim - localLap.currentLapStart,
      lastLap: localLap.lapTimes.length ? localLap.lapTimes[localLap.lapTimes.length - 1] : null,
      bestLap: localLap.bestLap,
      total: localSim - localLap.raceStart,
      speed: Math.max(0, Math.round(localCar.speed)),
      maxSafe: safeFromProgress(localCar.progress, localCar.laneCurrent),
      lane: Math.round(localCar.laneCurrent),
      warning: localCar.warning,
      desloted: localCar.desloted,
      blocked: localCar.blocked,
      laneSafe: laneSafeAt(localCar.progress),
      finished: localLap.finished
    };
  }
  if (isHost && host && selfId) {
    const me = host.laps.get(selfId);
    const car = host.cars.get(selfId);
    if (!me) return null;
    return {
      lap: Math.min(me.currentLap, me.totalLaps),
      totalLaps: me.totalLaps,
      curLap: host.simTime - me.currentLapStart,
      lastLap: me.lapTimes.length ? me.lapTimes[me.lapTimes.length - 1] : null,
      bestLap: me.bestLap,
      total: host.simTime - me.raceStart,
      speed: Math.max(0, Math.round(car?.speed ?? 0)),
      maxSafe: car ? safeFromProgress(car.progress, car.laneCurrent) : 0,
      lane: car ? Math.round(car.laneCurrent) : myLane,
      warning: !!car?.warning,
      desloted: !!car?.desloted,
      blocked: !!car?.blocked,
      laneSafe: car ? laneSafeAt(car.progress) : [0, 0, 0],
      finished: me.finished
    };
  }
  if (client && selfId) {
    const me = client.laps.get(selfId);
    const c = client.cars.get(selfId);
    if (!me) return null;
    return {
      lap: me.lap,
      totalLaps: lapCount,
      curLap: 0,
      lastLap: null,
      bestLap: me.bestMs ? me.bestMs / 1000 : null,
      total: client.simTime,
      speed: Math.max(0, Math.round(c?.speed ?? 0)),
      maxSafe: c ? safeFromProgress(c.progress, myLane) : 0,
      lane: myLane,
      warning: !!c?.warning,
      desloted: !!c?.desloted,
      blocked: !!c?.blocked,
      laneSafe: c ? laneSafeAt(c.progress) : [0, 0, 0],
      finished: me.finished
    };
  }
  void players;
  return null;
}

function currentBlocked(
  isMp: boolean, isHost: boolean,
  host: HostState | null, client: ClientView | null,
  localCar: Car, selfId?: string
): boolean {
  if (!isMp) return localCar.blocked;
  if (isHost && host && selfId) return !!host.cars.get(selfId)?.blocked;
  if (client && selfId) return !!client.cars.get(selfId)?.blocked;
  return false;
}

type RankBuildEntry = {
  id: string;
  name: string;
  color: string;
  isLocal: boolean;
  totalDistance: number; // arc length covered since race start
  lap: number;           // current lap (1..total)
  totalLaps: number;
  finished: boolean;
  finishMs: number;
};

function buildRanking(
  isMp: boolean, isHost: boolean,
  host: HostState | null, client: ClientView | null,
  localLap: LapState,
  players: PlayerInfo[], localCar: Car,
  trackLength: number, lapCount: number, selfId?: string
): RankRow[] {
  const entries: RankBuildEntry[] = [];

  if (!isMp) {
    entries.push({
      id: localCar.id, name: localCar.name, color: localCar.color, isLocal: true,
      totalDistance: ((localLap.currentLap - 1) + localCar.progress) * trackLength,
      lap: Math.min(localLap.currentLap, localLap.totalLaps),
      totalLaps: localLap.totalLaps,
      finished: localLap.finished,
      finishMs: Math.round((localLap.finishTime ?? 0) * 1000)
    });
  } else if (isHost && host) {
    for (const [id, car] of host.cars) {
      const info = players.find((p) => p.id === id);
      const lap = host.laps.get(id);
      const lapNum = lap ? Math.min(lap.currentLap, lap.totalLaps) : 1;
      const lapsCompleted = lap ? lap.currentLap - 1 : 0;
      entries.push({
        id, name: info?.name ?? id.slice(0, 6),
        color: CAR_COLORS[info?.colorIndex ?? 0],
        isLocal: id === selfId,
        totalDistance: (lapsCompleted + car.progress) * trackLength,
        lap: lapNum,
        totalLaps: host.totalLaps,
        finished: !!lap?.finished,
        finishMs: Math.round((lap?.finishTime ?? 0) * 1000)
      });
    }
  } else if (client) {
    for (const [id, c] of client.cars) {
      const info = players.find((p) => p.id === id);
      const lap = client.laps.get(id);
      const lapNum = lap?.lap ?? 1;
      const lapsCompleted = Math.max(0, lapNum - 1);
      entries.push({
        id, name: info?.name ?? id.slice(0, 6),
        color: CAR_COLORS[info?.colorIndex ?? 0],
        isLocal: id === selfId,
        totalDistance: (lapsCompleted + (c.progress ?? 0)) * trackLength,
        lap: lapNum,
        totalLaps: lapCount,
        finished: !!lap?.finished,
        finishMs: lap?.finishMs ?? 0
      });
    }
  }

  // Finished cars sort by finish time ascending; unfinished by distance desc.
  entries.sort((a, b) => {
    if (a.finished && b.finished) return a.finishMs - b.finishMs;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.totalDistance - a.totalDistance;
  });

  if (entries.length === 0) return [];

  const leader = entries[0];
  return entries.map((e, i) => ({
    id: e.id, name: e.name, color: e.color, lap: e.lap, totalLaps: e.totalLaps,
    isLocal: e.isLocal, finished: e.finished, finishMs: e.finishMs,
    gap: i === 0 ? "LEADER" : computeGap(leader, e, trackLength)
  }));
}

function computeGap(leader: RankBuildEntry, p: RankBuildEntry, trackLength: number): string {
  if (leader.finished && p.finished) {
    const ms = p.finishMs - leader.finishMs;
    return `+${(ms / 1000).toFixed(3)}`;
  }
  const dist = leader.totalDistance - p.totalDistance;
  const lapsBehind = Math.floor(dist / trackLength);
  if (lapsBehind >= 1) return `+${lapsBehind} L`;
  const seconds = dist / REFERENCE_SPEED;
  if (seconds >= 100) return `+${seconds.toFixed(1)}`;
  return `+${seconds.toFixed(3)}`;
}
