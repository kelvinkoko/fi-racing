import { useEffect, useRef, useState } from "react";
import { buildTrack, gridPositions } from "../game/track";
import { renderTrackArt } from "../render/trackRender";
import { createCamera, drawScene, followCamera, CarVisual } from "../render/scene";
import { Car, emptyInput, stepCar } from "../game/car";
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

const TOTAL_LAPS = 3;
const SNAPSHOT_HZ = 20;
const INPUT_HZ = 30;

type Props = { net?: NetRoom; onExit?: () => void };

type HudData = {
  lap: number; totalLaps: number; curLap: number; lastLap: number | null;
  bestLap: number | null; total: number; speed: number; finished: boolean;
};

type StandingsRow = { id: string; name: string; color: string; lap: number; finishMs: number; bestMs: number };

export default function Race({ net, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const steerRef = useRef<HTMLDivElement | null>(null);
  const gasRef = useRef<HTMLDivElement | null>(null);
  const brakeRef = useRef<HTMLDivElement | null>(null);
  const [touch] = useState(() => isTouchDevice());
  const [hud, setHud] = useState<HudData>({
    lap: 1, totalLaps: TOTAL_LAPS, curLap: 0, lastLap: null, bestLap: null, total: 0, speed: 0, finished: false
  });
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [standings, setStandings] = useState<StandingsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const track = buildTrack(60);
    const art = renderTrackArt(track, 1);
    const cam = createCamera();
    const kb = new Keyboard();
    kb.attach();
    const tc = new TouchControls();
    if (touch && steerRef.current && gasRef.current && brakeRef.current) {
      tc.attach(steerRef.current, gasRef.current, brakeRef.current);
    }
    const readInput = () => {
      const k = kb.read();
      if (!tc.enabled) return k;
      const t = tc.read();
      return {
        throttle: Math.max(k.throttle, t.throttle),
        brake: Math.max(k.brake, t.brake),
        steer: Math.abs(t.steer) > Math.abs(k.steer) ? t.steer : k.steer
      };
    };

    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const isMultiplayer = !!net;
    const isHost = isMultiplayer ? net!.isHost() : true;
    const players: PlayerInfo[] = isMultiplayer
      ? net!.snapshotLobby().players
      : [{ id: "local", name: "You", colorIndex: 0, joinedAt: 0 }];

    // Local-only fallback uses the original single-player path.
    const localCar: Car = (() => {
      const grid = gridPositions(track, players.length);
      const me = players.find((p) => p.id === (net?.selfId ?? "local")) ?? players[0];
      const idx = players.indexOf(me);
      return {
        id: me.id, name: me.name, color: CAR_COLORS[me.colorIndex],
        pos: { ...grid[idx].pos }, vel: { x: 0, y: 0 }, angle: grid[idx].angle,
        speed: 0, input: emptyInput()
      };
    })();
    cam.x = localCar.pos.x; cam.y = localCar.pos.y;

    let simTime = 0;
    const lapState: LapState = newLapState(TOTAL_LAPS, simTime);

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

    // Wire networking.
    if (isMultiplayer) {
      const order = players.map((p) => p.id);
      hostId = net!.snapshotLobby().hostId;

      if (isHost) {
        hostState = createHostState(players, track, TOTAL_LAPS);
        const startMsg: StartMsg = makeStartMsg(players, TOTAL_LAPS);
        net!.recordOwnStart(startMsg);
        net!.broadcastStart(startMsg);
        const delay = startMsg.startAt - Date.now();
        announceCountdown(performance.now() + Math.max(0, delay));
      } else {
        clientView = makeClientView();
        // Use the start message captured by Lobby (it arrived before Race mounted).
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

      void order;
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
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      // ---- Local sim or host sim ----
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
        // Host applies its own input directly into the host state.
        const myInput = readInput();
        applyHostInput(hostState, net!.selfId, {
          seq: ++inputSeq, t: myInput.throttle, b: myInput.brake, s: myInput.steer
        });
        if (started) {
          const r = hostFixedStep(hostState, track, dt, acc);
          acc = r.acc;
          // Track lap toasts for the local player.
          const myLap = hostState.laps.get(net!.selfId);
          if (myLap) syncLocalLap(myLap);
          // Broadcast snapshot.
          if (now - lastSnapSent >= 1000 / SNAPSHOT_HZ) {
            net!.broadcastSnapshot(buildSnapshot(hostState));
            lastSnapSent = now;
          }
          if (hostState.raceOver) finishRace();
        }
      } else if (clientView) {
        // Client sends input to host periodically and interpolates view.
        if (started && now - lastInputSent >= 1000 / INPUT_HZ) {
          const myInput = readInput();
          const msg: InputMsg = {
            seq: ++inputSeq, t: myInput.throttle, b: myInput.brake, s: myInput.steer
          };
          net!.sendInputTo(hostId, msg);
          lastInputSent = now;
        }
        lerpClientView(clientView, dt);
        if (clientView.finished) finishRace();
      }

      // ---- Camera target ----
      let camTarget = localCar.pos;
      if (isMultiplayer && isHost && hostState) {
        const me = hostState.cars.get(net!.selfId);
        if (me) camTarget = me.pos;
      } else if (isMultiplayer && clientView) {
        const me = clientView.cars.get(net!.selfId);
        if (me) camTarget = me.pos;
      }
      followCamera(cam, camTarget, canvas.clientWidth, canvas.clientHeight, dt);

      // ---- Build car visuals ----
      const cars: CarVisual[] = [];
      if (!isMultiplayer) {
        cars.push({ pos: localCar.pos, angle: localCar.angle, color: localCar.color, isLocal: true });
      } else if (isHost && hostState) {
        for (const car of hostState.cars.values()) {
          cars.push({ pos: car.pos, angle: car.angle, color: car.color, isLocal: car.id === net!.selfId });
        }
      } else if (clientView) {
        for (const [id, c] of clientView.cars) {
          const info = players.find((p) => p.id === id);
          cars.push({
            pos: c.pos, angle: c.angle,
            color: info ? CAR_COLORS[info.colorIndex] : "#888",
            isLocal: id === net!.selfId
          });
        }
      }

      drawScene(ctx, cam, track, art, cars, canvas.clientWidth, canvas.clientHeight);

      // ---- HUD ----
      hudTick += dt;
      if (hudTick > 0.08) {
        hudTick = 0;
        const data = pickHudData(isMultiplayer, isHost, hostState, clientView, lapState, simTime, players, net?.selfId);
        if (data) setHud(data);
      }
    };

    function emitLapToast(lap: LapState) {
      if (lap.finished) {
        setToast({ text: `Finish! ${formatTime(lap.finishTime!)}`, key: performance.now() });
      } else if (lap.lapTimes.length) {
        const last = lap.lapTimes[lap.lapTimes.length - 1];
        const isBest = lap.bestLap !== null && Math.abs(last - lap.bestLap) < 1e-6;
        setToast({ text: `Lap ${lap.currentLap - 1}: ${formatTime(last)}${isBest ? " ★" : ""}`, key: performance.now() });
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
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="results">
        <div className="card">
          <h1>Race ended</h1>
          <div className="sub">{error}</div>
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
        <div className="lap">Lap {hud.lap} / {hud.totalLaps}</div>
        <div className="timer">{formatTime(hud.curLap)}</div>
        <div className="meta">Last {formatTime(hud.lastLap ?? -1)} · Best {formatTime(hud.bestLap ?? -1)}</div>
        <div className="meta">Total {formatTime(hud.total)}</div>
      </div>
      <div className="hud-right">
        <div className="speed-big">{hud.speed}</div>
        <div className="speed-unit">PX/S</div>
      </div>
      {countdown && <div className="toast" key={countdown + "-cd"}>{countdown}</div>}
      {toast && !countdown && <div className="toast" key={toast.key}>{toast.text}</div>}
      {touch && (
        <div className="touch-controls">
          <div ref={steerRef} className="touch-pad left">STEER</div>
          <div ref={brakeRef} className="touch-pad brake">BRK</div>
          <div ref={gasRef} className="touch-pad gas">GAS</div>
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

function pickHudData(
  isMp: boolean, isHost: boolean,
  host: HostState | null, client: ClientView | null,
  localLap: LapState, localSim: number,
  players: PlayerInfo[], selfId?: string
): HudData | null {
  if (!isMp) {
    return {
      lap: Math.min(localLap.currentLap, localLap.totalLaps),
      totalLaps: localLap.totalLaps,
      curLap: localSim - localLap.currentLapStart,
      lastLap: localLap.lapTimes.length ? localLap.lapTimes[localLap.lapTimes.length - 1] : null,
      bestLap: localLap.bestLap,
      total: localSim - localLap.raceStart,
      speed: 0,
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
      finished: me.finished
    };
  }
  if (client && selfId) {
    const me = client.laps.get(selfId);
    const c = client.cars.get(selfId);
    if (!me) return null;
    return {
      lap: me.lap,
      totalLaps: 3,
      curLap: 0,
      lastLap: null,
      bestLap: me.bestMs ? me.bestMs / 1000 : null,
      total: client.simTime,
      speed: Math.max(0, Math.round(c?.speed ?? 0)),
      finished: me.finished
    };
  }
  void players;
  return null;
}
