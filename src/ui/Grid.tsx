import { useMemo, useState } from "react";
import type { DriverPreset } from "@/config/car";
import type { GarageEntry } from "@/lib/storage";

export interface GridSlot {
  carId: string;
  driver: DriverPreset;
}

export interface GridStartConfig {
  slots: GridSlot[];
  laps: number;
  seed: number;
}

export interface GridProps {
  garage: GarageEntry[];
  initial?: GridStartConfig;
  onOpenGarage: () => void;
  onStart: (cfg: GridStartConfig) => void;
}

const PRESETS: DriverPreset[] = ["safe", "aggressive", "overtaker"];
const SLOT_COUNT = 4;

export function Grid({ garage, initial, onOpenGarage, onStart }: GridProps): JSX.Element {
  const defaults = useMemo<GridSlot[]>(() => {
    const ids = garage.map((e) => e.id);
    const presets: DriverPreset[] = ["safe", "aggressive", "overtaker", "safe"];
    return Array.from({ length: SLOT_COUNT }, (_, i) => ({
      carId: ids[i % Math.max(1, ids.length)] ?? "",
      driver: presets[i],
    }));
  }, [garage]);

  const [slots, setSlots] = useState<GridSlot[]>(initial?.slots ?? defaults);
  const [laps, setLaps] = useState(initial?.laps ?? 3);
  const [seedStr, setSeedStr] = useState(String(initial?.seed ?? 12345));
  const [randomSeed, setRandomSeed] = useState(true);

  const updateSlot = (i: number, mut: (s: GridSlot) => GridSlot): void => {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? mut(s) : s)));
  };

  const handleStart = (): void => {
    const seed = randomSeed
      ? Math.floor(Math.random() * 1_000_000)
      : Math.max(0, Math.floor(Number(seedStr) || 0));
    onStart({ slots, laps, seed });
  };

  const allValid = slots.every((s) => garage.some((e) => e.id === s.carId));

  return (
    <div className="screen grid-screen">
      <div className="screen-bar">
        <span className="title">Race Setup</span>
        <div className="spacer" />
        <button onClick={onOpenGarage}>Garage</button>
      </div>

      <div className="grid-body">
        <div className="grid-section">
          <h3>Cars on Grid</h3>
          <div className="slot-grid">
            {slots.map((slot, i) => {
              const car = garage.find((e) => e.id === slot.carId)?.car;
              return (
                <div className="slot" key={i}>
                  <div className="slot-head">
                    <span className="slot-num">{i + 1}</span>
                    <span
                      className="swatch"
                      style={{ background: car?.color ?? "#374151" }}
                    />
                    <strong>{car?.name ?? "—"}</strong>
                  </div>
                  <label>Car</label>
                  <select
                    value={slot.carId}
                    onChange={(e) => updateSlot(i, (s) => ({ ...s, carId: e.target.value }))}
                  >
                    {garage.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.car.name}
                      </option>
                    ))}
                  </select>
                  <label>Driver</label>
                  <div className="seg">
                    {PRESETS.map((p) => (
                      <button
                        key={p}
                        className={"seg-btn" + (slot.driver === p ? " on" : "")}
                        onClick={() => updateSlot(i, (s) => ({ ...s, driver: p }))}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid-section">
          <h3>Race Settings</h3>
          <div className="settings-row">
            <label>
              Track
              <select value="test-oval" disabled>
                <option value="test-oval">Test Oval</option>
              </select>
              <span className="hint">More tracks coming in M6.</span>
            </label>
            <label>
              Laps
              <input
                type="number"
                min={1}
                max={20}
                value={laps}
                onChange={(e) => setLaps(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              />
            </label>
            <label>
              Seed
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="number"
                  value={seedStr}
                  disabled={randomSeed}
                  onChange={(e) => setSeedStr(e.target.value)}
                  style={{ width: 110 }}
                />
                <label className="cb">
                  <input
                    type="checkbox"
                    checked={randomSeed}
                    onChange={(e) => setRandomSeed(e.target.checked)}
                  />
                  random
                </label>
              </div>
              <span className="hint">Same seed → same race.</span>
            </label>
          </div>
        </div>

        <div className="grid-actions">
          <button className="primary" onClick={handleStart} disabled={!allValid}>
            Start Race →
          </button>
        </div>
      </div>
    </div>
  );
}
