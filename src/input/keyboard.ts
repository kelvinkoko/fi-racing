import { CarInput } from "../game/car";

export class Keyboard {
  private keys = new Set<string>();
  private cleanup: (() => void) | null = null;

  attach() {
    const down = (e: KeyboardEvent) => {
      this.keys.add(e.key.toLowerCase());
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
    const blur = () => this.keys.clear();
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

  read(): CarInput {
    const k = this.keys;
    const up = k.has("arrowup") || k.has("w");
    const down = k.has("arrowdown") || k.has("s");
    const left = k.has("arrowleft") || k.has("a");
    const right = k.has("arrowright") || k.has("d");
    return {
      throttle: up ? 1 : 0,
      brake: down ? 1 : 0,
      steer: (right ? 1 : 0) - (left ? 1 : 0)
    };
  }
}
