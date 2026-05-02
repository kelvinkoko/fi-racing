import { useEffect, useRef, useState } from "react";
import { createRaceRunner, type CarEntry, type RaceRunner, DEFAULT_DT } from "@/sim/race/engine";
import { prepareTrack } from "@/sim/track/track";
import { makeOval } from "@/data/tracks/oval";
import { applyCamera, drawCar, drawTrack, fitCamera } from "@/rendering/draw";
import type { CarState } from "@/sim/race/state";
import type { RaceRecording } from "@/sim/race/recorder";
import type { DriverPreset } from "@/config/car";

export interface RaceCanvasProps {
  cars: CarEntry[];
  seed: number;
  laps: number;
  onFinish?: (recording: RaceRecording) => void;
}

interface Standing {
  id: string;
  name: string;
  color: string;
  preset: DriverPreset;
  lap: number;
  speed: number;
  finished: boolean;
}

const PRESETS: DriverPreset[] = ["safe", "aggressive", "overtaker"];

export function RaceCanvas({ cars, seed, laps, onFinish }: RaceCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runnerRef = useRef<RaceRunner | null>(null);
  const finishedSentRef = useRef(false);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [, setRenderTick] = useState(0);

  useEffect(() => {
    const track = prepareTrack(makeOval());
    runnerRef.current = createRaceRunner(cars, track, {
      trackId: "test-oval",
      laps,
      seed,
      dt: DEFAULT_DT,
    });
    finishedSentRef.current = false;

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    let raf = 0;
    let lastWall = performance.now();
    let acc = 0;
    const SIM_DT = DEFAULT_DT;
    const MAX_STEPS_PER_FRAME = 12;

    const resize = (): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = (now: number): void => {
      const runner = runnerRef.current!;
      const elapsed = (now - lastWall) / 1000;
      lastWall = now;
      acc += Math.min(elapsed, 0.25);

      let steps = 0;
      while (acc >= SIM_DT && steps < MAX_STEPS_PER_FRAME) {
        runner.tick();
        acc -= SIM_DT;
        steps += 1;
      }

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.width;
      const h = canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#0b0f19";
      ctx.fillRect(0, 0, w, h);

      const cam = fitCamera(runner.track, w, h, 30 * dpr);
      applyCamera(ctx, cam);
      drawTrack(ctx, runner.track, cam);
      for (const car of runner.state.cars) drawCar(ctx, car, cam);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      setStandings(buildStandings(runner.state.cars));
      setRenderTick((t) => (t + 1) % 1_000_000);

      if (runner.state.finished && !finishedSentRef.current) {
        finishedSentRef.current = true;
        if (onFinish) onFinish(runner.snapshot());
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, laps, cars]);

  const setPreset = (carId: string, preset: DriverPreset): void => {
    runnerRef.current?.setCarDriverPreset(carId, preset);
  };

  const leadLap = standings[0]?.lap ?? 0;

  return (
    <>
      <canvas ref={canvasRef} />
      <div className="hud">
        <h2>
          Standings · Lap {Math.min(laps, leadLap + 1)}/{laps}
        </h2>
        {standings.map((s, i) => (
          <div className="hud-car" key={s.id}>
            <div className="row">
              <span className="swatch" style={{ background: s.color }} />
              <span className="name">
                {i + 1}. {s.name}
              </span>
              <span className="meta">
                {s.finished ? "FIN" : `${(s.speed * 3.6).toFixed(0)} km/h`}
              </span>
            </div>
            <div className="seg seg-tight">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  className={"seg-btn" + (s.preset === p ? " on" : "")}
                  onClick={() => setPreset(s.id, p)}
                  disabled={s.finished}
                  title={`Switch ${s.name} to ${p}`}
                >
                  {p[0].toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="hud-foot">Seed: {seed} · click a style to change AI live</div>
      </div>
    </>
  );
}

function buildStandings(cars: CarState[]): Standing[] {
  return [...cars]
    .sort((a, b) => b.totalDistance - a.totalDistance)
    .map((c) => ({
      id: c.id,
      name: c.config.name,
      color: c.config.color ?? "#60a5fa",
      preset: c.config.driver.preset,
      lap: c.lap,
      speed: Math.max(0, c.velocity.x),
      finished: c.finished,
    }));
}
