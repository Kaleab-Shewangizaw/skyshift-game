import { useEffect } from 'react';

/**
 * Live input for the worker, written by the on-screen joystick and the
 * keyboard and read every frame by the 3D scene. It is a plain mutable object
 * on purpose: input changes 60 times a second and must not re-render React.
 */
export type Controls = {
  /** Joystick, -1..1. stickY > 0 is forward (away from the camera). */
  stickX: number;
  stickY: number;
  /** Keyboard direction, same convention. */
  keyX: number;
  keyY: number;
  /** Set by a jump press; the scene clears it once used. */
  jump: boolean;
  /** Crane hoist from the ▲▼ buttons and R/F keys: 1 up, -1 down. */
  hoist: number;
  keyHoist: number;
};

/** The one set of live controls for this page. */
export const controls: Controls = {
  stickX: 0,
  stickY: 0,
  keyX: 0,
  keyY: 0,
  jump: false,
  hoist: 0,
  keyHoist: 0,
};

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const UP = new Set(['KeyR', 'PageUp']);
const DOWN = new Set(['KeyF', 'PageDown']);

/** WASD / arrows to walk or steer the crane, Space to jump, R/F to hoist. */
export const useKeyboard = (enabled: boolean) => {
  useEffect(() => {
    if (!enabled) return;
    const down = new Set<string>();
    const sync = () => {
      const has = (keys: Set<string>) => [...keys].some((k) => down.has(k));
      controls.keyY = (has(FORWARD) ? 1 : 0) - (has(BACK) ? 1 : 0);
      controls.keyX = (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0);
      controls.keyHoist = (has(UP) ? 1 : 0) - (has(DOWN) ? 1 : 0);
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        controls.jump = true;
        e.preventDefault();
      }
      down.add(e.code);
      sync();
    };
    const onUp = (e: KeyboardEvent) => {
      down.delete(e.code);
      sync();
    };
    const clear = () => {
      down.clear();
      sync();
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', clear);
      clear();
    };
  }, [enabled]);
};

/** Ask the worker to jump on the next frame. */
export const pressJump = () => {
  controls.jump = true;
};

/** True once per jump press; clears it. */
export const takeJump = (): boolean => {
  const j = controls.jump;
  controls.jump = false;
  return j;
};

/** Hold-to-hoist buttons: 1 raises the hook, -1 lowers it, 0 stops. */
export const setHoist = (v: number) => {
  controls.hoist = v;
};

/** A pending jump to another part of the city (world x, z), used by the travel buttons. */
let teleport: { x: number; z: number } | null = null;

export const requestTeleport = (x: number, z: number) => {
  teleport = { x, z };
};

/** The pending teleport, once; clears it. */
export const takeTeleport = (): { x: number; z: number } | null => {
  const t = teleport;
  teleport = null;
  return t;
};
