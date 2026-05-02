import { useEffect, useRef, useState } from "react";
import { createRaceRunner, type RaceRunner, DEFAULT_DT } from "@/sim/race/engine";
import { prepareTrack } from "@/sim/track/track";
import { makeOval } from "@/data/tracks/oval";
import { balancedCar, gripCar, powerCar } from "@/config/presets";
import type { CarConfig } from "@/config/car";
import { applyCamera, drawCar, drawTrack, fitCamera } from "@/rendering/draw";
import type { CarState } from "@/sim/race/state";

const LAPS = 3;

interface Standing {
  id: string;
  name: string;
  color: string;
  lap: number;
  speed: number;
  finished: boolean;
}

function buildCars(): { id: string; config: CarConfig }[] {
  return [
    { id: "A", config: { ...balancedCar("Balanced"), color: "#3b82f6", driver: { preset: "safe" } } },
    { id: "B", config: { ...powerCar("Power"), color: "#ef4444", driver: { preset: "aggressive" } } },
    { id: "C", config: { ...gripCar("Grip"), color: "#10b981", driver: { preset: "overtaker" } } },
    { id: "D", config: { ...balancedCar("Steady"), color: "#f59e0b", driver: { preset: "safe" } } },
  ];
}

export function RaceCanvas(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runnerRef = useRef<RaceRunner | null>(null);
  const seedRef = useRef<number>(Math.floor(Math.random() * 1_000_000));
  const finishedAtRef = useRef<number | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [seed, setSeed] = useState(seedRef.current);
  const [tick, setTick] = useState(0);

  const restart = (newSeed?: number): void => {
    const s = newSeed ?? Math.floor(Math.random() * 1_000_000);
    seedRef.current = s;
    setSeed(s);
    finishedAtRef.current = null;
    const track = prepareTrack(makeOval());
    runnerRef.current = createRaceRunner(buildCars(), track, {
      trackId: "test-oval",
      laps: LAPS,
      seed: s,
      dt: DEFAULT_DT,
    });
  };

  useEffect(() => {
    restart(seedRef.current);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    let raf = 0;
    let lastWall = performance.now();
    let acc = 0;
    const SIM_DT = DEFAULT_DT;
    // Cap catch-up to avoid the spiral of death after a tab pause.
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

      // Auto-restart 3s after race finishes with a fresh seed.
      if (runner.state.finished) {
        if (finishedAtRef.current == null) finishedAtRef.current = now;
        if (now - finishedAtRef.current > 3000) {
          restart();
        }
      }

      // ----- Draw -----
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
      setTick((t) => (t + 1) % 1_000_000);
      setStandings(buildStandings(runner.state.cars));

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Suppress unused-var lint for the render-driver state.
  void tick;

  return (
    <>
      <canvas ref={canvasRef} />
      <div className="hud">
        <h2>Standings · Lap {currentLap(standings)}/{LAPS}</h2>
        {standings.map((s, i) => (
          <div className="row" key={s.id}>
            <span className="swatch" style={{ background: s.color }} />
            <span className="name">
              {i + 1}. {s.name}
            </span>
            <span className="meta">
              {s.finished ? "FIN" : `${(s.speed * 3.6).toFixed(0)} km/h`}
            </span>
          </div>
        ))}
        <div style={{ marginTop: 8, color: "var(--muted)", fontSize: 11 }}>
          Seed: {seed}
        </div>
      </div>
      <div className="foot">
        Tune the car. Pick the mind. Watch them race.
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
      lap: c.lap,
      speed: Math.max(0, c.velocity.x),
      finished: c.finished,
    }));
}

function currentLap(standings: Standing[]): number {
  if (standings.length === 0) return 1;
  return Math.min(LAPS, Math.max(1, standings[0].lap + 1));
}
