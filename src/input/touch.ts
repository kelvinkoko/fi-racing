import { CarInput } from "../game/car";
import { NUM_LANES } from "../game/track";

// Touch model: right side is a giant throttle pad (hold to go), top-right
// pinky button is brake. Left side has two arrow buttons to step lanes.
export class TouchControls {
  private throttle = 0;
  private brake = 0;
  private laneStep = 0; // edge-triggered: -1 / 0 / +1
  private throttlePid: number | null = null;
  private brakePid: number | null = null;
  private cleanups: Array<() => void> = [];
  enabled = false;

  attach(throttleEl: HTMLElement, brakeEl: HTMLElement, laneLeftEl: HTMLElement, laneRightEl: HTMLElement) {
    this.enabled = true;

    const tDown = (e: PointerEvent) => { this.throttlePid = e.pointerId; this.throttle = 1; throttleEl.setPointerCapture(e.pointerId); e.preventDefault(); };
    const tUp = (e: PointerEvent) => { if (e.pointerId === this.throttlePid) { this.throttlePid = null; this.throttle = 0; } };
    throttleEl.addEventListener("pointerdown", tDown);
    throttleEl.addEventListener("pointerup", tUp);
    throttleEl.addEventListener("pointercancel", tUp);

    const bDown = (e: PointerEvent) => { this.brakePid = e.pointerId; this.brake = 1; brakeEl.setPointerCapture(e.pointerId); e.preventDefault(); };
    const bUp = (e: PointerEvent) => { if (e.pointerId === this.brakePid) { this.brakePid = null; this.brake = 0; } };
    brakeEl.addEventListener("pointerdown", bDown);
    brakeEl.addEventListener("pointerup", bUp);
    brakeEl.addEventListener("pointercancel", bUp);

    const lDown = (e: PointerEvent) => { this.laneStep = -1; e.preventDefault(); };
    const rDown = (e: PointerEvent) => { this.laneStep = 1; e.preventDefault(); };
    laneLeftEl.addEventListener("pointerdown", lDown);
    laneRightEl.addEventListener("pointerdown", rDown);

    this.cleanups.push(() => {
      throttleEl.removeEventListener("pointerdown", tDown);
      throttleEl.removeEventListener("pointerup", tUp);
      throttleEl.removeEventListener("pointercancel", tUp);
      brakeEl.removeEventListener("pointerdown", bDown);
      brakeEl.removeEventListener("pointerup", bUp);
      brakeEl.removeEventListener("pointercancel", bUp);
      laneLeftEl.removeEventListener("pointerdown", lDown);
      laneRightEl.removeEventListener("pointerdown", rDown);
    });
  }

  detach() {
    this.enabled = false;
    for (const fn of this.cleanups) fn();
    this.cleanups = [];
  }

  read(prevDesiredLane: number): CarInput {
    let lane = prevDesiredLane + this.laneStep;
    this.laneStep = 0;
    if (lane < 0) lane = 0;
    if (lane > NUM_LANES - 1) lane = NUM_LANES - 1;
    return { throttle: this.throttle, brake: this.brake, desiredLane: lane };
  }
}

export function isTouchDevice(): boolean {
  return matchMedia("(pointer: coarse)").matches;
}
