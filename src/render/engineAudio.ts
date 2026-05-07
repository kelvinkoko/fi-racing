// Tiny synthesised engine note. One sawtooth oscillator → low-pass filter →
// gain. Frequency tracks speed, gain tracks throttle. Designed to be
// initialised on the first user gesture (browsers block AudioContext
// otherwise) and then update()'d every frame from the render loop.

let ctx: AudioContext | null = null;
let osc: OscillatorNode | null = null;
let gain: GainNode | null = null;
let filter: BiquadFilterNode | null = null;
let started = false;

export function initEngineAudio() {
  if (started) return;
  const Ctor: typeof AudioContext | undefined =
    (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) return;
  try {
    ctx = new Ctor();
    osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 70;

    filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1200;
    filter.Q.value = 0.6;

    gain = ctx.createGain();
    gain.gain.value = 0.0;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    started = true;
  } catch (e) {
    console.warn("Engine audio init failed", e);
    ctx = osc = filter = gain = null;
  }
}

// speedRatio in [0,1] (current speed / top speed including any boost).
// throttle in [0,1].
// active: when false, the engine is silenced (race finished, parked at
// the line, before lights out, etc.).
export function updateEngineAudio(speedRatio: number, throttle: number, active: boolean = true) {
  if (!ctx || !osc || !gain || !filter) return;
  const t = Math.max(0, Math.min(1, speedRatio));
  // Engine note climbs from ~70 Hz at idle to ~360 Hz at top speed.
  const freq = 70 + 290 * t;
  osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
  // Filter opens up with speed for a bit of brightness on the straight.
  const cutoff = 700 + 1800 * t;
  filter.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.08);
  // Volume: silent unless the engine is meant to be running. Otherwise
  // rests at a low idle and lifts with throttle so the player hears
  // the gas/lift cadence — capped low so the synth doesn't get fatiguing.
  const target = active ? (0.04 + 0.10 * Math.max(throttle, 0.15 * t)) : 0;
  gain.gain.setTargetAtTime(target, ctx.currentTime, active ? 0.06 : 0.10);
}

export function stopEngineAudio() {
  try {
    if (osc) osc.stop();
  } catch { /* already stopped */ }
  if (ctx) ctx.close().catch(() => undefined);
  ctx = osc = filter = gain = null;
  started = false;
}
