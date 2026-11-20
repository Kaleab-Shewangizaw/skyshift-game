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
};

/** The one set of live controls for this page. */
export const controls: Controls = {
  stickX: 0,
  stickY: 0,
  keyX: 0,
  keyY: 0,
  jump: false,
};

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);

/** WASD / arrow keys to walk, Space to jump. Off while `enabled` is false. */
export const useKeyboard = (enabled: boolean) => {
  useEffect(() => {
    if (!enabled) return;
    const down = new Set<string>();
    const sync = () => {
      const has = (keys: Set<string>) => [...keys].some((k) => down.has(k));
      controls.keyY = (has(FORWARD) ? 1 : 0) - (has(BACK) ? 1 : 0);
      controls.keyX = (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0);
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
