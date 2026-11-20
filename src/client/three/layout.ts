import { CELL, STOREY, type PieceSpec } from '../../shared/structure';

// World layout shared by the renderer and the character physics.

/** Top of a poured foundation pad: the ground floor of every building. */
export const PAD_TOP = 0.35;

/** Where the tower crane's mast stands (world x, z). */
export const CRANE_POS: [number, number] = [11, -7.5];

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
  }
};
