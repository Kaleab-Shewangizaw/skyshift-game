import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, STOREY, type PieceSpec } from '../../shared/structure';
import {
  BEAM_H,
  BEAM_LEN,
  BEAM_W,
  NUDGE,
  COLUMN,
  SLAB_H,
  STAIR_STEPS,
  STAIR_WIDTH,
  WALL_H,
  WALL_LEN,
  WALL_T,
} from './layout';
import {
  brickTexture,
  concreteTexture,
  stoneTexture,
  timberTexture,
} from './textures';

// What each kind of piece looks like. Every geometry is built once at its
// real size, centered on the piece's anchor and pointing along +x; instances
// only move and turn it. Sizes match `layout.ts`, and no two touching pieces
// share a face, so nothing flickers where they meet.

export type Part = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow: boolean;
};

/** The look key a piece renders with (walls differ by material). */
export const lookOf = (p: PieceSpec): string =>
  p.kind === 'wall' ? `wall:${p.material ?? 'brick'}` : p.kind;

/** Turn about +y that points the +x-built geometry the way the piece faces. */
export const turnOf = (p: PieceSpec): number => {
  switch (p.dir) {
    case 'z':
      // Edges are symmetric; stairs climbing +z need -90°.
      return p.kind === 'stairs' ? -Math.PI / 2 : Math.PI / 2;
    case '-x':
      return Math.PI;
    case '-z':
      return Math.PI / 2;
    default:
      return 0;
  }
};

/** An I (or H) steel section in the XY plane: `w` flange width, `h` depth. */
const iShape = (w: number, h: number, flange: number, web: number) => {
  const s = new THREE.Shape();
  const x = w / 2;
  const y = h / 2;
  const t = web / 2;
  s.moveTo(-x, -y);
  s.lineTo(x, -y);
  s.lineTo(x, -y + flange);
  s.lineTo(t, -y + flange);
  s.lineTo(t, y - flange);
  s.lineTo(x, y - flange);
  s.lineTo(x, y);
  s.lineTo(-x, y);
  s.lineTo(-x, y - flange);
  s.lineTo(-t, y - flange);
  s.lineTo(-t, -y + flange);
  s.lineTo(-x, -y + flange);
  s.closePath();
  return s;
};

const extrude = (shape: THREE.Shape, depth: number) =>
  new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: 0.008,
    bevelThickness: 0.008,
    bevelSegments: 1,
  });

/** Steel column: an H-section standing a full storey. */
const columnGeometry = () => {
  const g = extrude(
    iShape(COLUMN - 0.02, COLUMN - 0.02, 0.05, 0.045),
    STOREY + NUDGE - 0.016
  );
  g.rotateX(-Math.PI / 2);
  g.translate(0, -(STOREY + NUDGE) / 2 + 0.008, 0);
  return g;
};

/** Steel beam: an I-section running along +x from corner to corner. */
const beamGeometry = () => {
  const g = extrude(
    iShape(BEAM_W - 0.016, BEAM_H - 0.016, 0.045, 0.035),
    BEAM_LEN - 0.016
  );
  g.rotateY(Math.PI / 2);
  g.translate(-BEAM_LEN / 2 + 0.008, 0, 0);
  return g;
};

/** A flight of steps climbing toward +x, filling the cell. */
const stairsGeometry = () => {
  const rise = (STOREY + SLAB_H) / STAIR_STEPS;
  const depth = CELL / STAIR_STEPS;
  const total = STOREY + SLAB_H;
  const steps = Array.from({ length: STAIR_STEPS }, (_, i) => {
    const h = (i + 1) * rise;
    const g = new RoundedBoxGeometry(depth + 0.02, h, STAIR_WIDTH, 1, 0.02);
    g.translate(-CELL / 2 + depth * (i + 0.5), -total / 2 + h / 2, 0);
    return g;
  });
  return (
    mergeGeometries(steps) ?? new THREE.BoxGeometry(CELL, total, STAIR_WIDTH)
  );
};

/** Aluminium frame around a glass pane: two posts, head, sill and a transom. */
const glassFrameGeometry = () => {
  const bar = 0.07;
  const deep = 0.12;
  const parts = [
    { size: [bar, WALL_H, deep], at: [-WALL_LEN / 2 + bar / 2, 0, 0] },
    { size: [bar, WALL_H, deep], at: [WALL_LEN / 2 - bar / 2, 0, 0] },
    { size: [WALL_LEN, bar, deep], at: [0, WALL_H / 2 - bar / 2, 0] },
    { size: [WALL_LEN, bar, deep], at: [0, -WALL_H / 2 + bar / 2, 0] },
    { size: [WALL_LEN, bar * 0.7, deep * 0.8], at: [0, 0.35, 0] },
  ].map(({ size, at }) => {
    const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
    g.translate(at[0] ?? 0, at[1] ?? 0, at[2] ?? 0);
    return g;
  });
  return (
    mergeGeometries(parts) ?? new THREE.BoxGeometry(WALL_LEN, WALL_H, deep)
  );
};

const textured = (
  make: () => THREE.CanvasTexture,
  repeat: [number, number],
  opts: THREE.MeshStandardMaterialParameters
) => {
  const map = make();
  map.repeat.set(repeat[0], repeat[1]);
  return new THREE.MeshStandardMaterial({ map, ...opts });
};

const build = (look: string): Part[] => {
  switch (look) {
    case 'foundation':
      return [
        {
          geometry: new RoundedBoxGeometry(CELL, 0.5, CELL, 2, 0.01),
          material: textured(concreteTexture, [1.4, 1.4], {
            color: '#a59f94',
            roughness: 0.95,
          }),
          castShadow: true,
        },
      ];
    case 'column':
      return [
        {
          geometry: columnGeometry(),
          material: new THREE.MeshStandardMaterial({
            color: '#58748c',
            metalness: 0.55,
            roughness: 0.42,
          }),
          castShadow: true,
        },
      ];
    case 'beam':
      return [
        {
          geometry: beamGeometry(),
          material: new THREE.MeshStandardMaterial({
            color: '#e3a234',
            metalness: 0.3,
            roughness: 0.48,
          }),
          castShadow: true,
        },
      ];
    case 'slab':
      return [
        {
          // Edges barely rounded, so neighboring slabs read as one floor.
          geometry: new RoundedBoxGeometry(CELL, SLAB_H, CELL, 2, 0.008),
          material: textured(concreteTexture, [1, 1], {
            color: '#ddd8ce',
            roughness: 0.88,
          }),
          castShadow: true,
        },
      ];
    case 'stairs':
      return [
        {
          geometry: stairsGeometry(),
          material: textured(concreteTexture, [0.5, 0.5], {
            color: '#c9c2b5',
            roughness: 0.85,
          }),
          castShadow: true,
        },
      ];
    case 'wall:glass':
      return [
        {
          geometry: new THREE.BoxGeometry(WALL_LEN - 0.1, WALL_H - 0.1, 0.04),
          material: new THREE.MeshPhysicalMaterial({
            color: '#a9dcec',
            metalness: 0.1,
            roughness: 0.05,
            transparent: true,
            opacity: 0.38,
            depthWrite: false,
            clearcoat: 1,
          }),
          castShadow: false,
        },
        {
          geometry: glassFrameGeometry(),
          material: new THREE.MeshStandardMaterial({
            color: '#3d454f',
            metalness: 0.6,
            roughness: 0.35,
          }),
          castShadow: true,
        },
      ];
    default: {
      const kind = look.slice('wall:'.length);
      const wall = new RoundedBoxGeometry(WALL_LEN, WALL_H, WALL_T, 2, 0.008);
      const material =
        kind === 'stone'
          ? textured(stoneTexture, [1.3, 1.3], { roughness: 0.9 })
          : kind === 'timber'
            ? textured(timberTexture, [1.2, 1], { roughness: 0.75 })
            : textured(brickTexture, [WALL_LEN, WALL_H], { roughness: 0.85 });
      return [{ geometry: wall, material, castShadow: true }];
    }
  }
};

const cache = new Map<string, Part[]>();

/** The parts for a look, built on first use (textures need the DOM). */
export const partsFor = (look: string): Part[] => {
  let parts = cache.get(look);
  if (!parts) {
    parts = build(look);
    cache.set(look, parts);
  }
  return parts;
};
