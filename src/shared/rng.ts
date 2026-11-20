// Small deterministic helpers. No Math.random anywhere in game rules.

/** FNV-1a 32-bit string hash. */
export const hashString = (input: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** mulberry32: tiny, fast, good-enough PRNG. Returns floats in [0, 1). */
export const makeRng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export type Rng = ReturnType<typeof makeRng>;

export const rngInt = (rng: Rng, min: number, maxInclusive: number): number =>
  min + Math.floor(rng() * (maxInclusive - min + 1));

export const shuffled = <T>(items: readonly T[], rng: Rng): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
};

/**
 * Pick from `items` for day number `day` so that each item appears exactly
 * once per cycle of `items.length` days, the order changes every cycle, and
 * no item repeats on consecutive days (including across cycle boundaries).
 */
export const pickCyclic = <T>(
  items: readonly T[],
  day: number,
  salt: string
): T => {
  const n = items.length;
  const cycle = Math.floor(day / n);
  const order = cycleOrder(items, cycle, salt);
  return order[((day % n) + n) % n]!;
};

const cycleOrder = <T>(
  items: readonly T[],
  cycle: number,
  salt: string
): T[] => {
  const order = shuffled(items, makeRng(hashString(`${salt}:${cycle}`)));
  if (order.length > 2) {
    // The swap below only touches positions 0 and 1, so the previous cycle's
    // last item is the same whether or not that cycle was itself swapped.
    const prev = shuffled(items, makeRng(hashString(`${salt}:${cycle - 1}`)));
    if (order[0] === prev[prev.length - 1]) {
      const tmp = order[0]!;
      order[0] = order[1]!;
      order[1] = tmp;
    }
  }
  return order;
};
