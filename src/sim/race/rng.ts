// Seeded PRNG (mulberry32). Small, fast, good enough for sim variation.
// Determinism property: same seed in == same stream out, across platforms.

export interface Rng {
  next(): number; // [0, 1)
  range(min: number, max: number): number;
  gaussian(): number; // standard normal, mean 0 stddev 1
  fork(salt: number): Rng; // independent stream from same parent
  state(): number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9; // avoid all-zero state

  let spareGaussian: number | null = null;

  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    gaussian: () => {
      if (spareGaussian !== null) {
        const v = spareGaussian;
        spareGaussian = null;
        return v;
      }
      // Box-Muller
      let u = 0;
      let v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      const mag = Math.sqrt(-2.0 * Math.log(u));
      const z0 = mag * Math.cos(2.0 * Math.PI * v);
      const z1 = mag * Math.sin(2.0 * Math.PI * v);
      spareGaussian = z1;
      return z0;
    },
    fork: (salt) => createRng((s ^ Math.imul(salt | 0, 0x85ebca6b)) >>> 0),
    state: () => s,
  };
}
