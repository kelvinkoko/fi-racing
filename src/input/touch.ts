import { CarInput } from "../game/car";

// On-screen touch controls: left thumb = steer pad, right thumb = throttle/brake.
// We track active pointers by id so multi-touch works.
export class TouchControls {
  private steer = 0;
  private throttle = 0;
  private brake = 0;
  private steerPointerId: number | null = null;
  private steerOriginX = 0;
  private throttlePointerId: number | null = null;
  private brakePointerId: number | null = null;
  private cleanups: Array<() => void> = [];
  enabled = false;

  attach(steerEl: HTMLElement, throttleEl: HTMLElement, brakeEl: HTMLElement) {
    this.enabled = true;

    const onSteerDown = (e: PointerEvent) => {
      this.steerPointerId = e.pointerId;
      this.steerOriginX = e.clientX;
      steerEl.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onSteerMove = (e: PointerEvent) => {
      if (e.pointerId !== this.steerPointerId) return;
      const dx = e.clientX - this.steerOriginX;
      const max = 70;
      this.steer = Math.max(-1, Math.min(1, dx / max));
    };
    const onSteerUp = (e: PointerEvent) => {
      if (e.pointerId !== this.steerPointerId) return;
      this.steerPointerId = null;
      this.steer = 0;
    };

    const onThrottleDown = (e: PointerEvent) => {
      this.throttlePointerId = e.pointerId;
      this.throttle = 1;
      throttleEl.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onThrottleUp = (e: PointerEvent) => {
      if (e.pointerId !== this.throttlePointerId) return;
      this.throttlePointerId = null;
      this.throttle = 0;
    };

    const onBrakeDown = (e: PointerEvent) => {
      this.brakePointerId = e.pointerId;
      this.brake = 1;
      brakeEl.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onBrakeUp = (e: PointerEvent) => {
      if (e.pointerId !== this.brakePointerId) return;
      this.brakePointerId = null;
      this.brake = 0;
    };

    steerEl.addEventListener("pointerdown", onSteerDown);
    steerEl.addEventListener("pointermove", onSteerMove);
    steerEl.addEventListener("pointerup", onSteerUp);
    steerEl.addEventListener("pointercancel", onSteerUp);

    throttleEl.addEventListener("pointerdown", onThrottleDown);
    throttleEl.addEventListener("pointerup", onThrottleUp);
    throttleEl.addEventListener("pointercancel", onThrottleUp);

    brakeEl.addEventListener("pointerdown", onBrakeDown);
    brakeEl.addEventListener("pointerup", onBrakeUp);
    brakeEl.addEventListener("pointercancel", onBrakeUp);

    this.cleanups.push(() => {
      steerEl.removeEventListener("pointerdown", onSteerDown);
      steerEl.removeEventListener("pointermove", onSteerMove);
      steerEl.removeEventListener("pointerup", onSteerUp);
      steerEl.removeEventListener("pointercancel", onSteerUp);
      throttleEl.removeEventListener("pointerdown", onThrottleDown);
      throttleEl.removeEventListener("pointerup", onThrottleUp);
      throttleEl.removeEventListener("pointercancel", onThrottleUp);
      brakeEl.removeEventListener("pointerdown", onBrakeDown);
      brakeEl.removeEventListener("pointerup", onBrakeUp);
      brakeEl.removeEventListener("pointercancel", onBrakeUp);
    });
  }

  detach() {
    this.enabled = false;
    for (const fn of this.cleanups) fn();
    this.cleanups = [];
  }

  read(): CarInput {
    return { steer: this.steer, throttle: this.throttle, brake: this.brake };
  }
}

export function isTouchDevice(): boolean {
  return matchMedia("(pointer: coarse)").matches;
}
