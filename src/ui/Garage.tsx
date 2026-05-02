import { useRef, useState } from "react";
import type { CarConfig, DriverPreset, TireCompound } from "@/config/car";
import { downloadCar, readCarFile } from "@/lib/fileIO";
import type { GarageEntry } from "@/lib/storage";
import { newId } from "@/lib/storage";
import { balancedCar } from "@/config/presets";
import { CarSchemaError } from "@/config/schema";

export interface GarageProps {
  entries: GarageEntry[];
  onChange: (next: GarageEntry[]) => void;
  onDone: () => void;
}

const COMPOUNDS: TireCompound[] = ["soft", "medium", "hard"];
const PRESETS: DriverPreset[] = ["safe", "aggressive", "overtaker"];
const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#a855f7", "#ec4899", "#14b8a6", "#f97316"];

export function Garage({ entries, onChange, onDone }: GarageProps): JSX.Element {
  const [selectedId, setSelectedId] = useState<string>(entries[0]?.id ?? "");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const selected = entries.find((e) => e.id === selectedId);

  const updateSelected = (mut: (c: CarConfig) => CarConfig): void => {
    if (!selected) return;
    const next = entries.map((e) => (e.id === selected.id ? { ...e, car: mut(e.car) } : e));
    onChange(next);
  };

  const addNew = (): void => {
    const e: GarageEntry = { id: newId(), car: { ...balancedCar(`New Car ${entries.length + 1}`), color: COLORS[entries.length % COLORS.length] } };
    onChange([...entries, e]);
    setSelectedId(e.id);
  };

  const duplicate = (): void => {
    if (!selected) return;
    const e: GarageEntry = {
      id: newId(),
      car: { ...selected.car, name: `${selected.car.name} Copy` },
    };
    onChange([...entries, e]);
    setSelectedId(e.id);
  };

  const remove = (): void => {
    if (!selected || entries.length <= 1) return;
    const next = entries.filter((e) => e.id !== selected.id);
    onChange(next);
    setSelectedId(next[0].id);
  };

  const onImport = async (file: File): Promise<void> => {
    try {
      const car = await readCarFile(file);
      const e: GarageEntry = { id: newId(), car };
      onChange([...entries, e]);
      setSelectedId(e.id);
    } catch (err) {
      const msg = err instanceof CarSchemaError ? err.message : "Could not parse .fcar file";
      alert(`Import failed: ${msg}`);
    }
  };

  return (
    <div className="screen garage">
      <div className="screen-bar">
        <button onClick={onDone}>← To Grid</button>
        <span className="title">Garage</span>
        <div className="spacer" />
        <button onClick={addNew}>+ New</button>
        <button onClick={() => fileRef.current?.click()}>Import .fcar</button>
        <input
          ref={fileRef}
          type="file"
          accept=".fcar,.json,application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="garage-body">
        <aside className="car-list">
          {entries.map((e) => (
            <button
              key={e.id}
              className={"car-list-item" + (e.id === selectedId ? " selected" : "")}
              onClick={() => setSelectedId(e.id)}
            >
              <span className="swatch" style={{ background: e.car.color ?? "#60a5fa" }} />
              <span className="name">{e.car.name}</span>
              {e.factory && <span className="badge">factory</span>}
            </button>
          ))}
        </aside>

        {selected && (
          <section className="editor">
            <div className="editor-head">
              <input
                className="name-input"
                value={selected.car.name}
                onChange={(e) =>
                  updateSelected((c) => ({ ...c, name: e.target.value.slice(0, 40) || "Car" }))
                }
              />
              <div className="color-swatches">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={"color-dot" + (selected.car.color === c ? " selected" : "")}
                    style={{ background: c }}
                    onClick={() => updateSelected((cur) => ({ ...cur, color: c }))}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
              <div className="spacer" />
              <button onClick={duplicate}>Duplicate</button>
              <button onClick={() => downloadCar(selected.car)}>Export</button>
              <button
                onClick={remove}
                disabled={entries.length <= 1}
                className="danger"
                title={entries.length <= 1 ? "At least one car must remain" : "Delete car"}
              >
                Delete
              </button>
            </div>

            <div className="editor-grid">
              <Group title="Chassis">
                <Slider
                  label="Mass"
                  unit="kg"
                  min={500}
                  max={1200}
                  step={5}
                  value={selected.car.chassis.mass}
                  onChange={(v) =>
                    updateSelected((c) => ({ ...c, chassis: { ...c.chassis, mass: v } }))
                  }
                />
                <Slider
                  label="Front weight"
                  unit="%"
                  min={35}
                  max={60}
                  step={1}
                  value={Math.round((1 - selected.car.chassis.weightDistribution) * 100)}
                  display={(v) => `${v}% / ${100 - v}%`}
                  onChange={(v) =>
                    updateSelected((c) => ({
                      ...c,
                      chassis: { ...c.chassis, weightDistribution: 1 - v / 100 },
                    }))
                  }
                />
                <Slider
                  label="Wheelbase"
                  unit="m"
                  min={2.5}
                  max={3.6}
                  step={0.05}
                  value={selected.car.chassis.wheelbase}
                  onChange={(v) =>
                    updateSelected((c) => ({ ...c, chassis: { ...c.chassis, wheelbase: v } }))
                  }
                />
              </Group>

              <Group title="Engine">
                <Slider
                  label="Peak power"
                  unit="kW"
                  min={250}
                  max={900}
                  step={10}
                  value={selected.car.engine.peakPower / 1000}
                  display={(v) => `${v} kW (${Math.round(v * 1.341)} hp)`}
                  onChange={(v) =>
                    updateSelected((c) => ({ ...c, engine: { ...c.engine, peakPower: v * 1000 } }))
                  }
                />
                <Slider
                  label="Peak power RPM"
                  unit="rpm"
                  min={7000}
                  max={14000}
                  step={100}
                  value={selected.car.engine.peakPowerRPM}
                  onChange={(v) =>
                    updateSelected((c) => ({ ...c, engine: { ...c.engine, peakPowerRPM: v } }))
                  }
                />
              </Group>

              <Group title="Gearbox">
                <Slider
                  label="Final drive"
                  min={2.5}
                  max={5.0}
                  step={0.05}
                  value={selected.car.gearbox.finalDrive}
                  onChange={(v) =>
                    updateSelected((c) => ({ ...c, gearbox: { ...c.gearbox, finalDrive: v } }))
                  }
                />
                <Slider
                  label="Upshift RPM"
                  min={9000}
                  max={14000}
                  step={100}
                  value={selected.car.gearbox.upshiftRPM}
                  onChange={(v) =>
                    updateSelected((c) => ({ ...c, gearbox: { ...c.gearbox, upshiftRPM: v } }))
                  }
                />
              </Group>

              <Group title="Tires">
                <div className="row">
                  <label>Compound</label>
                  <div className="seg">
                    {COMPOUNDS.map((c) => (
                      <button
                        key={c}
                        className={"seg-btn" + (selected.car.tires.compound === c ? " on" : "")}
                        onClick={() =>
                          updateSelected((cur) => ({ ...cur, tires: { ...cur.tires, compound: c } }))
                        }
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <Slider
                  label="Pressure"
                  unit="kPa"
                  min={120}
                  max={200}
                  step={1}
                  value={selected.car.tires.pressure}
                  onChange={(v) =>
                    updateSelected((c) => ({ ...c, tires: { ...c.tires, pressure: v } }))
                  }
                />
              </Group>

              <Group title="Aero">
                <Slider
                  label="Downforce"
                  min={0}
                  max={6}
                  step={0.1}
                  value={selected.car.aero.downforceArea}
                  display={(v) => `${v.toFixed(1)} m² (Cl·A)`}
                  onChange={(v) =>
                    updateSelected((c) => ({ ...c, aero: { ...c.aero, downforceArea: v } }))
                  }
                />
                <Slider
                  label="Drag"
                  min={0.6}
                  max={1.5}
                  step={0.02}
                  value={selected.car.aero.dragArea}
                  display={(v) => `${v.toFixed(2)} m² (Cd·A)`}
                  onChange={(v) =>
                    updateSelected((c) => ({ ...c, aero: { ...c.aero, dragArea: v } }))
                  }
                />
                <Slider
                  label="Aero balance"
                  unit="% front"
                  min={30}
                  max={60}
                  step={1}
                  value={Math.round(selected.car.aero.frontBalance * 100)}
                  display={(v) => `${v}% front`}
                  onChange={(v) =>
                    updateSelected((c) => ({ ...c, aero: { ...c.aero, frontBalance: v / 100 } }))
                  }
                />
              </Group>

              <Group title="Brakes">
                <Slider
                  label="Max force"
                  unit="kN"
                  min={20}
                  max={60}
                  step={1}
                  value={selected.car.brakes.maxForce / 1000}
                  onChange={(v) =>
                    updateSelected((c) => ({ ...c, brakes: { ...c.brakes, maxForce: v * 1000 } }))
                  }
                />
                <Slider
                  label="Front bias"
                  unit="%"
                  min={45}
                  max={75}
                  step={1}
                  value={Math.round(selected.car.brakes.frontBias * 100)}
                  display={(v) => `${v}% front`}
                  onChange={(v) =>
                    updateSelected((c) => ({ ...c, brakes: { ...c.brakes, frontBias: v / 100 } }))
                  }
                />
              </Group>

              <Group title="Driver">
                <div className="row">
                  <label>Default style</label>
                  <div className="seg">
                    {PRESETS.map((p) => (
                      <button
                        key={p}
                        className={"seg-btn" + (selected.car.driver.preset === p ? " on" : "")}
                        onClick={() =>
                          updateSelected((cur) => ({ ...cur, driver: { preset: p } }))
                        }
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="hint">
                  Each car can be assigned a different driver style on the grid.
                </p>
              </Group>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Group(props: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="group">
      <h3>{props.title}</h3>
      {props.children}
    </div>
  );
}

function Slider(props: {
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display?: (v: number) => string;
  onChange: (v: number) => void;
}): JSX.Element {
  const display = props.display
    ? props.display(props.value)
    : `${formatNum(props.value)}${props.unit ? " " + props.unit : ""}`;
  return (
    <div className="row">
      <label>{props.label}</label>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span className="value">{display}</span>
    </div>
  );
}

function formatNum(v: number): string {
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(2);
}
