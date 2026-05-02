import { useState } from "react";
import type { CarEntry } from "@/sim/race/engine";
import { RaceCanvas } from "./RaceCanvas";
import type { RaceRecording } from "@/sim/race/recorder";

export interface RaceProps {
  cars: CarEntry[];
  seed: number;
  laps: number;
  onBack: () => void;
}

export function Race({ cars, seed, laps, onBack }: RaceProps): JSX.Element {
  const [recording, setRecording] = useState<RaceRecording | null>(null);

  return (
    <div className="screen race-screen">
      <div className="screen-bar">
        <button onClick={onBack}>← To Grid</button>
        <span className="title">Race</span>
      </div>
      <div className="stage">
        <RaceCanvas
          cars={cars}
          seed={seed}
          laps={laps}
          onFinish={(r) => setRecording(r)}
        />
        {recording && <PostRacePanel recording={recording} cars={cars} onBack={onBack} />}
      </div>
    </div>
  );
}

function PostRacePanel({
  recording,
  cars,
  onBack,
}: {
  recording: RaceRecording;
  cars: CarEntry[];
  onBack: () => void;
}): JSX.Element {
  // Sort by total race time (sum of completed laps), DNFs at the bottom.
  const results = recording.cars
    .map((c) => {
      const car = cars.find((x) => x.id === c.carId)!;
      const totalTime = c.lapTimes.reduce((a, b) => a + b, 0);
      const completedAll = c.lapTimes.length >= recording.laps;
      const best = c.lapTimes.length ? Math.min(...c.lapTimes) : null;
      return { id: c.carId, name: car.config.name, color: car.config.color ?? "#60a5fa", totalTime, completedAll, best, laps: c.lapTimes.length };
    })
    .sort((a, b) => {
      if (a.completedAll !== b.completedAll) return a.completedAll ? -1 : 1;
      return a.totalTime - b.totalTime;
    });

  return (
    <div className="postrace">
      <h2>Race Results</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Car</th>
            <th>Best Lap</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={r.id}>
              <td>{i + 1}</td>
              <td>
                <span className="swatch" style={{ background: r.color }} />
                {r.name}
              </td>
              <td>{r.best != null ? formatTime(r.best) : "—"}</td>
              <td>{r.completedAll ? formatTime(r.totalTime) : `DNF (${r.laps} laps)`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button onClick={onBack} className="primary">
          Back to Grid
        </button>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Telemetry replay coming next.
      </p>
    </div>
  );
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return m > 0 ? `${m}:${sec.toFixed(2).padStart(5, "0")}` : sec.toFixed(2);
}
