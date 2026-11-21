import type { CraneLoadId } from '../../shared/structure';
import { CRANE_POS, STACK_POS } from '../three/layout';

// The tower crane, as live state. Like `controls`, it changes every frame and
// is read by the 3D scene directly, so it lives outside React.
//
// The jib turns about the mast (`slew`, radians; 0 points along world +x and
// positive angles turn toward world -z). The trolley runs along the jib
// (`trolley`, meters from the mast) and the hook hangs at height `hookY`.

/** The crane carries one load: beams, columns, or a mix (see CRANE_LOADS). */
export type CraneLoad = CraneLoadId;

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

type Pose = { slew: number; trolley: number; hookY: number };

/** Where the autopilot is flying the hook, if anywhere. Any manual input cancels it. */
let autopilot: Pose | null = null;
/** Where the hook was when the last load was dropped. */
let lastDrop: Pose | null = null;

const AUTO_SLEW = 1.6;
const AUTO_TROLLEY = 16;
const AUTO_HOIST = 18;

/** Move `v` toward `to` by at most `max`. */
const toward = (v: number, to: number, max: number) =>
  v + clamp(to - v, -max, max);

/** Shortest signed turn from angle a to angle b. */
const turnBetween = (a: number, b: number) =>
  Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** Swing back over the steel stack, hook low enough to pick up. */
export const flyToStack = () => {
  const dx = STACK_POS[0] - CRANE_POS[0];
  const dz = STACK_POS[1] - CRANE_POS[1];
  autopilot = {
    slew: Math.atan2(-dz, dx),
    trolley: clamp(Math.hypot(dx, dz), MIN_REACH, MAX_REACH),
    hookY: 6,
  };
};

/** Fly back to where the last load was dropped. */
export const flyToLastDrop = () => {
  if (lastDrop) autopilot = { ...lastDrop };
};

export const hasLastDrop = (): boolean => lastDrop !== null;

/** True while the autopilot is moving the crane. */
export const flying = (): boolean => autopilot !== null;

/** Move the crane by one frame of input: x turns, y runs the trolley, hoist lifts. */
export const stepCrane = (
  dt: number,
  turn: number,
  reach: number,
  hoist: number,
  buildingTop: number
) => {
  if (turn !== 0 || reach !== 0 || hoist !== 0) autopilot = null;
  const auto = autopilot;
  if (auto) {
    const d = turnBetween(state.slew, auto.slew);
    state.slew += clamp(d, -AUTO_SLEW * dt, AUTO_SLEW * dt);
    state.trolley = toward(state.trolley, auto.trolley, AUTO_TROLLEY * dt);
    state.hookY = toward(
      state.hookY,
      clamp(auto.hookY, HOOK_MIN, mastHeight(buildingTop) - 3),
      AUTO_HOIST * dt
    );
    const there =
      Math.abs(turnBetween(state.slew, auto.slew)) < 0.002 &&
      Math.abs(state.trolley - auto.trolley) < 0.02 &&
      Math.abs(state.hookY - auto.hookY) < 0.05;
    if (there) autopilot = null;
    return;
  }
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

/** Let go of the load. After a real drop, remember where for "Last drop". */
export const dropLoad = (delivered: boolean) => {
  if (delivered)
    lastDrop = { slew: state.slew, trolley: state.trolley, hookY: state.hookY };
  state.load = null;
};
