import {
  cottage,
  planAt,
  house,
  latticeTower,
  pavilion,
  progressOf,
  watchtower,
  type Blueprint,
} from './blueprints.ts';
import { tileKey } from './city.ts';
import {
  canPlace,
  canRemove,
  cellTile,
  describePiece,
  slotKey,
  touchingCells,
  type Piece,
  type PieceSpec,
} from './structure.ts';

// Progression: every player owns a plot, one city block (3 × 3 tiles), in the
// post's shared city. They start with one tile and work through levels: each
// level is a blueprint on their land. Finishing one pays a bonus and the
// building then earns rent every hour. Bigger buildings need more land, which
// costs coins. Steel is carried by hand at any height on plots.

/** City blocks are 4 tiles apart; block (bx, bz) covers tiles 4bx-1 .. 4bx+1. */
export type Block = { bx: number; bz: number };

/** Every block except the middle one (today's build), nearest first. */
export const PLOT_BLOCKS: Block[] = (() => {
  const out: Block[] = [];
  for (let bx = -2; bx <= 2; bx++)
    for (let bz = -2; bz <= 2; bz++) if (bx || bz) out.push({ bx, bz });
  const ring = (b: Block) => Math.max(Math.abs(b.bx), Math.abs(b.bz));
  return out.sort(
    (a, b) =>
      ring(a) - ring(b) ||
      Math.hypot(a.bx, a.bz) - Math.hypot(b.bx, b.bz) ||
      a.bx - b.bx ||
      a.bz - b.bz
  );
})();

export const blockKey = (b: Block) => `${b.bx},${b.bz}`;

/** City tile for local tile (i, j), 0..2 each, of a block. */
export const blockTile = (b: Block, i: number, j: number) =>
  tileKey(4 * b.bx - 1 + i, 4 * b.bz - 1 + j);

/** Grid cell of a block's local cell (0..11 each way). */
const blockCell = (b: Block, cx: number, cz: number): [number, number] => [
  16 * b.bx - 6 + cx,
  16 * b.bz - 6 + cz,
];

export type Level = {
  /** Blueprint for this level, placed on the given block. */
  blueprint: (b: Block) => Blueprint;
  /** Local tiles (i, j) of the block the building needs. */
  tiles: [number, number][];
  /** Coins paid when it's finished. */
  bonus: number;
  /** Coins per hour it earns from then on. */
  rent: number;
};

const at = (b: Block, cx: number, cz: number) => blockCell(b, cx, cz);

export const LEVELS: Level[] = [
  {
    blueprint: (b) => cottage(...at(b, 1, 1), 'brick'),
    tiles: [[0, 0]],
    bonus: 60,
    rent: 6,
  },
  {
    blueprint: (b) => pavilion(...at(b, 5, 1)),
    tiles: [[1, 0]],
    bonus: 100,
    rent: 12,
  },
  {
    blueprint: (b) => house(...at(b, 9, 1), 'stone'),
    tiles: [[2, 0]],
    bonus: 150,
    rent: 20,
  },
  {
    blueprint: (b) => watchtower(...at(b, 1, 5)),
    tiles: [[0, 1]],
    bonus: 220,
    rent: 30,
  },
  {
    blueprint: (b) => latticeTower(...at(b, 3, 4)),
    tiles: [
      [0, 1],
      [1, 1],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ],
    bonus: 400,
    rent: 60,
  },
];

export type Plot = {
  owner: string;
  block: Block;
  /** City tile keys owned. */
  tiles: string[];
  /** Index into LEVELS of the level being built; LEVELS.length when all are done. */
  level: number;
  pieces: Piece[];
  /** When rent was last paid out (ms). */
  rentAt: number;
};

export const newPlot = (owner: string, block: Block, now: number): Plot => ({
  owner,
  block,
  tiles: [blockTile(block, 0, 0)],
  level: 0,
  pieces: [],
  rentAt: now,
});

/** The level a plot is working on, or null when every level is done. */
export const currentLevel = (p: Plot): Level | null => LEVELS[p.level] ?? null;

/** Tiles the current level needs that the player doesn't own yet. */
export const tilesNeeded = (p: Plot): string[] => {
  const lvl = currentLevel(p);
  if (!lvl) return [];
  return lvl.tiles
    .map(([i, j]) => blockTile(p.block, i, j))
    .filter((t) => !p.tiles.includes(t));
};

/** Price of the next tile: each one costs a little more than the last. */
export const landPrice = (p: Plot): number => 40 + 25 * (p.tiles.length - 1);

/** Coins per hour from every finished level. */
export const rentRate = (p: Plot): number =>
  LEVELS.slice(0, p.level).reduce((n, l) => n + l.rent, 0);

/** Rent earned since it was last collected (whole coins), and the new collection time. */
export const rentDue = (
  p: Plot,
  now: number
): { coins: number; rentAt: number } => {
  const rate = rentRate(p);
  if (rate === 0) return { coins: 0, rentAt: now };
  const hours = Math.max(0, now - p.rentAt) / 3_600_000;
  const coins = Math.floor(hours * rate);
  // Keep the leftover fraction of an hour for next time.
  return { coins, rentAt: p.rentAt + (coins / rate) * 3_600_000 };
};

/** Which plot (if any) a piece's cells fall on. */
export const plotAt = (
  plots: readonly Plot[],
  spec: PieceSpec
): Plot | undefined => {
  const tiles = touchingCells(spec).map(
    ([cx, cz]) => `${cellTile(cx)},${cellTile(cz)}`
  );
  return plots.find((p) => tiles.some((t) => p.tiles.includes(t)));
};

type Result<T> = ({ ok: true } & T) | { ok: false; reason: string };

/** Buy the next tile the current level needs. */
export const buyTile = (
  p: Plot,
  coins: number
): Result<{ plot: Plot; price: number }> => {
  const next = tilesNeeded(p)[0];
  if (!next)
    return {
      ok: false,
      reason: 'You already own all the land this level needs.',
    };
  const price = landPrice(p);
  if (coins < price)
    return {
      ok: false,
      reason: `That tile costs 🪙 ${price}. Build and collect rent to save up.`,
    };
  return { ok: true, price, plot: { ...p, tiles: [...p.tiles, next] } };
};

/** Does `spec` fill a slot of the plot's current plan, exactly as planned? */
export const onPlotPlan = (p: Plot, spec: PieceSpec): boolean => {
  const lvl = currentLevel(p);
  if (!lvl || tilesNeeded(p).length > 0) return false;
  const want = planAt(lvl.blueprint(p.block), spec);
  return !!want && want.material === spec.material && want.dir === spec.dir;
};

/**
 * Place a piece on a plot. The owner may build anything on their land; a
 * helper (`by` someone else) may only add pieces from the owner's current
 * plan, so nobody can mess up a neighbor's build. Pieces from other plots
 * never block it. The level bonus always goes to the owner.
 */
export const placeOnPlot = (
  p: Plot,
  spec: PieceSpec,
  at: number,
  by: string = p.owner
): Result<{
  plot: Plot;
  bonus: number;
  finished: string | null;
  summary: string;
}> => {
  if (by !== p.owner && !onPlotPlan(p, spec))
    return {
      ok: false,
      reason: `On u/${p.owner}'s plot you can add pieces from their plan (the blue outline).`,
    };
  const check = canPlace(p.pieces, p.tiles, spec, null);
  if (!check.ok) return { ok: false, reason: check.reason };
  let plot: Plot = {
    ...p,
    pieces: [...p.pieces, { ...spec, by, at }],
  };
  const lvl = currentLevel(p);
  let bonus = 0;
  let finished: string | null = null;
  if (lvl) {
    const bp = lvl.blueprint(p.block);
    const prog = progressOf(bp, plot.pieces);
    if (prog.done === prog.total) {
      bonus = lvl.bonus;
      finished = bp.name;
      // Rent for the finished building starts now; earlier levels keep their clock.
      const due = rentDue(plot, at);
      plot = { ...plot, level: plot.level + 1, rentAt: due.rentAt };
    }
  }
  return {
    ok: true,
    plot,
    bonus,
    finished,
    summary: `placed ${describePiece(spec)}`,
  };
};

export const removeFromPlot = (
  p: Plot,
  slot: string,
  by: string = p.owner
): Result<{ plot: Plot }> => {
  const check = canRemove(p.pieces, slot, by, []);
  if (!check.ok) return { ok: false, reason: check.reason };
  // Pieces of finished levels stay: they're rented out.
  for (let i = 0; i < p.level; i++) {
    const bp = LEVELS[i]?.blueprint(p.block);
    if (bp?.pieces.some((q) => slotKey(q) === slot))
      return {
        ok: false,
        reason: 'That building is rented out. Tenants live there!',
      };
  }
  return {
    ok: true,
    plot: { ...p, pieces: p.pieces.filter((q) => q !== check.piece) },
  };
};

/** First free block for a new player, or null when the city is full. */
export const freeBlock = (plots: readonly Plot[]): Block | null =>
  PLOT_BLOCKS.find(
    (b) => !plots.some((p) => p.block.bx === b.bx && p.block.bz === b.bz)
  ) ?? null;
