import { CarInput } from "../game/car";
import { NUM_LANES } from "../game/track";

export class Keyboard {
  private keys = new Set<string>();
  private pressed = new Set<string>(); // edge-triggered keys pending consumption
  private cleanup: (() => void) | null = null;

  attach() {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) {
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
    const blur = () => { this.keys.clear(); this.pressed.clear(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    this.cleanup = () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }

  detach() {
    this.cleanup?.();
    this.cleanup = null;
  }

  consumePressed(k: string): boolean {
    const had = this.pressed.has(k);
    if (had) this.pressed.delete(k);
    return had;
  }

  read(prevDesiredLane: number): CarInput {
    const k = this.keys;
    const up = k.has("arrowup") || k.has("w") || k.has(" ");
    const down = k.has("arrowdown") || k.has("s");
    const left = this.consumePressed("arrowleft") || this.consumePressed("a");
    const right = this.consumePressed("arrowright") || this.consumePressed("d");
    let lane = prevDesiredLane;
    if (left) lane -= 1;
    if (right) lane += 1;
    if (lane < 0) lane = 0;
    if (lane > NUM_LANES - 1) lane = NUM_LANES - 1;
    return {
      throttle: up ? 1 : 0,
      brake: down ? 1 : 0,
      desiredLane: lane
    };
  }
}
