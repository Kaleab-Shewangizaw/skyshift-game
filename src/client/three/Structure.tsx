import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  CELL,
  STOREY,
  WALLS,
  buildableCells,
  slotKey,
  type Piece,
  type PieceSpec,
} from '../../shared/structure';
import { PAD_TOP, pieceBox, type Box } from './layout';

// Freeform building pieces drawn as boxes on the 3 m build grid.
// Every piece is a scaled unit box, so each look is one instanced draw call.

const look = (p: PieceSpec): string =>
  p.kind === 'wall' ? `wall:${p.material ?? 'brick'}` : p.kind;

const makeMaterial = (key: string): THREE.MeshStandardMaterial => {
  switch (key) {
    case 'foundation':
      return new THREE.MeshStandardMaterial({
        color: '#8d877d',
        roughness: 0.95,
      });
    case 'column':
      return new THREE.MeshStandardMaterial({
        color: '#5f7d95',
        metalness: 0.5,
        roughness: 0.45,
      });
    case 'beam':
      return new THREE.MeshStandardMaterial({
        color: '#e0a33a',
        metalness: 0.35,
        roughness: 0.5,
      });
    case 'slab':
      return new THREE.MeshStandardMaterial({
        color: '#d2cdc3',
        roughness: 0.9,
      });
    case 'wall:glass':
      return new THREE.MeshStandardMaterial({
        color: WALLS.glass.color,
        metalness: 0.2,
        roughness: 0.05,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      });
    default: {
      const m = key.slice('wall:'.length);
      const color =
        m === 'stone'
          ? WALLS.stone.color
          : m === 'timber'
            ? WALLS.timber.color
            : WALLS.brick.color;
      return new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    }
  }
};

const MATERIALS = new Map<string, THREE.MeshStandardMaterial>();
const materialFor = (key: string): THREE.MeshStandardMaterial => {
  let m = MATERIALS.get(key);
  if (!m) {
    m = makeMaterial(key);
    MATERIALS.set(key, m);
  }
  return m;
};

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

const boxMatrix = (b: Box, m: THREE.Matrix4) =>
  m.compose(
    new THREE.Vector3(...b.pos),
    new THREE.Quaternion(),
    new THREE.Vector3(...b.size)
  );

/** All pieces that share a look, in one instanced mesh. */
const PieceGroup = ({
  lookKey,
  pieces,
}: {
  lookKey: string;
  pieces: Piece[];
}) => {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const el = mesh.current;
    if (!el) return;
    const m = new THREE.Matrix4();
    pieces.forEach((p, i) => el.setMatrixAt(i, boxMatrix(pieceBox(p), m)));
    el.instanceMatrix.needsUpdate = true;
    el.computeBoundingSphere();
  }, [pieces]);
  return (
    <instancedMesh
      ref={mesh}
      args={[UNIT_BOX, materialFor(lookKey), pieces.length]}
      castShadow={lookKey !== 'wall:glass'}
      receiveShadow
    />
  );
};

/** What the worker is aiming at: a free spot, a blocked one, or one of their own pieces. */
export type GhostState = 'ok' | 'bad' | 'remove';

export type BuildView = {
  /** The storey the worker stands on: the grid is drawn on its floor. */
  level: number;
  ghost: { spec: PieceSpec; state: GhostState } | null;
};

type Props = {
  pieces: readonly Piece[];
  pads: readonly string[];
  build: BuildView | null;
};

export const Structure = ({ pieces, pads, build }: Props) => {
  const groups = useMemo(() => {
    const byLook = new Map<string, Piece[]>();
    for (const p of pieces) {
      const k = look(p);
      const list = byLook.get(k);
      if (list) list.push(p);
      else byLook.set(k, [p]);
    }
    return [...byLook.entries()];
  }, [pieces]);

  return (
    <group>
      {groups.map(([k, list]) => (
        <PieceGroup key={`${k}:${list.length}`} lookKey={k} pieces={list} />
      ))}
      {build && (
        <>
          <LevelGrid pads={pads} level={build.level} />
          {build.ghost && (
            <Ghost spec={build.ghost.spec} state={build.ghost.state} />
          )}
        </>
      )}
    </group>
  );
};

/** Chalk grid over the buildable cells, on the floor of the current storey. */
const LevelGrid = ({
  pads,
  level,
}: {
  pads: readonly string[];
  level: number;
}) => {
  const geometry = useMemo(() => {
    const pts: number[] = [];
    for (const [cx, cz] of buildableCells(pads)) {
      const x0 = cx * CELL;
      const z0 = cz * CELL;
      const x1 = x0 + CELL;
      const z1 = z0 + CELL;
      pts.push(x0, 0, z0, x1, 0, z0, x1, 0, z0, x1, 0, z1);
      pts.push(x1, 0, z1, x0, 0, z1, x0, 0, z1, x0, 0, z0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [pads]);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments
      geometry={geometry}
      position={[0, PAD_TOP + level * STOREY + 0.04, 0]}
    >
      <lineBasicMaterial
        color="#ffffff"
        transparent
        opacity={level === 0 ? 0.45 : 0.8}
        depthWrite={false}
      />
    </lineSegments>
  );
};

const GHOST_COLOR: Record<GhostState, string> = {
  ok: '#3dff7a',
  bad: '#ff3b30',
  remove: '#ffb000',
};

/** Pulsing see-through preview of the piece the worker is about to place. */
const Ghost = ({ spec, state }: { spec: PieceSpec; state: GhostState }) => {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (mat.current)
      mat.current.opacity = 0.42 + Math.sin(clock.elapsedTime * 6) * 0.14;
  });
  const b = pieceBox(spec);
  const grow = 0.12;
  return (
    <mesh
      key={slotKey(spec)}
      position={b.pos}
      scale={[b.size[0] + grow, b.size[1] + grow, b.size[2] + grow]}
      geometry={UNIT_BOX}
      renderOrder={2}
    >
      <meshBasicMaterial
        ref={mat}
        color={GHOST_COLOR[state]}
        transparent
        opacity={0.5}
        depthWrite={false}
      />
    </mesh>
  );
};
