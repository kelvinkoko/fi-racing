import type { CarEntry } from "@/sim/race/engine";
import { RaceCanvas } from "./RaceCanvas";
import type { RaceRecording } from "@/sim/race/recorder";

export interface RaceProps {
  cars: CarEntry[];
  seed: number;
  laps: number;
  onBack: () => void;
  onFinish: (recording: RaceRecording) => void;
}

export function Race({ cars, seed, laps, onBack, onFinish }: RaceProps): JSX.Element {
  return (
    <div className="screen race-screen">
      <div className="screen-bar">
        <button onClick={onBack}>← To Grid</button>
        <span className="title">Race</span>
      </div>
      <div className="stage">
        <RaceCanvas cars={cars} seed={seed} laps={laps} onFinish={onFinish} />
      </div>
    </div>
  );
}
