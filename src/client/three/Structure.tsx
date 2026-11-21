import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  CELL,
  STOREY,
  buildableCells,
  slotKey,
  type Pallet,
  type DropSpot,
  type Piece,
  type PieceSpec,
} from '../../shared/structure';
import {
  COLUMN,
  CORNER,
  CORNER_BOTTOM,
  CORNER_TOP,
  PAD_TOP,
  SLAB_H,
  WALL_LEN,
  pieceBox,
} from './layout';
import { lookOf, partsFor, pieceTransform, type Part } from './pieceLooks';

// Freeform building pieces on the 3 m build grid. Each look (see
// `pieceLooks.ts`) is drawn as one instanced mesh per part.

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

/** All pieces that share a look, one instanced mesh per part of that look. */
const PieceGroup = ({
  lookKey,
  pieces,
}: {
  lookKey: string;
  pieces: Piece[];
}) => {
  const parts = partsFor(lookKey);
  const matrices = useMemo(() => pieces.map(pieceTransform), [pieces]);
  return (
    <>
      {parts.map((part, i) => (
        <PartMesh key={i} part={part} matrices={matrices} />
      ))}
    </>
  );
};

const PartMesh = ({
  part,
  matrices,
  receive = true,
}: {
  part: Part;
  matrices: THREE.Matrix4[];
  receive?: boolean;
}) => {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const el = mesh.current;
    if (!el) return;
    matrices.forEach((m, i) => el.setMatrixAt(i, m));
    el.instanceMatrix.needsUpdate = true;
    el.computeBoundingSphere();
  }, [matrices]);
  return (
    <instancedMesh
      ref={mesh}
      args={[part.geometry, part.material, matrices.length]}
      castShadow={part.castShadow}
      receiveShadow={receive}
    />
  );
};

const POST = (() => {
  const g = new THREE.BoxGeometry(CORNER, CORNER_TOP - CORNER_BOTTOM, CORNER);
  // Map textures at the same scale as the walls (a wall's UVs span its full length).
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++)
    uv.setX(i, uv.getX(i) * (CORNER / WALL_LEN));
  uv.needsUpdate = true;
  return g;
})();

/**
 * Where an x-wall and a z-wall meet at a corner with no column, a slim post
 * fills the notch so the corner looks solid. It takes the x-wall's finish
 * (glass corners get the aluminium frame color).
 */
const CornerPosts = ({ pieces }: { pieces: readonly Piece[] }) => {
  const groups = useMemo(() => {
    const columns = new Set<string>();
    const xWalls = new Map<string, Piece>();
    const zWalls = new Set<string>();
    const node = (x: number, z: number, L: number) => `${x},${z},${L}`;
    for (const p of pieces) {
      if (p.kind === 'column') columns.add(node(p.x, p.z, p.level));
      if (p.kind !== 'wall') continue;
      // The two corners each wall touches.
      const ends =
        p.dir === 'x'
          ? [node(p.x, p.z, p.level), node(p.x + 1, p.z, p.level)]
          : [node(p.x, p.z, p.level), node(p.x, p.z + 1, p.level)];
      for (const e of ends) {
        if (p.dir === 'x') {
          if (!xWalls.has(e)) xWalls.set(e, p);
        } else zWalls.add(e);
      }
    }
    const byLook = new Map<string, THREE.Matrix4[]>();
    for (const [key, wall] of xWalls) {
      if (!zWalls.has(key) || columns.has(key)) continue;
      const [x = 0, z = 0, L = 0] = key.split(',').map(Number);
      const m = new THREE.Matrix4().makeTranslation(
        x * CELL,
        PAD_TOP + L * STOREY + (CORNER_TOP + CORNER_BOTTOM) / 2,
        z * CELL
      );
      const look = lookOf(wall);
      const list = byLook.get(look);
      if (list) list.push(m);
      else byLook.set(look, [m]);
    }
    return [...byLook.entries()];
  }, [pieces]);
  return (
    <>
      {groups.map(([look, matrices]) => {
        const parts = partsFor(look);
        // Glass walls: use the frame (last part); others: the wall itself.
        const part = parts[parts.length - 1];
        return part ? (
          <PartMesh
            key={`${look}:${matrices.length}`}
            part={{ ...part, geometry: POST }}
            matrices={matrices}
          />
        ) : null;
      })}
    </>
  );
};

/** Pale blue "hologram" for planned pieces: visible, but clearly not built. */
const PLAN_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#7fd8ff',
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
});

/** The rest of today's blueprint, drawn with the real piece shapes in see-through blue. */
const PlanGhosts = ({ plan }: { plan: readonly PieceSpec[] }) => {
  const groups = useMemo(() => {
    const byLook = new Map<string, THREE.Matrix4[]>();
    for (const p of plan) {
      const k = lookOf(p);
      const m = pieceTransform(p);
      const list = byLook.get(k);
      if (list) list.push(m);
      else byLook.set(k, [m]);
    }
    return [...byLook.entries()];
  }, [plan]);
  return (
    <>
      {groups.map(([look, matrices]) =>
        partsFor(look).map((part, i) => (
          <PartMesh
            key={`${look}:${i}:${matrices.length}`}
            part={{ ...part, material: PLAN_MATERIAL, castShadow: false }}
            matrices={matrices}
            receive={false}
          />
        ))
      )}
    </>
  );
};

/** What the worker is aiming at: a free spot, a blocked one, or one of their own pieces. */
export type GhostState = 'ok' | 'bad' | 'remove';

export type BuildView = {
  /** The storey the worker stands on: the grid is drawn on its floor. */
  level: number;
  ghost: { spec: PieceSpec; state: GhostState } | null;
  /** Where the crane's load would be set down. */
  drop?: { spec: DropSpot; ok: boolean } | null;
};

type Props = {
  pieces: readonly Piece[];
  /** Blueprint pieces nobody has built yet, shown as a see-through plan. */
  plan: readonly PieceSpec[];
  pads: readonly string[];
  pallets: readonly Pallet[];
  build: BuildView | null;
};

export const Structure = ({ pieces, plan, pads, pallets, build }: Props) => {
  const groups = useMemo(() => {
    const byLook = new Map<string, Piece[]>();
    for (const p of pieces) {
      const k = lookOf(p);
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
      <CornerPosts pieces={pieces} />
      <PlanGhosts plan={plan} />
      {pallets.map((q) => (
        <PalletStack key={`${q.kind}:${q.x},${q.z},${q.level}`} pallet={q} />
      ))}
      {build && (
        <>
          <LevelGrid pads={pads} level={build.level} />
          {build.ghost && (
            <Ghost spec={build.ghost.spec} state={build.ghost.state} />
          )}
          {build.drop && (
            <DropGhost spec={build.drop.spec} ok={build.drop.ok} />
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
      // On the pad for the ground floor, on top of the slabs above that.
      position={[
        0,
        PAD_TOP + level * STOREY + (level > 0 ? SLAB_H : 0) + 0.03,
        0,
      ]}
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
  const grow = 0.12;
  // A leaning column's ghost tilts with it; everything else is its box.
  const shape = useMemo(() => {
    if (spec.kind === 'lean') {
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      pieceTransform(spec).decompose(pos, quat, scale);
      return {
        position: pos,
        quaternion: quat,
        scale: new THREE.Vector3(
          COLUMN + grow,
          STOREY * scale.y + grow,
          COLUMN + grow
        ),
      };
    }
    const b = pieceBox(spec);
    return {
      position: new THREE.Vector3(...b.pos),
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(
        b.size[0] + grow,
        b.size[1] + grow,
        b.size[2] + grow
      ),
    };
  }, [spec]);
  return (
    <mesh
      key={`${slotKey(spec)}${spec.dir ?? ''}`}
      position={shape.position}
      quaternion={shape.quaternion}
      scale={shape.scale}
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

/** World position of the middle of a pallet's deck on its floor slab. */
const palletBase = (q: DropSpot): [number, number, number] => [
  q.x * CELL + CELL / 2,
  PAD_TOP + q.level * STOREY + 0.25,
  q.z * CELL + CELL / 2,
];

/** A timber pallet with the remaining beams or columns stacked on it. */
const PalletStack = ({ pallet }: { pallet: Pallet }) => {
  const [x, y, cz] = palletBase(pallet);
  const beam = pallet.kind === 'beam';
  // Beams on one half of the cell, columns on the other, so both fit.
  const z = cz + (beam ? -0.75 : 0.75);
  // Stack up to four rows; a big pallet just looks full.
  const shown = Math.min(pallet.left, 12);
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.16, 1.4]} />
        <meshStandardMaterial color="#a8794f" roughness={0.9} />
      </mesh>
      {Array.from({ length: shown }, (_, i) => {
        const row = Math.floor(i / 3);
        const col = (i % 3) - 1;
        return (
          <mesh
            key={i}
            position={[0, 0.32 + row * (beam ? 0.4 : 0.46), col * 0.45]}
            castShadow
          >
            <boxGeometry args={beam ? [2.1, 0.38, 0.32] : [2.1, 0.44, 0.44]} />
            <meshStandardMaterial
              color={beam ? '#e0a33a' : '#5f7d95'}
              metalness={0.4}
            />
          </mesh>
        );
      })}
    </group>
  );
};

/** Pulsing outline of where the crane would set its pallet down. */
const DropGhost = ({ spec, ok }: { spec: DropSpot; ok: boolean }) => {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (mat.current)
      mat.current.opacity = 0.4 + Math.sin(clock.elapsedTime * 6) * 0.15;
  });
  const [x, y, z] = palletBase(spec);
  return (
    <mesh position={[x, y + 0.6, z]} renderOrder={2}>
      <boxGeometry args={[2.6, 1.2, 1.8]} />
      <meshBasicMaterial
        ref={mat}
        color={ok ? '#3dff7a' : '#ff3b30'}
        transparent
        opacity={0.5}
        depthWrite={false}
      />
    </mesh>
  );
};
