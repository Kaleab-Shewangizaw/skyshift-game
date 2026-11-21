import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  CELL,
  facingDir,
  facingDir8,
  slotKey,
  snapToGrid,
  type PieceKind,
  type PieceSpec,
  type WallMaterial,
} from '../../shared/structure';
import { controls, takeJump, takeRide, takeTeleport } from '../game/controls';
import { setMyPosition } from '../game/remote';
import { CRANE_POS, PAD_TOP } from './layout';
import { step, storeyOf, type Body, type Collider } from './physics';

type Props = {
  colliders: readonly Collider[];
  /** False while another view (the crane cab) has the camera. */
  drive: boolean;
  /** Site work: pull the camera up and back around the worker to see the tiles. */
  overview: boolean;
  kind: PieceKind;
  material: WallMaterial;
  /** Called when the spot in front of the worker changes. */
  onAim: (spec: PieceSpec, level: number) => void;
  /** Hidden while the worker sits in the crane cab. */
  visible: boolean;
  /** Called when the worker walks up to, or away from, the crane. */
  onNearCrane: (near: boolean) => void;
  /** Called when the worker steps into another grid cell or floor. */
  onCell: (x: number, z: number, level: number) => void;
};

/** How far in front of the worker the build spot is (m). */
const REACH = 1.7;
const EYE = 1.5;
/** Elevator speed (m/s): about two seconds a floor. */
const LIFT_SPEED = 2.4;

/**
 * The player's construction worker, driven by the joystick or keyboard, with
 * a third-person camera that follows. Drag the screen to look around,
 * pinch or scroll to zoom.
 */
export const Player = ({
  colliders,
  drive,
  overview,
  kind,
  material,
  onAim,
  visible,
  onNearCrane,
  onCell,
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
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const walkPhase = useRef(0);
  const stride = useRef(0);
  const lastAim = useRef('');
  const nearCrane = useRef(false);
  const lastCell = useRef('');
  /** An elevator ride in progress. */
  const riding = useRef<{ x: number; y: number; z: number } | null>(null);
  // Camera offset (from the worker) to ease toward, and the one to come back to.
  const wantOffset = useRef<THREE.Vector3 | null>(null);
  const savedOffset = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    const c = orbit.current;
    if (!c) return;
    const offset = camera.position.clone().sub(c.target);
    if (overview) {
      // Keep facing the same way, but rise up and back for a view over the tiles.
      savedOffset.current = offset.clone();
      const sph = new THREE.Spherical().setFromVector3(offset);
      sph.radius = Math.max(sph.radius, 55);
      sph.phi = 0.7;
      wantOffset.current = new THREE.Vector3().setFromSpherical(sph);
    } else if (savedOffset.current) {
      wantOffset.current = savedOffset.current;
      savedOffset.current = null;
    }
  }, [overview, camera]);

  useEffect(() => {
    if (!drive) return;
    const b = body.current;
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.12;
    c.enablePan = false;
    c.minDistance = 4;
    // Far enough back to see a whole landmark tower.
    c.maxDistance = 120;
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
    // Taking the camera by hand cancels any glide in progress.
    const takeOver = () => {
      wantOffset.current = null;
    };
    c.addEventListener('start', takeOver);
    orbit.current = c;
    return () => {
      c.removeEventListener('start', takeOver);
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
      // Travel buttons: land a little above the spot and drop onto whatever is there.
      const jump = takeTeleport();
      if (jump) {
        b.x = jump.x;
        b.z = jump.z;
        b.y = 12;
        b.vy = 0;
      }
      const newRide = takeRide();
      if (newRide) riding.current = newRide;
      const r = riding.current;
      if (r) {
        // In the elevator: slide to the middle of the shaft, then rise or sink
        // to the landing. No gravity, no walking until we arrive.
        b.x += (r.x - b.x) * Math.min(1, dt * 8);
        b.z += (r.z - b.z) * Math.min(1, dt * 8);
        const dy = r.y - b.y;
        b.y += Math.sign(dy) * Math.min(Math.abs(dy), LIFT_SPEED * dt);
        b.vy = 0;
        b.grounded = true;
        if (Math.abs(r.y - b.y) < 0.01) {
          b.y = r.y;
          riding.current = null;
        }
      } else
        step(
          b,
          {
            moveX: fx * sy - fz * sx,
            moveZ: fz * sy + fx * sx,
            jump: takeJump(),
            run: controls.run || controls.keyRun,
          },
          colliders,
          dt
        );
      // The camera rides along with the worker.
      camera.position.add(new THREE.Vector3(b.x - px, b.y - py, b.z - pz));
      c.target.set(b.x, b.y + EYE, b.z);
      // Glide toward the requested view; dragging the camera cancels it.
      const glide = wantOffset.current;
      if (glide) {
        const offset = camera.position.clone().sub(c.target);
        offset.lerp(glide, Math.min(1, dt * 4));
        camera.position.copy(c.target).add(offset);
        if (offset.distanceTo(glide) < 0.2) wantOffset.current = null;
      }
      c.update();

      const moving = Math.hypot(b.x - px, b.z - pz) / dt;
      walkPhase.current += dt * (b.climbing ? 9 : moving * 2.2);
      // Ease the stride in and out so starting and stopping look natural.
      const want = b.climbing || moving > 0.3 ? 1 : 0;
      stride.current += (want - stride.current) * Math.min(1, dt * 10);
    }

    const g = group.current;
    if (g) {
      g.position.set(b.x, b.y, b.z);
      // Turn smoothly toward the heading.
      let d = b.heading - g.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      g.rotation.y += d * Math.min(1, dt * 12);
    }
    const k = stride.current;
    const swing = Math.sin(walkPhase.current) * 0.75 * k;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current)
      armL.current.rotation.x = b.climbing ? -2.6 + swing : -swing * 0.8;
    if (armR.current)
      armR.current.rotation.x = b.climbing ? -2.6 - swing : swing * 0.8;
    if (torso.current) {
      // A little bounce and forward lean while walking.
      torso.current.position.y =
        Math.abs(Math.cos(walkPhase.current)) * 0.05 * k;
      torso.current.rotation.x = 0.08 * k;
    }

    const cx = Math.floor(b.x / CELL);
    const cz = Math.floor(b.z / CELL);
    const floor = storeyOf(b.y);
    const cellKey = `${cx},${cz},${floor}`;
    if (cellKey !== lastCell.current) {
      lastCell.current = cellKey;
      onCell(cx, cz, floor);
    }

    // Shared with the presence reporter (other players see this worker).
    setMyPosition({ x: b.x, y: b.y, z: b.z, h: b.heading, crane: !visible });

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
      material,
      // Leaning columns can tilt diagonally too; stairs only along the axes.
      kind === 'lean' ? facingDir8(b.heading) : facingDir(b.heading)
    );
    const key = `${slotKey(spec)}|${spec.dir ?? ''}|${spec.material ?? ''}|${level}`;
    if (key !== lastAim.current) {
      lastAim.current = key;
      onAim(spec, level);
    }
  });

  return (
    <group ref={group} visible={visible}>
      <WorkerModel
        legL={legL}
        legR={legR}
        armL={armL}
        armR={armR}
        torso={torso}
      />
      {/* a soft ring under the feet so the worker is easy to spot */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.45, 0.6, 32]} />
        <meshBasicMaterial
          color="#ffd23f"
          transparent
          opacity={0.7}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

const SKIN = '#f1c27d';
const VEST = '#ff8a1f';
const STRIPE = '#e8ff6a';
const JEANS = '#2f4b7c';
const BOOT = '#4a3423';
const HAT = '#ffd23f';

export type ModelRefs = {
  legL: RefObject<THREE.Group | null>;
  legR: RefObject<THREE.Group | null>;
  armL: RefObject<THREE.Group | null>;
  armR: RefObject<THREE.Group | null>;
  torso: RefObject<THREE.Group | null>;
};

/** A rounded, toy-like construction worker. Limbs pivot at hips and shoulders. */
export const WorkerModel = ({
  legL,
  legR,
  armL,
  armR,
  torso,
  vest = VEST,
}: ModelRefs & { vest?: string }) => (
  <group>
    {[legL, legR].map((ref, i) => (
      <group key={i} ref={ref} position={[i === 0 ? -0.12 : 0.12, 0.92, 0]}>
        <mesh position={[0, -0.41, 0]} castShadow>
          <capsuleGeometry args={[0.1, 0.62, 6, 12]} />
          <meshStandardMaterial color={JEANS} roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.86, 0.05]} castShadow>
          <boxGeometry args={[0.2, 0.13, 0.32]} />
          <meshStandardMaterial color={BOOT} roughness={0.7} />
        </mesh>
      </group>
    ))}
    <group ref={torso}>
      <mesh position={[0, 0.97, 0]}>
        <cylinderGeometry args={[0.215, 0.215, 0.07, 20]} />
        <meshStandardMaterial color="#5a3b22" />
      </mesh>
      <mesh position={[0, 1.25, 0]} castShadow>
        <capsuleGeometry args={[0.23, 0.22, 8, 20]} />
        <meshStandardMaterial color={vest} roughness={0.6} />
      </mesh>
      {[1.15, 1.33].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.236, 0.236, 0.05, 24, 1, true]} />
          <meshStandardMaterial
            color={STRIPE}
            emissive="#c8e04a"
            emissiveIntensity={0.35}
          />
        </mesh>
      ))}
      {[armL, armR].map((ref, i) => (
        <group
          key={i}
          ref={ref}
          position={[i === 0 ? -0.3 : 0.3, 1.48, 0]}
          rotation={[0, 0, i === 0 ? 0.12 : -0.12]}
        >
          <mesh position={[0, -0.26, 0]} castShadow>
            <capsuleGeometry args={[0.075, 0.38, 6, 12]} />
            <meshStandardMaterial color={vest} roughness={0.6} />
          </mesh>
          <mesh position={[0, -0.56, 0]} castShadow>
            <sphereGeometry args={[0.085, 14, 10]} />
            <meshStandardMaterial color={SKIN} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.07, 0.08, 0.12, 12]} />
        <meshStandardMaterial color={SKIN} />
      </mesh>
      <mesh position={[0, 1.78, 0]} castShadow>
        <sphereGeometry args={[0.2, 24, 18]} />
        <meshStandardMaterial color={SKIN} roughness={0.7} />
      </mesh>
      {[-0.07, 0.07].map((x) => (
        <mesh key={x} position={[x, 1.8, 0.178]}>
          <sphereGeometry args={[0.028, 10, 8]} />
          <meshStandardMaterial color="#2a1d14" />
        </mesh>
      ))}
      <mesh position={[0, 1.75, 0.2]}>
        <sphereGeometry args={[0.03, 10, 8]} />
        <meshStandardMaterial color="#e3a96b" />
      </mesh>
      {/* hard hat: dome, brim and a center ridge */}
      <mesh position={[0, 1.83, 0]} castShadow>
        <sphereGeometry
          args={[0.225, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]}
        />
        <meshStandardMaterial color={HAT} roughness={0.35} />
      </mesh>
      <mesh position={[0, 1.835, 0.04]}>
        <cylinderGeometry args={[0.28, 0.28, 0.025, 28]} />
        <meshStandardMaterial color={HAT} roughness={0.35} />
      </mesh>
      <mesh position={[0, 2.02, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.035, 0.022, 6, 12]} />
        <meshStandardMaterial color={HAT} roughness={0.35} />
      </mesh>
    </group>
  </group>
);
