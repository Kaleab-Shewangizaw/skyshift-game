import { CELL, STOREY, type PieceSpec } from '../../shared/structure';

// World layout shared by the renderer and the character physics.

/** Top of a poured foundation pad: the ground floor of every building. */
export const PAD_TOP = 0.35;

/** Where the tower crane's mast stands (world x, z). */
export const CRANE_POS: [number, number] = [11, -7.5];

/** The stack of steel beams and columns the crane picks from (world x, z). */
export const STACK_POS: [number, number] = [16.5, -9];

const COLUMN = 0.45;
const BEAM_H = 0.4;
const SLAB_H = 0.25;
const WALL_T = 0.25;

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
        size: [CELL - 0.2, 0.5, CELL - 0.2],
      };
    case 'column':
      return {
        pos: [p.x * CELL, floor + STOREY / 2, p.z * CELL],
        size: [COLUMN, STOREY, COLUMN],
      };
    case 'slab':
      return {
        pos: [cx, floor + STOREY + SLAB_H / 2, cz],
        size: [CELL, SLAB_H, CELL],
      };
    case 'beam': {
      const y = floor + STOREY - BEAM_H / 2;
      return p.dir === 'x'
        ? { pos: [cx, y, p.z * CELL], size: [CELL + COLUMN, BEAM_H, 0.35] }
        : { pos: [p.x * CELL, y, cz], size: [0.35, BEAM_H, CELL + COLUMN] };
    }
    case 'wall': {
      // From the floor up to the underside of a beam, between the columns.
      const h = STOREY - BEAM_H;
      const y = floor + h / 2;
      const len = CELL - COLUMN;
      return p.dir === 'x'
        ? { pos: [cx, y, p.z * CELL], size: [len, h, WALL_T] }
        : { pos: [p.x * CELL, y, cz], size: [WALL_T, h, len] };
    }
    case 'stairs': {
      // The whole flight, from this floor up to the top of the slab above.
      const h = STOREY + SLAB_H;
      return { pos: [cx, floor + h / 2, cz], size: [CELL, h, CELL] };
    }
  }
};

const STEPS = 7;
const STAIR_WIDTH = 2;

/**
 * The solid boxes a piece is made of: one for most pieces, one per step for
 * stairs. Each step is a block from the floor up, so walking up is just
 * stepping onto the next one.
 */
export const pieceBoxes = (p: PieceSpec): Box[] => {
  if (p.kind !== 'stairs') return [pieceBox(p)];
  const floor = PAD_TOP + p.level * STOREY;
  const rise = (STOREY + SLAB_H) / STEPS;
  const depth = CELL / STEPS;
  const x0 = p.x * CELL;
  const z0 = p.z * CELL;
  const alongX = p.dir === 'x' || p.dir === '-x';
  const up = p.dir === 'x' || p.dir === 'z';
  return Array.from({ length: STEPS }, (_, i) => {
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
