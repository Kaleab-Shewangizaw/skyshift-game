import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  slotKey,
  snapToGrid,
  type PieceKind,
  type PieceSpec,
  type WallMaterial,
} from '../../shared/structure';
import { controls, takeJump } from '../game/controls';
import { CRANE_POS, PAD_TOP } from './layout';
import { step, storeyOf, type Body, type Collider } from './physics';

type Props = {
  colliders: readonly Collider[];
  /** False while another view (site overview) has the camera. */
  drive: boolean;
  kind: PieceKind;
  material: WallMaterial;
  /** Called when the spot in front of the worker changes. */
  onAim: (spec: PieceSpec, level: number) => void;
  /** Hidden while the worker sits in the crane cab. */
  visible: boolean;
  /** Called when the worker walks up to, or away from, the crane. */
  onNearCrane: (near: boolean) => void;
};

/** How far in front of the worker the build spot is (m). */
const REACH = 1.7;
const EYE = 1.5;

/**
 * The player's construction worker, driven by the joystick or keyboard, with
 * a third-person camera that follows. Drag the screen to look around,
 * pinch or scroll to zoom.
 */
export const Player = ({
  colliders,
  drive,
  kind,
  material,
  onAim,
  visible,
  onNearCrane,
}: Props) => {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const orbit = useRef<OrbitControls | null>(null);
  const body = useRef<Body>({
    x: 0,
    y: PAD_TOP,
    z: 3,
    vy: 0,
    heading: Math.PI,
    grounded: false,
    climbing: false,
  });
  const group = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Mesh>(null);
  const legR = useRef<THREE.Mesh>(null);
  const armL = useRef<THREE.Mesh>(null);
  const armR = useRef<THREE.Mesh>(null);
  const walkPhase = useRef(0);
  const lastAim = useRef('');
  const nearCrane = useRef(false);

  useEffect(() => {
    if (!drive) return;
    const b = body.current;
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.12;
    c.enablePan = false;
    c.minDistance = 4;
    c.maxDistance = 45;
    c.minPolarAngle = 0.25;
    c.maxPolarAngle = 1.5;
    c.rotateSpeed = 0.8;
    c.target.set(b.x, b.y + EYE, b.z);
    // Start behind the worker, looking over their shoulder.
    camera.position.set(
      b.x - Math.sin(b.heading) * 12,
      b.y + 7.5,
      b.z - Math.cos(b.heading) * 12
    );
    c.update();
    orbit.current = c;
    return () => {
      c.dispose();
      orbit.current = null;
    };
  }, [drive, camera, gl]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const b = body.current;
    const c = orbit.current;

    if (drive && c) {
      // Stick "up" walks away from the camera.
      let fx = c.target.x - camera.position.x;
      let fz = c.target.z - camera.position.z;
      const fl = Math.hypot(fx, fz) || 1;
      fx /= fl;
      fz /= fl;
      const sx = THREE.MathUtils.clamp(controls.stickX + controls.keyX, -1, 1);
      const sy = THREE.MathUtils.clamp(controls.stickY + controls.keyY, -1, 1);
      const px = b.x;
      const py = b.y;
      const pz = b.z;
      step(
        b,
        {
          moveX: fx * sy - fz * sx,
          moveZ: fz * sy + fx * sx,
          jump: takeJump(),
        },
        colliders,
        dt
      );
      // The camera rides along with the worker.
      camera.position.add(new THREE.Vector3(b.x - px, b.y - py, b.z - pz));
      c.target.set(b.x, b.y + EYE, b.z);
      c.update();

      const moving = Math.hypot(b.x - px, b.z - pz) / dt;
      walkPhase.current += dt * (b.climbing ? 9 : moving * 2.2);
    }

    const g = group.current;
    if (g) {
      g.position.set(b.x, b.y, b.z);
      // Turn smoothly toward the heading.
      let d = b.heading - g.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      g.rotation.y += d * Math.min(1, dt * 12);
    }
    const swing = Math.sin(walkPhase.current) * 0.7;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current)
      armL.current.rotation.x = b.climbing ? -2.6 + swing : -swing;
    if (armR.current)
      armR.current.rotation.x = b.climbing ? -2.6 - swing : swing;

    const near =
      Math.hypot(b.x - CRANE_POS[0], b.z - CRANE_POS[1]) < 4.5 && b.y < 2;
    if (near !== nearCrane.current) {
      nearCrane.current = near;
      onNearCrane(near);
    }

    // The build spot in front of the worker, on the floor they stand on.
    const level = storeyOf(b.y);
    const spec = snapToGrid(
      kind,
      b.x + Math.sin(b.heading) * REACH,
      b.z + Math.cos(b.heading) * REACH,
      level,
      material
    );
    const key = `${slotKey(spec)}|${spec.material ?? ''}|${level}`;
    if (key !== lastAim.current) {
      lastAim.current = key;
      onAim(spec, level);
    }
  });

  return (
    <group ref={group} visible={visible}>
      {/* legs pivot at the hip */}
      <group position={[0, 0.85, 0]}>
        <mesh ref={legL} position={[-0.15, 0, 0]} castShadow>
          <boxGeometry args={[0.22, 0.85, 0.24]} />
          <meshStandardMaterial color="#2f4b7c" />
        </mesh>
        <mesh ref={legR} position={[0.15, 0, 0]} castShadow>
          <boxGeometry args={[0.22, 0.85, 0.24]} />
          <meshStandardMaterial color="#2f4b7c" />
        </mesh>
      </group>
      {/* torso in a hi-vis vest */}
      <mesh position={[0, 1.18, 0]} castShadow>
        <boxGeometry args={[0.56, 0.68, 0.32]} />
        <meshStandardMaterial color="#ff8a1f" />
      </mesh>
      <mesh position={[0, 1.18, 0.165]}>
        <boxGeometry args={[0.5, 0.08, 0.01]} />
        <meshStandardMaterial
          color="#e8ff6a"
          emissive="#c8e04a"
          emissiveIntensity={0.4}
        />
      </mesh>
      <group position={[0, 1.45, 0]}>
        <mesh ref={armL} position={[-0.36, -0.3, 0]} castShadow>
          <boxGeometry args={[0.16, 0.6, 0.18]} />
          <meshStandardMaterial color="#ff8a1f" />
        </mesh>
        <mesh ref={armR} position={[0.36, -0.3, 0]} castShadow>
          <boxGeometry args={[0.16, 0.6, 0.18]} />
          <meshStandardMaterial color="#ff8a1f" />
        </mesh>
      </group>
      <mesh position={[0, 1.72, 0]} castShadow>
        <sphereGeometry args={[0.2, 16, 12]} />
        <meshStandardMaterial color="#f1c27d" />
      </mesh>
      {/* hard hat with a brim */}
      <mesh position={[0, 1.84, 0]} castShadow>
        <sphereGeometry args={[0.23, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#ffd23f" />
      </mesh>
      <mesh position={[0, 1.84, 0.06]}>
        <cylinderGeometry args={[0.27, 0.27, 0.03, 16]} />
        <meshStandardMaterial color="#ffd23f" />
      </mesh>
      {/* a soft ring under the feet so the worker is easy to spot */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.45, 0.6, 24]} />
        <meshBasicMaterial
          color="#ffd23f"
          transparent
          opacity={0.8}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};
