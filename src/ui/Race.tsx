import { useEffect, useRef, useState } from "react";
import { buildTrack, gridPositions } from "../game/track";
import { renderTrackArt } from "../render/trackRender";
import { createCamera, drawScene, followCamera, CarVisual } from "../render/scene";
import { Car, emptyInput, stepCar } from "../game/car";
import { Keyboard } from "../input/keyboard";
import { SIM_DT } from "../game/constants";
import { LapState, formatTime, newLapState, tickLap } from "../game/race";

const TOTAL_LAPS = 3;

type HudData = {
  lap: number;
  totalLaps: number;
  curLap: number;
  lastLap: number | null;
  bestLap: number | null;
  total: number;
  speed: number;
  finished: boolean;
};

export default function Race() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hud, setHud] = useState<HudData>({
    lap: 1, totalLaps: TOTAL_LAPS, curLap: 0, lastLap: null, bestLap: null, total: 0, speed: 0, finished: false
  });
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const track = buildTrack(60);
    const art = renderTrackArt(track, 1);
    const cam = createCamera();
    const grid = gridPositions(track, 1);

    const player: Car = {
      id: "local",
      name: "You",
      color: "#ff2e4d",
      pos: { ...grid[0].pos },
      vel: { x: 0, y: 0 },
      angle: grid[0].angle,
      speed: 0,
      input: emptyInput()
    };
    cam.x = player.pos.x;
    cam.y = player.pos.y;

    let simTime = 0;
    const lapState: LapState = newLapState(TOTAL_LAPS, simTime);

    const kb = new Keyboard();
    kb.attach();

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let lastTime = performance.now();
    let acc = 0;
    let raf = 0;
    let hudTick = 0;

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      acc += dt;
      while (acc >= SIM_DT) {
        player.input = kb.read();
        if (!lapState.finished) stepCar(player, track);
        simTime += SIM_DT;
        const completed = tickLap(lapState, player, track, simTime);
        if (completed) {
          if (lapState.finished) {
            setToast({ text: `Finish! ${formatTime(lapState.finishTime!)}`, key: now });
          } else {
            const last = lapState.lapTimes[lapState.lapTimes.length - 1];
            const isBest = lapState.bestLap !== null && Math.abs(last - lapState.bestLap) < 1e-6;
            setToast({ text: `Lap ${lapState.currentLap - 1}: ${formatTime(last)}${isBest ? " ★" : ""}`, key: now });
          }
        }
        acc -= SIM_DT;
      }
      followCamera(cam, player.pos, canvas.clientWidth, canvas.clientHeight, dt);

      const cars: CarVisual[] = [{
        pos: player.pos, angle: player.angle, color: player.color, isLocal: true
      }];
      drawScene(ctx, cam, track, art, cars, canvas.clientWidth, canvas.clientHeight);

      hudTick += dt;
      if (hudTick > 0.08) {
        hudTick = 0;
        setHud({
          lap: Math.min(lapState.currentLap, lapState.totalLaps),
          totalLaps: lapState.totalLaps,
          curLap: simTime - lapState.currentLapStart,
          lastLap: lapState.lapTimes.length ? lapState.lapTimes[lapState.lapTimes.length - 1] : null,
          bestLap: lapState.bestLap,
          total: simTime - lapState.raceStart,
          speed: Math.max(0, Math.round(player.speed)),
          finished: lapState.finished
        });
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      kb.detach();
      window.removeEventListener("resize", resize);
    };
  }, []);

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
      {toast && <div className="toast" key={toast.key}>{toast.text}</div>}
    </div>
  );
}
