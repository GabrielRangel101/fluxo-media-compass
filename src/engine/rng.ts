// PRNG determinístico (mulberry32) + amostradores. Mesmo seed → mesmo dataset, sempre.

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  normal(mean: number, sd: number): number;
  pick<T>(items: readonly T[], weights?: readonly number[]): T;
  chance(p: number): boolean;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = (mean: number, sd: number) => {
    const u = 1 - next();
    const v = next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    normal,
    chance: (p) => next() < p,
    pick: <T>(items: readonly T[], weights?: readonly number[]): T => {
      if (!weights) return items[Math.floor(next() * items.length)];
      let total = 0;
      for (const w of weights) total += w;
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },
  };
}

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Hash determinístico string → [0,1) (ruído estável para o funil, sem estado) */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
