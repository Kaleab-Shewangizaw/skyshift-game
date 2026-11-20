import type { SteelKind } from '../../shared/structure';
import { CRANE_POS, STACK_POS } from '../three/layout';

// The tower crane, as live state. Like `controls`, it changes every frame and
// is read by the 3D scene directly, so it lives outside React.
//
// The jib turns about the mast (`slew`, radians; 0 points along world +x and
// positive angles turn toward world -z). The trolley runs along the jib
// (`trolley`, meters from the mast) and the hook hangs at height `hookY`.

/** The crane carries a whole pallet of beams or columns. */
export type CraneLoad = SteelKind;

export type CraneState = {
  slew: number;
  trolley: number;
  hookY: number;
  load: CraneLoad | null;
};

export const JIB_LENGTH = 26;
const MIN_REACH = 4;
const MAX_REACH = 24;
const SLEW_SPEED = 1.1;
const TROLLEY_SPEED = 11;
const HOIST_SPEED = 12;
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

/** Is the empty hook roughly over the steel stack? No need to line it up exactly. */
export const hookAtStack = (): boolean => {
  const h = hookWorld();
  return (
    state.load === null &&
    Math.hypot(h.x - STACK_POS[0], h.z - STACK_POS[1]) < 6 &&
    h.y < 14
  );
};

export const attachLoad = (load: CraneLoad) => {
  state.load = load;
};

export const dropLoad = () => {
  state.load = null;
};
