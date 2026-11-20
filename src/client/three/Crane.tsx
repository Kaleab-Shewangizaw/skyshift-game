import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  HANG,
  JIB_LENGTH,
  crane,
  craneTarget,
  mastHeight,
} from '../game/crane';
import { STACK_POS } from './layout';
import { latticeTexture } from './textures';

const YELLOW = '#f2b632';
const MAST = 2;
const STEEL = '#5f7d95';
const BEAM = '#e0a33a';

type Props = {
  /** Where the mast stands. */
  x: number;
  z: number;
  /** Top of the building (m). The crane always stands taller. */
  buildingTop: number;
  /** A player is in the cab. */
  operated: boolean;
};

/**
 * Tower crane driven by the live crane state (`game/crane.ts`): the jib
 * slews, the trolley runs along it and the hook goes up and down, carrying a
 * beam or column when one is attached.
 */
export const Crane = ({ x, z, buildingTop, operated }: Props) => {
  const height = mastHeight(buildingTop);
  const slew = useRef<THREE.Group>(null);
  const trolley = useRef<THREE.Group>(null);
  const cable = useRef<THREE.Mesh>(null);
  const hook = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Mesh>(null);
  const column = useRef<THREE.Mesh>(null);

  const lattice = useMemo(() => {
    const t = latticeTexture();
    t.repeat.set(1, height / MAST);
    return t;
  }, [height]);
  const jibLattice = useMemo(() => {
    const t = latticeTexture();
    t.rotation = Math.PI / 2;
    t.repeat.set(1, JIB_LENGTH / 1.5);
    return t;
  }, []);

  useFrame(() => {
    const c = crane();
    if (slew.current) slew.current.rotation.y = c.slew;
    if (trolley.current) trolley.current.position.x = c.trolley;
    const drop = Math.max(0.5, height - c.hookY);
    if (cable.current) {
      cable.current.scale.y = drop;
      cable.current.position.y = -drop / 2;
    }
    if (hook.current) hook.current.position.y = -drop;
    // The load hangs square to the grid slot it is heading for.
    const target = craneTarget();
    if (beam.current) {
      beam.current.visible = c.load === 'beam';
      beam.current.position.y = -HANG.beam;
      beam.current.rotation.y =
        -c.slew + (target?.dir === 'z' ? Math.PI / 2 : 0);
    }
    if (column.current) {
      column.current.visible = c.load === 'column';
      column.current.position.y = -HANG.column;
      column.current.rotation.y = -c.slew;
    }
  });

  return (
    <group position={[x, 0, z]}>
      {/* concrete base */}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[4, 1, 4]} />
        <meshStandardMaterial color="#9a958d" />
      </mesh>
      {/* lattice mast */}
      <mesh position={[0, height / 2, 0]} castShadow>
        <boxGeometry args={[MAST, height, MAST]} />
        <meshStandardMaterial
          map={lattice}
          transparent
          alphaTest={0.5}
          side={THREE.DoubleSide}
          color="#ffffff"
        />
      </mesh>
      <group ref={slew} position={[0, height, 0]}>
        {/* cab, lit up while someone operates it */}
        <mesh position={[0.6, -0.8, 1.6]} castShadow>
          <boxGeometry args={[2, 2, 1.8]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[1.62, -0.6, 1.6]}>
          <boxGeometry args={[0.05, 1.1, 1.4]} />
          <meshStandardMaterial
            color="#9fd8e8"
            emissive={operated ? '#ffd23f' : '#bfe3ff'}
            emissiveIntensity={operated ? 0.9 : 0.25}
          />
        </mesh>
        {/* jib */}
        <mesh position={[JIB_LENGTH / 2, 0.8, 0]} castShadow>
          <boxGeometry args={[JIB_LENGTH, 1.5, 1.5]} />
          <meshStandardMaterial
            map={jibLattice}
            transparent
            alphaTest={0.5}
            side={THREE.DoubleSide}
            color="#ffffff"
          />
        </mesh>
        {/* counter-jib and counterweight */}
        <mesh position={[-5, 0.8, 0]} castShadow>
          <boxGeometry args={[10, 1.2, 1.5]} />
          <meshStandardMaterial
            map={jibLattice}
            transparent
            alphaTest={0.5}
            side={THREE.DoubleSide}
            color="#ffffff"
          />
        </mesh>
        <mesh position={[-9, 0.1, 0]} castShadow>
          <boxGeometry args={[2.4, 2, 2]} />
          <meshStandardMaterial color="#6f7a86" />
        </mesh>
        <mesh position={[0, 3.2, 0]} castShadow>
          <coneGeometry args={[0.9, 4.5, 4]} />
          <meshStandardMaterial color={YELLOW} />
        </mesh>
        {/* trolley, cable, hook and load */}
        <group ref={trolley}>
          <mesh castShadow>
            <boxGeometry args={[1.4, 0.5, 1.6]} />
            <meshStandardMaterial color="#4a4f57" />
          </mesh>
          <mesh ref={cable}>
            <cylinderGeometry args={[0.05, 0.05, 1, 4]} />
            <meshStandardMaterial color="#333" />
          </mesh>
          <group ref={hook}>
            <mesh castShadow>
              <boxGeometry args={[0.9, 0.9, 0.6]} />
              <meshStandardMaterial color="#ffc93c" />
            </mesh>
            <mesh position={[0, -0.6, 0]} rotation={[0, 0, Math.PI / 2]}>
              <torusGeometry args={[0.3, 0.09, 6, 12, Math.PI * 1.4]} />
              <meshStandardMaterial
                color="#555"
                metalness={0.6}
                roughness={0.4}
              />
            </mesh>
            <mesh ref={beam} visible={false} castShadow>
              <boxGeometry args={[3.45, 0.4, 0.35]} />
              <meshStandardMaterial color={BEAM} metalness={0.35} />
            </mesh>
            <mesh ref={column} visible={false} castShadow>
              <boxGeometry args={[0.45, 3, 0.45]} />
              <meshStandardMaterial color={STEEL} metalness={0.5} />
            </mesh>
          </group>
        </group>
      </group>
      <SteelStack x={STACK_POS[0] - x} z={STACK_POS[1] - z} />
    </group>
  );
};

/** Beams and columns waiting on timber bearers for the crane to pick up. */
const SteelStack = ({ x, z }: { x: number; z: number }) => (
  <group position={[x, 0, z]}>
    {[-2, 0, 2].map((dz) => (
      <mesh key={`b${dz}`} position={[0, 0.1, dz]} receiveShadow>
        <boxGeometry args={[2.6, 0.2, 0.3]} />
        <meshStandardMaterial color="#8a5a3c" />
      </mesh>
    ))}
    {[0, 1, 2].map((row) =>
      [-0.45, 0.45].map((dx) => (
        <mesh
          key={`beam${row}${dx}`}
          position={[dx - 0.45, 0.4 + row * 0.42, 0]}
          castShadow
        >
          <boxGeometry args={[0.35, 0.4, 5.2]} />
          <meshStandardMaterial color={BEAM} metalness={0.35} />
        </mesh>
      ))
    )}
    {[0, 1].map((row) => (
      <mesh
        key={`col${row}`}
        position={[0.9, 0.45 + row * 0.47, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <boxGeometry args={[0.45, 5, 0.45]} />
        <meshStandardMaterial color={STEEL} metalness={0.5} />
      </mesh>
    ))}
  </group>
);
