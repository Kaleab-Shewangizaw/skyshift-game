import {
  MAX_LEVEL,
  STOREY,
  snapToGrid,
  type PieceSpec,
} from '../../shared/structure';
import { CRANE_POS, PAD_TOP, STACK_POS } from '../three/layout';

// The tower crane, as live state. Like `controls`, it changes every frame and
// is read by the 3D scene directly, so it lives outside React.
//
// The jib turns about the mast (`slew`, radians; 0 points along world +x and
// positive angles turn toward world -z). The trolley runs along the jib
// (`trolley`, meters from the mast) and the hook hangs at height `hookY`.

export type CraneLoad = 'beam' | 'column';

export type CraneState = {
  slew: number;
  trolley: number;
  hookY: number;
  load: CraneLoad | null;
};

export const JIB_LENGTH = 26;
const MIN_REACH = 4;
const MAX_REACH = 24;
const SLEW_SPEED = 0.55;
const TROLLEY_SPEED = 6;
const HOIST_SPEED = 6;
const HOOK_MIN = 0.8;

/** Mast height for a building whose top is `buildingTop` meters up. */
export const mastHeight = (buildingTop: number): number =>
  Math.max(32, buildingTop + 14);

const state: CraneState = {
  slew: 2.6,
  trolley: 10,
  hookY: 8,
  load: null,
};

/** Read-only view of the crane for rendering. */
export const crane = (): Readonly<CraneState> => state;

export const hookWorld = (): { x: number; y: number; z: number } => ({
  x: CRANE_POS[0] + Math.cos(state.slew) * state.trolley,
  y: state.hookY,
  z: CRANE_POS[1] - Math.sin(state.slew) * state.trolley,
});

/** Move the crane by one frame of input: x turns, y runs the trolley, hoist lifts. */
export const stepCrane = (
  dt: number,
  turn: number,
  reach: number,
  hoist: number,
  buildingTop: number
) => {
  state.slew -= turn * SLEW_SPEED * dt;
  state.trolley = clamp(
    state.trolley + reach * TROLLEY_SPEED * dt,
    MIN_REACH,
    MAX_REACH
  );
  state.hookY = clamp(
    state.hookY + hoist * HOIST_SPEED * dt,
    HOOK_MIN,
    mastHeight(buildingTop) - 3
  );
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Is the empty hook low enough over the steel stack to pick something up? */
export const hookAtStack = (): boolean => {
  const h = hookWorld();
  return (
    state.load === null &&
    Math.hypot(h.x - STACK_POS[0], h.z - STACK_POS[1]) < 4 &&
    h.y < 4.5
  );
};

export const attachLoad = (load: CraneLoad) => {
  state.load = load;
};

export const dropLoad = () => {
  state.load = null;
};

/** How far below the hook the middle of a hanging piece sits. */
export const HANG: Record<CraneLoad, number> = { beam: 0.9, column: 2.3 };

/**
 * The grid slot the hanging piece would drop into: the nearest slot of its
 * kind, on the storey closest to where it hangs.
 */
export const craneTarget = (): PieceSpec | null => {
  if (!state.load) return null;
  const h = hookWorld();
  const cy = h.y - HANG[state.load];
  // Beams sit at the top of their storey; columns fill it.
  const mid = state.load === 'beam' ? STOREY - 0.2 : STOREY / 2;
  const level = clamp(Math.round((cy - PAD_TOP - mid) / STOREY), 0, MAX_LEVEL);
  return snapToGrid(state.load, h.x, h.z, level, null);
};
