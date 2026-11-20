import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { slotKey, type PieceSpec } from '../../shared/structure';
import { controls } from '../game/controls';
import {
  crane,
  craneTarget,
  hookAtStack,
  hookWorld,
  stepCrane,
} from '../game/crane';

export type CraneAim = {
  /** The slot the hanging piece would drop into, if it carries one. */
  target: PieceSpec | null;
  /** The empty hook is low over the steel stack. */
  atStack: boolean;
};

type Props = {
  buildingTop: number;
  onAim: (aim: CraneAim) => void;
};

/**
 * In the cab: the joystick slews the jib (left/right) and runs the trolley
 * (up/down), the hoist buttons raise and lower the hook. The camera orbits
 * the hook so the player can line the load up from any side.
 */
export const CraneOperator = ({ buildingTop, onAim }: Props) => {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const orbit = useRef<OrbitControls | null>(null);
  const last = useRef('');

  useEffect(() => {
    const h = hookWorld();
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.12;
    c.enablePan = false;
    c.minDistance = 8;
    c.maxDistance = 80;
    c.minPolarAngle = 0.2;
    c.maxPolarAngle = 1.45;
    c.target.set(h.x, h.y, h.z);
    // Start out from the mast, looking over the hook at the site.
    camera.position.set(h.x + 10, h.y + 12, h.z + 18);
    c.update();
    orbit.current = c;
    return () => {
      c.dispose();
      orbit.current = null;
    };
  }, [camera, gl]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const c = orbit.current;
    const before = hookWorld();
    const turn = THREE.MathUtils.clamp(controls.stickX + controls.keyX, -1, 1);
    const reach = THREE.MathUtils.clamp(controls.stickY + controls.keyY, -1, 1);
    const hoist = THREE.MathUtils.clamp(
      controls.hoist + controls.keyHoist,
      -1,
      1
    );
    stepCrane(dt, turn, reach, hoist, buildingTop);
    const h = hookWorld();
    if (c) {
      camera.position.add(
        new THREE.Vector3(h.x - before.x, h.y - before.y, h.z - before.z)
      );
      c.target.set(h.x, h.y, h.z);
      c.update();
    }

    const target = craneTarget();
    const atStack = hookAtStack();
    const key = `${target ? slotKey(target) : '-'}|${atStack}|${crane().load ?? ''}`;
    if (key !== last.current) {
      last.current = key;
      onAim({ target, atStack });
    }
  });

  return null;
};
