// One quality profile for the whole scene, decided once at load. Phones and
// low-power devices get a lighter scene so they keep a smooth frame rate.

const coarsePointer =
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const smallScreen =
  typeof screen !== 'undefined' && Math.min(screen.width, screen.height) < 700;
const fewCores =
  typeof navigator !== 'undefined' && (navigator.hardwareConcurrency || 8) <= 4;

/** True on phones, tablets and weak machines. */
export const LOW_POWER = coarsePointer || smallScreen || fewCores;

type QualityProfile = {
  dpr: [number, number];
  shadowMap: number;
  softShadows: boolean;
  cars: number;
  clouds: number;
};

export const QUALITY: QualityProfile = {
  /** Device-pixel-ratio range for the canvas. Phones render a little softer. */
  dpr: LOW_POWER ? [1, 1.3] : [1, 1.75],
  /** Sun shadow map resolution. */
  shadowMap: LOW_POWER ? 1024 : 2048,
  /** Soft (PCF-soft) shadows cost more; phones get plain filtered shadows. */
  softShadows: !LOW_POWER,
  /** How many cars drive around. */
  cars: LOW_POWER ? 4 : 8,
  /** How many clouds drift by. */
  clouds: LOW_POWER ? 4 : 8,
};
