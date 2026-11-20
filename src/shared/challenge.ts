import {
  CONDITIONS,
  DECORATIONS,
  MATERIALS,
  THEMES,
  type Condition,
  type DecorId,
  type MaterialId,
  type Theme,
} from './content.ts';
import { hashString, makeRng, pickCyclic, rngInt, shuffled } from './rng.ts';

/**
 * Daily rounds run on UTC calendar days: 00:00:00Z to 23:59:59Z.
 * Everyone, everywhere, shares the same round boundary.
 */
export const utcDateKey = (now: Date = new Date()): string =>
  now.toISOString().slice(0, 10);

const DAY_MS = 86_400_000;

export const dayNumber = (dateKey: string): number =>
  Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / DAY_MS);

/** Epoch ms when the round for `dateKey` ends (next UTC midnight). */
export const roundEndsAt = (dateKey: string): number =>
  Date.parse(`${dateKey}T00:00:00Z`) + DAY_MS;

export const isValidDateKey = (s: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export type Challenge = {
  dateKey: string;
  theme: Theme;
  condition: Condition;
  materials: MaterialId[];
  decorations: DecorId[];
  targets: { height: number; stability: number; style: number };
};

const STURDY: MaterialId[] = ['brick', 'steel', 'stone'];

/**
 * Deterministic: the same date always yields the same challenge, on client
 * and server. The challenge depends only on the date (every Skyshift post
 * that day shares the same site); tower *state* is per post + date.
 */
export const makeChallenge = (dateKey: string): Challenge => {
  const day = dayNumber(dateKey);
  const rng = makeRng(hashString(`skyshift:${dateKey}`));

  const theme = pickCyclic(THEMES, day, 'theme');
  const condition = pickCyclic(CONDITIONS, day, 'condition');

  // Three materials, always including at least one sturdy one.
  const allMaterials: MaterialId[] = [
    'brick',
    'timber',
    'steel',
    'glass',
    'stone',
    'bamboo',
  ];
  let materials = shuffled(allMaterials, rng).slice(0, 3);
  if (!materials.some((m) => STURDY.includes(m))) {
    materials[0] = STURDY[rngInt(rng, 0, STURDY.length - 1)]!;
  }
  materials = materials.sort(
    (a, b) => MATERIALS[b].sturdiness - MATERIALS[a].sturdiness
  );

  // Three decorations, preferring at least one that matches the theme.
  const allDecor: DecorId[] = [
    'flowerbox',
    'flag',
    'lights',
    'awning',
    'birdhouse',
    'mural',
    'solar',
    'lantern',
  ];
  const decorPool = shuffled(allDecor, rng);
  const themed = decorPool.find((d) => DECORATIONS[d].tags.includes(theme.tag));
  const decorations = themed
    ? [themed, ...decorPool.filter((d) => d !== themed).slice(0, 2)]
    : decorPool.slice(0, 3);

  const targets = {
    height: rngInt(rng, 8, 13) * 3,
    stability: rngInt(rng, 14, 16) * 5 + condition.stabilityTargetBonus,
    style: rngInt(rng, 5, 8) * 4,
  };

  return { dateKey, theme, condition, materials, decorations, targets };
};
