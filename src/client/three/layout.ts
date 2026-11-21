import {
  CELL,
  DIR_OFFSET,
  STOREY,
  type PieceSpec,
} from '../../shared/structure';

// World layout shared by the renderer and the character physics.

/** Top of a poured foundation pad: the ground floor of every building. */
export const PAD_TOP = 0.35;

/** Where the tower crane's mast stands (world x, z). */
export const CRANE_POS: [number, number] = [11, -7.5];

/** The stack of steel beams and columns the crane picks from (world x, z). */
export const STACK_POS: [number, number] = [16.5, -9];

// Pieces meet with no gaps: walls, beams, slabs and footings fill their whole
// edge or cell, and a column just wraps around whatever meets at its corner.
// Where two touching pieces would share a surface, one of them is offset by
// NUDGE (2 mm): far too small to see, but enough that the GPU never has to
// decide between two faces in the same place (that is what flickers).
export const NUDGE = 0.002;
export const COLUMN = 0.45;
export const BEAM_H = 0.4;
export const BEAM_W = 0.3;
export const BEAM_LEN = CELL;
export const SLAB_H = 0.25;
export const WALL_T = 0.25;
/**
 * Walls fill the whole storey, so a slab can sit right on them. Where a beam
 * runs along the same edge it wraps over the wall's top. Two nudges short, so
 * the top never lines up with a beam's or a corner post's.
 */
export const WALL_H = STOREY - 2 * NUDGE;
export const WALL_LEN = CELL;
/** Square post that fills the outside corner where two walls meet without a column. */
export const CORNER = WALL_T + 2 * NUDGE;
/** Corner posts run from just below the floor to between the wall and beam tops. */
export const CORNER_BOTTOM = -2 * NUDGE;
export const CORNER_TOP = STOREY - 1.5 * NUDGE;
/** Enough steps that each rise (about 47 cm) stays under the worker's step-up height. */
export const STAIR_STEPS = 9;
export const STAIR_WIDTH = 2;

export type Box = {
  pos: [number, number, number];
  size: [number, number, number];
};

/** Where a piece sits in the world, and how big it is. */
export const pieceBox = (p: PieceSpec): Box => {
  const floor = PAD_TOP + p.level * STOREY;
  const cx = p.x * CELL + CELL / 2;
  const cz = p.z * CELL + CELL / 2;
  switch (p.kind) {
    case 'foundation':
      return {
        pos: [cx, PAD_TOP + 0.15, cz],
        size: [CELL, 0.5, CELL],
      };
    case 'column':
      // A hair taller than the storey, so its top never lines up with a beam's.
      return {
        pos: [p.x * CELL, floor + (STOREY + NUDGE) / 2, p.z * CELL],
        size: [COLUMN, STOREY + NUDGE, COLUMN],
      };
    case 'slab':
      return {
        pos: [cx, floor + STOREY + SLAB_H / 2, cz],
        size: [CELL, SLAB_H, CELL],
      };
    case 'beam': {
      // Beams along z sit a nudge lower, so crossing beams never share a top face.
      const y = floor + STOREY - BEAM_H / 2 - (p.dir === 'z' ? NUDGE : 0);
      return p.dir === 'x'
        ? { pos: [cx, y, p.z * CELL], size: [BEAM_LEN, BEAM_H, BEAM_W] }
        : { pos: [p.x * CELL, y, cz], size: [BEAM_W, BEAM_H, BEAM_LEN] };
    }
    case 'wall': {
      // Same trick for walls meeting at a corner.
      const y = floor + WALL_H / 2 - (p.dir === 'z' ? NUDGE : 0);
      return p.dir === 'x'
        ? { pos: [cx, y, p.z * CELL], size: [WALL_LEN, WALL_H, WALL_T] }
        : { pos: [p.x * CELL, y, cz], size: [WALL_T, WALL_H, WALL_LEN] };
    }
    case 'stairs': {
      // The whole flight, from this floor up to the top of the slab above.
      const h = STOREY + SLAB_H;
      return { pos: [cx, floor + h / 2, cz], size: [CELL, h, CELL] };
    }
    case 'lean': {
      // Bounding box of a column from corner (x, z) up to the corner it leans to.
      const [dx, dz] = DIR_OFFSET[p.dir ?? 'x'];
      return {
        pos: [(p.x + dx / 2) * CELL, floor + STOREY / 2, (p.z + dz / 2) * CELL],
        size: [
          Math.abs(dx) * CELL + COLUMN,
          STOREY,
          Math.abs(dz) * CELL + COLUMN,
        ],
      };
    }
    case 'brace':
    case 'arch': {
      // A thin panel standing on the edge, filling the storey.
      const y = floor + STOREY / 2;
      return p.dir === 'x'
        ? { pos: [cx, y, p.z * CELL], size: [CELL, STOREY, 0.16] }
        : { pos: [p.x * CELL, y, cz], size: [0.16, STOREY, CELL] };
    }
    case 'spire':
      return {
        pos: [p.x * CELL, floor + SPIRE_H / 2, p.z * CELL],
        size: [0.7, SPIRE_H, 0.7],
      };
  }
};

/** A spire stands two storeys tall. */
export const SPIRE_H = STOREY * 2;

/** Points along a leaning column, from its foot to its head. */
const leanPath = (p: PieceSpec, t: number): [number, number, number] => {
  const [dx, dz] = DIR_OFFSET[p.dir ?? 'x'];
  return [
    (p.x + dx * t) * CELL,
    PAD_TOP + p.level * STOREY + STOREY * t,
    (p.z + dz * t) * CELL,
  ];
};

const LEAN_SEGMENTS = 6;

/**
 * The solid boxes a piece is made of: one for most pieces, one per step for
 * stairs. Each step is a block from the floor up, so walking up is just
 * stepping onto the next one.
 */
export const pieceBoxes = (p: PieceSpec): Box[] => {
  // Bracing, arches and spires are slim: the worker can slip past them.
  if (p.kind === 'brace' || p.kind === 'arch' || p.kind === 'spire') return [];
  if (p.kind === 'lean')
    // A leaning column is a short staircase of boxes along its slope.
    return Array.from({ length: LEAN_SEGMENTS }, (_, i) => ({
      pos: leanPath(p, (i + 0.5) / LEAN_SEGMENTS),
      size: [COLUMN, STOREY / LEAN_SEGMENTS + 0.05, COLUMN],
    }));
  if (p.kind !== 'stairs') return [pieceBox(p)];
  const floor = PAD_TOP + p.level * STOREY;
  const rise = (STOREY + SLAB_H) / STAIR_STEPS;
  const depth = CELL / STAIR_STEPS;
  const x0 = p.x * CELL;
  const z0 = p.z * CELL;
  const alongX = p.dir === 'x' || p.dir === '-x';
  const up = p.dir === 'x' || p.dir === 'z';
  return Array.from({ length: STAIR_STEPS }, (_, i) => {
    const h = (i + 1) * rise;
    // Distance of this step's middle from the cell edge the flight starts at.
    const t = up ? depth * (i + 0.5) : CELL - depth * (i + 0.5);
    return alongX
      ? {
          pos: [x0 + t, floor + h / 2, z0 + CELL / 2],
          size: [depth, h, STAIR_WIDTH],
        }
      : {
          pos: [x0 + CELL / 2, floor + h / 2, z0 + t],
          size: [STAIR_WIDTH, h, depth],
        };
  });
};
