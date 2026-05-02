import { useEffect, useMemo, useState } from "react";
import { Garage } from "./ui/Garage";
import { Grid, type GridStartConfig } from "./ui/Grid";
import { Race } from "./ui/Race";
import { loadGarage, saveGarage, type GarageEntry } from "./lib/storage";
import type { CarEntry } from "./sim/race/engine";

type View = "garage" | "grid" | "race";

export function App(): JSX.Element {
  const [view, setView] = useState<View>("grid");
  const [garage, setGarage] = useState<GarageEntry[]>(() => loadGarage());
  const [startCfg, setStartCfg] = useState<GridStartConfig | null>(null);

  // Persist garage on every change.
  useEffect(() => {
    saveGarage(garage);
  }, [garage]);

  const raceCars = useMemo<CarEntry[]>(() => {
    if (!startCfg) return [];
    return startCfg.slots.map((slot, i) => {
      const entry = garage.find((e) => e.id === slot.carId)!;
      return {
        id: `slot-${i}`,
        config: { ...entry.car, driver: { preset: slot.driver } },
      };
    });
  }, [startCfg, garage]);

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          F<span className="accent">i</span> Racing
        </h1>
        <span className="tag">Tune the car. Pick the mind. Watch them race.</span>
        <div className="spacer" />
        <a
          href="https://github.com/kelvinkoko/fi-racing"
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--muted)", fontSize: 13, textDecoration: "none" }}
        >
          GitHub →
        </a>
      </header>

      {view === "garage" && (
        <Garage
          entries={garage}
          onChange={setGarage}
          onDone={() => setView("grid")}
        />
      )}

      {view === "grid" && (
        <Grid
          garage={garage}
          initial={startCfg ?? undefined}
          onOpenGarage={() => setView("garage")}
          onStart={(cfg) => {
            setStartCfg(cfg);
            setView("race");
          }}
        />
      )}

      {view === "race" && startCfg && (
        <Race
          cars={raceCars}
          seed={startCfg.seed}
          laps={startCfg.laps}
          onBack={() => setView("grid")}
        />
      )}
    </div>
  );
}
