import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { latticeTexture } from './textures';

const YELLOW = '#f2b632';
const MAST = 2;

type Props = {
  /** Where the mast stands. */
  x: number;
  z: number;
  /** Top of the building (m). The crane always stands taller. */
  buildingTop: number;
  /** World position the hook should hang over. */
  target: [number, number];
  wind: number;
};

/**
 * Tower crane. The mast grows with the building, the jib slews toward the
 * tower and sways a little more on windy days, and the hook hangs just above
 * the top floor.
 */
export const Crane = ({ x, z, buildingTop, target, wind }: Props) => {
  const height = Math.max(32, buildingTop + 14);
  const jibLen = 26;
  const slew = useRef<THREE.Group>(null);
  const trolley = useRef<THREE.Group>(null);
  const cable = useRef<THREE.Mesh>(null);

  const lattice = useMemo(() => {
    const t = latticeTexture();
    t.repeat.set(1, height / MAST);
    return t;
  }, [height]);
  const jibLattice = useMemo(() => {
    const t = latticeTexture();
    t.rotation = Math.PI / 2;
    t.repeat.set(1, jibLen / 1.5);
    return t;
  }, []);

  const dx = target[0] - x;
  const dz = target[1] - z;
  const baseAngle = Math.atan2(-dz, dx);
  const reach = Math.min(jibLen - 2, Math.max(4, Math.hypot(dx, dz)));

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (slew.current)
      slew.current.rotation.y =
        baseAngle + Math.sin(t * 0.25) * (0.05 + wind * 0.04);
    if (trolley.current)
      trolley.current.position.x = reach + Math.sin(t * 0.4) * 0.6;
    if (cable.current) {
      // The hook bobs gently just above the top floor.
      const drop = height - (buildingTop + 4) + Math.sin(t * 1.1) * 0.5;
      cable.current.scale.y = Math.max(1, drop);
      cable.current.position.y = -drop / 2;
    }
  });

  const hookDrop = height - (buildingTop + 4);

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
        {/* cab */}
        <mesh position={[0.6, -0.8, 1.6]} castShadow>
          <boxGeometry args={[2, 2, 1.8]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[1.62, -0.6, 1.6]}>
          <boxGeometry args={[0.05, 1.1, 1.4]} />
          <meshStandardMaterial
            color="#9fd8e8"
            emissive="#bfe3ff"
            emissiveIntensity={0.25}
          />
        </mesh>
        {/* jib */}
        <mesh position={[jibLen / 2, 0.8, 0]} castShadow>
          <boxGeometry args={[jibLen, 1.5, 1.5]} />
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
        {/* apex and tie lines */}
        <mesh position={[0, 3.2, 0]} castShadow>
          <coneGeometry args={[0.9, 4.5, 4]} />
          <meshStandardMaterial color={YELLOW} />
        </mesh>
        {/* trolley, cable and hook */}
        <group ref={trolley} position={[reach, 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[1.4, 0.5, 1.6]} />
            <meshStandardMaterial color="#4a4f57" />
          </mesh>
          <mesh
            ref={cable}
            position={[0, -hookDrop / 2, 0]}
            scale={[1, Math.max(1, hookDrop), 1]}
          >
            <cylinderGeometry args={[0.05, 0.05, 1, 4]} />
            <meshStandardMaterial color="#333" />
          </mesh>
          <Hook drop={hookDrop} />
        </group>
      </group>
    </group>
  );
};

/** The hook block follows the end of the cable. */
const Hook = ({ drop }: { drop: number }) => {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (g.current)
      g.current.position.y = -(drop + Math.sin(clock.elapsedTime * 1.1) * 0.5);
  });
  return (
    <group ref={g}>
      <mesh castShadow>
        <boxGeometry args={[0.9, 0.9, 0.6]} />
        <meshStandardMaterial color="#ffc93c" />
      </mesh>
      <mesh position={[0, -0.75, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.35, 0.1, 6, 12, Math.PI * 1.4]} />
        <meshStandardMaterial color="#555" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
};
