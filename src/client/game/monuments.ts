import { dailyBlueprint } from '../../shared/blueprints';
import type { SkylineEntry } from '../../shared/live';
import { CELL, type Piece } from '../../shared/structure';

// Finished daily builds stand as monuments in a ring outside the city, each
// on a stone plinth. Their pieces are regenerated from the day's blueprint,
// so the server only stores which days were finished.

export type Plinth = { x: number; z: number; w: number; d: number };

/** Distance (m) from the middle of the city to the monument ring. */
const RING = 150;
const SLOTS = 8;

export const monuments = (
  skyline: readonly SkylineEntry[]
): { pieces: Piece[]; plinths: Plinth[] } => {
  const pieces: Piece[] = [];
  const plinths: Plinth[] = [];
  skyline.slice(0, SLOTS).forEach((entry, i) => {
    const bp = dailyBlueprint(entry.dateKey);
    if (bp.pieces.length === 0) return;
    const xs = bp.pieces.map((p) => p.x);
    const zs = bp.pieces.map((p) => p.z);
    const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
    const [minZ, maxZ] = [Math.min(...zs), Math.max(...zs)];
    const angle = ((i + 0.5) / SLOTS) * Math.PI * 2;
    // Shift the whole build by whole cells so it centers on its slot.
    const dx = Math.round((RING * Math.cos(angle)) / CELL - (minX + maxX) / 2);
    const dz = Math.round((RING * Math.sin(angle)) / CELL - (minZ + maxZ) / 2);
    for (const p of bp.pieces)
      pieces.push({ ...p, x: p.x + dx, z: p.z + dz, by: entry.by, at: 0 });
    plinths.push({
      x: ((minX + maxX + 1) / 2 + dx) * CELL,
      z: ((minZ + maxZ + 1) / 2 + dz) * CELL,
      w: (maxX - minX + 3) * CELL,
      d: (maxZ - minZ + 3) * CELL,
    });
  });
  return { pieces, plinths };
};
