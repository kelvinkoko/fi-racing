import { useEffect, useMemo, useRef, useState } from "react";
import { prepareTrack } from "@/sim/track/track";
import { makeOval } from "@/data/tracks/oval";
import {
  applyCamera,
  drawCarSnapshot,
  drawTrack,
  fitCamera,
  type CarSnapshot,
} from "@/rendering/draw";
import type { RaceRecording } from "@/sim/race/recorder";
import type { CarEntry } from "@/sim/race/engine";
import { TelemetryChart, type ChartSeries } from "./TelemetryChart";

export interface ReplayProps {
  recording: RaceRecording;
  cars: CarEntry[];
  onBack: () => void;
  onRaceAgain: () => void;
}

export function Replay({ recording, cars, onBack, onRaceAgain }: ReplayProps): JSX.Element {
  const track = useMemo(() => prepareTrack(makeOval()), []);

  // All cars share the same time axis (the recorder samples them together).
  const time = useMemo<number[]>(() => recording.cars[0]?.samples.map((s) => s.t) ?? [], [recording]);
  const duration = time[time.length - 1] ?? 0;

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(recording.cars.map((c) => [c.carId, true])),
  );

  // Indexed lookup for snapshots.
  const carById = useMemo(() => {
    const m = new Map<string, CarEntry>();
    for (const c of cars) m.set(c.id, c);
    return m;
  }, [cars]);

  // Playback loop.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number): void => {
      const dt = (now - last) / 1000;
      last = now;
      setT((prev) => {
        const next = prev + dt;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);

  // Track canvas.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const resize = (): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      draw();
    };
    const draw = (): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.width;
      const h = canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#0b0f19";
      ctx.fillRect(0, 0, w, h);

      const cam = fitCamera(track, w, h, 24 * dpr);
      applyCamera(ctx, cam);
      drawTrack(ctx, track, cam);

      const idx = closestIndex(time, t);
      if (idx >= 0) {
        for (const car of recording.cars) {
          if (!visible[car.carId]) continue;
          const s = car.samples[idx];
          if (!s) continue;
          const snap: CarSnapshot = {
            x: s.x,
            y: s.y,
            heading: s.heading,
            brake: s.brake,
            color: carById.get(car.carId)?.config.color,
          };
          drawCarSnapshot(ctx, snap, cam);
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    draw();

    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, visible, recording, time, carById, track]);

  const speedSeries: ChartSeries[] = recording.cars
    .filter((c) => visible[c.carId])
    .map((c) => ({
      label: carById.get(c.carId)?.config.name ?? c.carId,
      color: carById.get(c.carId)?.config.color ?? "#60a5fa",
      values: c.samples.map((s) => s.speed * 3.6),
    }));

  const throttleSeries: ChartSeries[] = recording.cars
    .filter((c) => visible[c.carId])
    .map((c) => ({
      label: `${carById.get(c.carId)?.config.name ?? c.carId} thr`,
      color: carById.get(c.carId)?.config.color ?? "#60a5fa",
      values: c.samples.map((s) => s.throttle * 100),
    }));
  const brakeSeries: ChartSeries[] = recording.cars
    .filter((c) => visible[c.carId])
    .map((c) => ({
      label: `${carById.get(c.carId)?.config.name ?? c.carId} brk`,
      color: shade(carById.get(c.carId)?.config.color ?? "#60a5fa", -0.3),
      values: c.samples.map((s) => -s.brake * 100),
    }));

  const lateralGSeries: ChartSeries[] = recording.cars
    .filter((c) => visible[c.carId])
    .map((c) => ({
      label: carById.get(c.carId)?.config.name ?? c.carId,
      color: carById.get(c.carId)?.config.color ?? "#60a5fa",
      values: c.samples.map((s) => s.ay / 9.81),
    }));

  return (
    <div className="screen replay-screen">
      <div className="screen-bar">
        <button onClick={onBack}>← To Grid</button>
        <span className="title">Replay & Telemetry</span>
        <div className="spacer" />
        <button onClick={onRaceAgain} className="primary" style={{ padding: "6px 14px" }}>
          Race Again
        </button>
      </div>

      <div className="replay-body">
        <div className="replay-track">
          <canvas ref={canvasRef} />
        </div>

        <div className="replay-controls">
          <button onClick={() => setPlaying((p) => !p)}>
            {playing ? "Pause" : "Play"}
          </button>
          <button
            onClick={() => {
              setT(0);
              setPlaying(true);
            }}
          >
            Restart
          </button>
          <input
            type="range"
            min={0}
            max={duration}
            step={Math.max(0.01, duration / 1000)}
            value={t}
            onChange={(e) => {
              setT(Number(e.target.value));
              setPlaying(false);
            }}
            style={{ flex: 1 }}
          />
          <span className="time-readout">
            {formatTime(t)} / {formatTime(duration)}
          </span>
        </div>

        <div className="replay-cars">
          {recording.cars.map((c) => {
            const cfg = carById.get(c.carId)?.config;
            return (
              <label key={c.carId} className="car-toggle">
                <input
                  type="checkbox"
                  checked={!!visible[c.carId]}
                  onChange={(e) =>
                    setVisible((v) => ({ ...v, [c.carId]: e.target.checked }))
                  }
                />
                <span
                  className="swatch"
                  style={{ background: cfg?.color ?? "#60a5fa" }}
                />
                <span>{cfg?.name ?? c.carId}</span>
                <span className="meta">
                  best {bestLap(c.lapTimes)} · {c.lapTimes.length} laps
                </span>
              </label>
            );
          })}
        </div>

        <div className="charts">
          <div className="chart-card">
            <h3>Speed (km/h)</h3>
            <TelemetryChart
              time={time}
              series={speedSeries}
              height={150}
              yLabel="km/h"
              cursorTime={t}
              onCursor={(ct) => {
                if (ct == null) return;
                setT(ct);
                setPlaying(false);
              }}
            />
          </div>
          <div className="chart-card">
            <h3>Throttle / Brake (%)</h3>
            <TelemetryChart
              time={time}
              series={[...throttleSeries, ...brakeSeries]}
              height={130}
              yLabel="%"
              yRange={[-100, 100]}
              cursorTime={t}
              onCursor={(ct) => {
                if (ct == null) return;
                setT(ct);
                setPlaying(false);
              }}
            />
          </div>
          <div className="chart-card">
            <h3>Lateral G</h3>
            <TelemetryChart
              time={time}
              series={lateralGSeries}
              height={130}
              yLabel="G"
              cursorTime={t}
              onCursor={(ct) => {
                if (ct == null) return;
                setT(ct);
                setPlaying(false);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function closestIndex(arr: number[], v: number): number {
  if (arr.length === 0) return -1;
  let lo = 0;
  let hi = arr.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= v) lo = mid;
    else hi = mid;
  }
  return Math.abs(arr[lo] - v) < Math.abs(arr[hi] - v) ? lo : hi;
}

function bestLap(lapTimes: number[]): string {
  if (lapTimes.length === 0) return "—";
  return formatTime(Math.min(...lapTimes));
}

function formatTime(s: number): string {
  if (!Number.isFinite(s)) return "—";
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return m > 0 ? `${m}:${sec.toFixed(2).padStart(5, "0")}` : sec.toFixed(2);
}

function shade(hex: string, amt: number): string {
  // amt in [-1, 1]; negative darkens, positive lightens.
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  const adj = (v: number): number => {
    if (amt < 0) return Math.max(0, Math.round(v * (1 + amt)));
    return Math.min(255, Math.round(v + (255 - v) * amt));
  };
  const toHex = (v: number): string => v.toString(16).padStart(2, "0");
  return `#${toHex(adj(r))}${toHex(adj(g))}${toHex(adj(b))}`;
}
