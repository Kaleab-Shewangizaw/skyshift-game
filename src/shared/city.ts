import { hashString, makeRng } from './rng.ts';

// The city around the construction site is a grid of square tiles.
// Tile (0, 0) is centered on the world origin; tile (x, z) covers
// [x*TILE - TILE/2, x*TILE + TILE/2] on each axis.
//
// Every 4th row/column is a road (…, -6, -2, 2, 6, …), so each city block is
// 3×3 tiles. The block at the origin starts as the construction site; players
// grow the site by demolishing tiles next to it.

export const TILE = 12;
/** Tiles from -CITY_RADIUS to CITY_RADIUS on both axes. */
export const CITY_RADIUS = 9;
/** Upper bound on the site, including the starting 3×3 block. */
export const MAX_SITE_TILES = 30;

export type TileKind = 'lot' | 'road' | 'building' | 'park';

export type Tile = {
  x: number;
  z: number;
  kind: TileKind;
  /** Building height in meters (0 for anything else). */
  height: number;
  color: string;
  seed: number;
};

export const FACADE_COLORS = [
  '#e8d5b9',
  '#c9d6df',
  '#f2c6a0',
  '#d8c3e0',
  '#b9d7c3',
  '#f0e2a8',
  '#c7b8a6',
  '#a9c2dd',
  '#e7b7b0',
];

export const tileKey = (x: number, z: number): string => `${x},${z}`;

export const parseTileKey = (key: string): { x: number; z: number } | null => {
  const m = /^(-?\d{1,2}),(-?\d{1,2})$/.exec(key);
  if (!m) return null;
  const x = Number(m[1]);
  const z = Number(m[2]);
  return inCity(x, z) ? { x, z } : null;
};

export const inCity = (x: number, z: number): boolean =>
  Number.isInteger(x) &&
  Number.isInteger(z) &&
  Math.abs(x) <= CITY_RADIUS &&
  Math.abs(z) <= CITY_RADIUS;

const mod4 = (i: number) => ((i % 4) + 4) % 4;
export const isRoadLine = (i: number): boolean => mod4(i) === 2;

/** Which city block a tile index belongs to (blocks are 4 tiles apart). */
const blockOf = (i: number) => Math.round(i / 4);

export const isStartingLot = (x: number, z: number): boolean =>
  Math.abs(x) <= 1 && Math.abs(z) <= 1;

/** The tile as the city was before anyone demolished anything. Deterministic. */
export const baseTile = (x: number, z: number): Tile => {
  const seed = hashString(`skyshift:tile:${x},${z}`);
  if (isStartingLot(x, z))
    return { x, z, kind: 'lot', height: 0, color: '#b98a5a', seed };
  if (isRoadLine(x) || isRoadLine(z))
    return { x, z, kind: 'road', height: 0, color: '#4a4d55', seed };
  const rng = makeRng(seed);
  const ring = Math.max(Math.abs(blockOf(x)), Math.abs(blockOf(z)));
  // Low neighbors keep the view onto the site clear; outer blocks are the skyline.
  if (ring <= 1 && rng() < 0.14)
    return { x, z, kind: 'park', height: 0, color: '#7fb069', seed };
  const storeys =
    ring <= 1 ? 2 + Math.floor(rng() * 3) : 7 + Math.floor(rng() * 12);
  return {
    x,
    z,
    kind: 'building',
    height: storeys * 3.5,
    color: FACADE_COLORS[Math.floor(rng() * FACADE_COLORS.length)] ?? '#ddd',
    seed,
  };
};

/** The tile as it is today, given the demolished tiles in `site`. */
export const tileAt = (site: readonly string[], x: number, z: number): Tile => {
  const base = baseTile(x, z);
  return base.kind !== 'lot' && site.includes(tileKey(x, z))
    ? { ...base, kind: 'lot', height: 0 }
    : base;
};

export const isLotTile = (
  site: readonly string[],
  x: number,
  z: number
): boolean => isStartingLot(x, z) || site.includes(tileKey(x, z));

/** All construction-site tiles: the starting block plus everything demolished. */
export const siteTiles = (
  site: readonly string[]
): { x: number; z: number }[] => {
  const out: { x: number; z: number }[] = [];
  for (let x = -1; x <= 1; x++)
    for (let z = -1; z <= 1; z++) out.push({ x, z });
  for (const key of site) {
    const t = parseTileKey(key);
    if (t && !isStartingLot(t.x, t.z)) out.push(t);
  }
  return out;
};

const NEIGHBORS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const touchesSite = (site: readonly string[], x: number, z: number): boolean =>
  NEIGHBORS.some(([dx, dz]) => isLotTile(site, x + dx, z + dz));

export type DemolishCheck =
  { ok: true; tile: Tile } | { ok: false; reason: string };

/** Can this tile be demolished to grow the site? */
export const canDemolish = (
  site: readonly string[],
  x: number,
  z: number
): DemolishCheck => {
  if (!inCity(x, z))
    return { ok: false, reason: "That's outside the city limits." };
  const tile = tileAt(site, x, z);
  if (tile.kind === 'lot')
    return { ok: false, reason: "That's already part of the site." };
  if (!touchesSite(site, x, z))
    return {
      ok: false,
      reason: 'You can only clear land right next to the site.',
    };
  if (siteTiles(site).length >= MAX_SITE_TILES) {
    return {
      ok: false,
      reason: 'The site is as big as the permit allows. Time to build!',
    };
  }
  return { ok: true, tile };
};

/** Every tile that could be demolished right now (for highlighting). */
export const demolishCandidates = (site: readonly string[]): Tile[] => {
  if (siteTiles(site).length >= MAX_SITE_TILES) return [];
  const seen = new Set<string>();
  const out: Tile[] = [];
  for (const { x, z } of siteTiles(site)) {
    for (const [dx, dz] of NEIGHBORS) {
      const nx = x + dx;
      const nz = z + dz;
      const key = tileKey(nx, nz);
      if (seen.has(key)) continue;
      seen.add(key);
      const check = canDemolish(site, nx, nz);
      if (check.ok) out.push(check.tile);
    }
  }
  return out;
};

// ---------- Buildable pads ----------
//
// Site ground starts rough: bare dirt on the starting block, rubble wherever
// something was demolished. Players choose which tiles to level and pour a
// foundation pad on; only pads can carry a building. The center tile, where
// the tower stands, starts with a pad.

export const STARTING_PAD = tileKey(0, 0);

export const isPad = (pads: readonly string[], x: number, z: number): boolean =>
  (x === 0 && z === 0) || pads.includes(tileKey(x, z));

/** Every buildable tile: the starting pad plus everything prepared. */
export const padTiles = (
  pads: readonly string[]
): { x: number; z: number }[] => {
  const out = [{ x: 0, z: 0 }];
  for (const key of pads) {
    const t = parseTileKey(key);
    if (t && key !== STARTING_PAD) out.push(t);
  }
  return out;
};

export type Ground = 'dirt' | 'rubble';

/** What is lying on a site tile before it gets a pad. */
export const groundAt = (
  site: readonly string[],
  x: number,
  z: number
): Ground => (site.includes(tileKey(x, z)) ? 'rubble' : 'dirt');

export const describeGround = (g: Ground): string =>
  g === 'rubble' ? 'the demolition rubble' : 'this patch of dirt';

export type PrepareCheck =
  { ok: true; ground: Ground } | { ok: false; reason: string };

/** Can this tile be leveled into a buildable pad? */
export const canPrepare = (
  site: readonly string[],
  pads: readonly string[],
  x: number,
  z: number
): PrepareCheck => {
  if (!inCity(x, z) || !isLotTile(site, x, z))
    return {
      ok: false,
      reason: 'Only ground inside the site fence can be made buildable.',
    };
  if (isPad(pads, x, z))
    return { ok: false, reason: 'That spot is already buildable.' };
  return { ok: true, ground: groundAt(site, x, z) };
};

/** Site tiles that don't have a pad yet (for highlighting). */
export const prepareCandidates = (
  site: readonly string[],
  pads: readonly string[]
): { x: number; z: number }[] =>
  siteTiles(site).filter((t) => !isPad(pads, t.x, t.z));

export const describeTile = (t: Tile): string => {
  if (t.kind === 'road') return 'a stretch of road';
  if (t.kind === 'park') return 'a little park';
  if (t.kind === 'building')
    return `a ${Math.round(t.height / 3.5)}-storey building`;
  return 'the site';
};

/** World-space center of a tile. */
export const tileCenter = (x: number, z: number): [number, number] => [
  x * TILE,
  z * TILE,
];

/** Tile containing a world-space point. */
export const tileFromWorld = (
  wx: number,
  wz: number
): { x: number; z: number } => ({
  x: Math.round(wx / TILE),
  z: Math.round(wz / TILE),
});
