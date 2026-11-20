import { MATERIALS } from '../../shared/content';
import type { Floor, TowerState } from '../../shared/rules';

/** Building footprint (m). */
export const TOWER_W = 12;
export const TOWER_D = 9;

export type Placed = { f: Floor; i: number; y: number; h: number };

/** Stack floors from the ground up; `top` is the roof height in meters. */
export const placeFloors = (
  tower: TowerState
): { placed: Placed[]; top: number } => {
  let y = 0;
  const placed = tower.floors.map((f, i) => {
    const h = MATERIALS[f.material].height;
    const p = { f, i, y, h };
    y += h;
    return p;
  });
  return { placed, top: y };
};
