import { isPad, padTiles } from './city.ts';

// Freeform building on the poured pads.
//
// The site has a 3 m build grid (a 12 m tile = 4×4 cells, matching the chalk
// lines on the pads) and 3 m storeys. Grid coordinates are global:
//   cell (x, z)  covers world [3x, 3x+3] × [3z, 3z+3]
//   node (x, z)  is the grid corner at world (3x, 3z)
//   edge (x, z, 'x') runs from node (x, z) to node (x+1, z)
//   edge (x, z, 'z') runs from node (x, z) to node (x, z+1)
// Pieces live on cells (foundation, slab), nodes (column) or edges (beam, wall).
// `level` is the storey: 0 is the ground floor. A column or wall on level L
// fills that storey; a beam or slab on level L sits at its top (the floor of L+1).

export const CELL = 3;
export const STOREY = 3;
export const MAX_LEVEL = 11;
export const MAX_PIECES = 800;

export type PieceKind = 'foundation' | 'column' | 'beam' | 'slab' | 'wall';
export type WallMaterial = 'brick' | 'stone' | 'glass' | 'timber';
export type Dir = 'x' | 'z';

/** What a player asks to place. */
export type PieceSpec = {
  kind: PieceKind;
  x: number;
  z: number;
  level: number;
  /** Edges only (beam, wall). */
  dir: Dir | null;
  /** Walls only. */
  material: WallMaterial | null;
};

export type Piece = PieceSpec & { by: string; at: number };

export type PieceInfo = {
  name: string;
  icon: string;
  /** Where it goes, for the build panel. */
  hint: string;
  /** Tonnes. Used by the structural rules in stage 3. */
  weight: number;
  /** Tonnes it can carry. Used by the structural rules in stage 3. */
  capacity: number;
};

export const PIECES: Record<PieceKind, PieceInfo> = {
  foundation: {
    name: 'Foundation',
    icon: '⛏️',
    hint: 'Dig a footing into a pad on the ground floor.',
    weight: 4,
    capacity: 60,
  },
  column: {
    name: 'Column',
    icon: '🏛️',
    hint: 'Stands on a grid corner next to a foundation, or on a column below.',
    weight: 1,
    capacity: 30,
  },
  beam: {
    name: 'Beam',
    icon: '➖',
    hint: 'Spans a grid edge at the top of the floor. Needs a column at one end.',
    weight: 1,
    capacity: 12,
  },
  slab: {
    name: 'Floor slab',
    icon: '⬜',
    hint: 'Fills a cell at the top of the floor. Needs beams on two sides.',
    weight: 3,
    capacity: 8,
  },
  wall: {
    name: 'Wall',
    icon: '🧱',
    hint: 'Fills a grid edge. Stands on the ground, or on a beam or slab below.',
    weight: 2,
    capacity: 6,
  },
};

export type WallInfo = {
  name: string;
  color: string;
  weight: number;
  capacity: number;
};

export const WALLS: Record<WallMaterial, WallInfo> = {
  brick: { name: 'Brick', color: '#c8644a', weight: 2, capacity: 8 },
  stone: { name: 'Stone', color: '#b5ab9c', weight: 3, capacity: 12 },
  glass: { name: 'Glass', color: '#9fd8e8', weight: 1, capacity: 1 },
  timber: { name: 'Timber', color: '#d9a066', weight: 1, capacity: 4 },
};

export const PIECE_KINDS: PieceKind[] = [
  'foundation',
  'column',
  'beam',
  'slab',
  'wall',
];
export const WALL_MATERIALS: WallMaterial[] = [
  'brick',
  'stone',
  'glass',
  'timber',
];

export const isEdgeKind = (k: PieceKind): boolean =>
  k === 'beam' || k === 'wall';
export const isCellKind = (k: PieceKind): boolean =>
  k === 'foundation' || k === 'slab';

/** One slot per position: two pieces can never share a slot. */
export const slotKey = (p: PieceSpec): string =>
  `${p.kind}:${p.x},${p.z},${p.level}${p.dir ?? ''}`;

export const describePiece = (p: PieceSpec): string => {
  const name =
    p.kind === 'wall' && p.material
      ? `${WALLS[p.material].name.toLowerCase()} wall`
      : PIECES[p.kind].name.toLowerCase();
  return p.kind === 'foundation'
    ? `a ${name}`
    : `a ${name} on floor ${p.level + 1}`;
};

/** The city tile a grid cell index falls in (4 cells per tile, tile 0 = cells -2..1). */
export const cellTile = (i: number): number => Math.floor((i + 2) / 4);

/** Cells a piece touches: itself for cells, the 4 around a node, the 2 beside an edge. */
export const touchingCells = (p: PieceSpec): [number, number][] => {
  if (isCellKind(p.kind)) return [[p.x, p.z]];
  if (p.kind === 'column')
    return [
      [p.x - 1, p.z - 1],
      [p.x, p.z - 1],
      [p.x - 1, p.z],
      [p.x, p.z],
    ];
  return p.dir === 'x'
    ? [
        [p.x, p.z - 1],
        [p.x, p.z],
      ]
    : [
        [p.x - 1, p.z],
        [p.x, p.z],
      ];
};

/** Cells under the crane base (it stands at world x≈11, z≈-7.5). */
/** Cells under the crane base and its steel stack (world x 9..18, z -12..-6). */
const isCraneCell = (cx: number, cz: number) =>
  cx >= 3 && cx <= 5 && (cz === -4 || cz === -3);

/** How a piece is put in place: carried by hand, or lifted in by the crane. */
export type PlaceMethod = 'hand' | 'crane';

/** Steel beams, and columns above the ground floor, are too heavy to carry. */
export const needsCrane = (p: PieceSpec): boolean =>
  p.kind === 'beam' || (p.kind === 'column' && p.level > 0);

/** The crane only carries steel. */
export const craneCanCarry = (p: PieceSpec): boolean =>
  p.kind === 'beam' || p.kind === 'column';

export type CellUse = 'buildable' | 'crane' | 'rough';

export const cellUse = (
  pads: readonly string[],
  cx: number,
  cz: number
): CellUse => {
  const tx = cellTile(cx);
  const tz = cellTile(cz);
  if (isCraneCell(cx, cz)) return 'crane';
  return isPad(pads, tx, tz) ? 'buildable' : 'rough';
};

export const buildableCells = (pads: readonly string[]): [number, number][] => {
  const out: [number, number][] = [];
  for (const { x: tx, z: tz } of padTiles(pads)) {
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const cx = tx * 4 - 2 + i;
        const cz = tz * 4 - 2 + j;
        if (cellUse(pads, cx, cz) === 'buildable') out.push([cx, cz]);
      }
  }
  return out;
};

const isWhole = (n: number) => Number.isInteger(n) && Math.abs(n) <= 60;

/** Shape check: the right fields for the kind, and sane numbers. */
export const isWellFormed = (p: PieceSpec): boolean =>
  isWhole(p.x) &&
  isWhole(p.z) &&
  Number.isInteger(p.level) &&
  p.level >= 0 &&
  p.level <= MAX_LEVEL &&
  (isEdgeKind(p.kind) ? p.dir !== null : p.dir === null) &&
  (p.kind === 'wall' ? p.material !== null : p.material === null) &&
  (p.kind !== 'foundation' || p.level === 0);

type Index = Set<string>;

const has = (idx: Index, p: PieceSpec) => idx.has(slotKey(p));

const spec = (
  kind: PieceKind,
  x: number,
  z: number,
  level: number,
  dir: Dir | null = null
): PieceSpec => ({ kind, x, z, level, dir, material: null });

/** Wall slots ignore material, so look walls up by position only. */
const indexOf = (pieces: readonly PieceSpec[]): Index =>
  new Set(pieces.map((p) => slotKey({ ...p, material: null })));

/** Why `p` would not be held up by the pieces in `idx`, or null if it is. */
const supportProblem = (idx: Index, p: PieceSpec): string | null => {
  const L = p.level;
  switch (p.kind) {
    case 'foundation':
      return null;
    case 'column':
      if (L === 0)
        return touchingCells(p).some(([x, z]) =>
          has(idx, spec('foundation', x, z, 0))
        )
          ? null
          : 'A ground-floor column needs a foundation next to it.';
      return has(idx, spec('column', p.x, p.z, L - 1))
        ? null
        : 'A column needs a column right below it.';
    case 'beam': {
      const [ax, az, bx, bz] =
        p.dir === 'x' ? [p.x, p.z, p.x + 1, p.z] : [p.x, p.z, p.x, p.z + 1];
      return has(idx, spec('column', ax, az, L)) ||
        has(idx, spec('column', bx, bz, L))
        ? null
        : 'A beam needs a column at one end on this floor.';
    }
    case 'slab': {
      const edges = [
        spec('beam', p.x, p.z, L, 'x'),
        spec('beam', p.x, p.z + 1, L, 'x'),
        spec('beam', p.x, p.z, L, 'z'),
        spec('beam', p.x + 1, p.z, L, 'z'),
      ];
      return edges.filter((e) => has(idx, e)).length >= 2
        ? null
        : 'A floor slab needs beams on at least two of its sides.';
    }
    case 'wall':
      if (L === 0) return null;
      return has(idx, spec('beam', p.x, p.z, L - 1, p.dir)) ||
        touchingCells(p).some(([x, z]) => has(idx, spec('slab', x, z, L - 1)))
        ? null
        : 'An upper wall needs a beam or floor slab under it.';
  }
};

export type PlaceCheck = { ok: true } | { ok: false; reason: string };

export const canPlace = (
  pieces: readonly PieceSpec[],
  pads: readonly string[],
  p: PieceSpec,
  method: PlaceMethod = 'hand'
): PlaceCheck => {
  if (!isWellFormed(p))
    return { ok: false, reason: "That piece doesn't fit there." };
  if (method === 'hand' && needsCrane(p))
    return {
      ok: false,
      reason:
        p.kind === 'beam'
          ? 'Steel beams are too heavy to carry. Lift them in with the crane.'
          : 'Upper columns go up by crane. Climb into the crane to lift one in.',
    };
  if (method === 'crane' && !craneCanCarry(p))
    return { ok: false, reason: 'The crane only lifts beams and columns.' };
  if (pieces.length >= MAX_PIECES)
    return { ok: false, reason: 'The site is full of pieces for today.' };
  const uses = touchingCells(p).map(([x, z]) => cellUse(pads, x, z));
  if (uses.includes('crane'))
    return { ok: false, reason: 'The crane is in the way.' };
  if (
    p.kind === 'foundation' || p.kind === 'slab'
      ? uses[0] !== 'buildable'
      : !uses.includes('buildable')
  )
    return {
      ok: false,
      reason: 'Pour a pad there first (Site work → Make buildable).',
    };
  const idx = indexOf(pieces);
  if (has(idx, { ...p, material: null }))
    return { ok: false, reason: "There's already a piece there." };
  const problem = supportProblem(idx, p);
  return problem ? { ok: false, reason: problem } : { ok: true };
};

export type RemoveCheck =
  { ok: true; piece: Piece } | { ok: false; reason: string };

/** A player can take down their own piece if nothing else rests on it. */
export const canRemove = (
  pieces: readonly Piece[],
  slot: string,
  user: string
): RemoveCheck => {
  const piece = pieces.find((p) => slotKey(p) === slot);
  if (!piece) return { ok: false, reason: 'That piece is already gone.' };
  if (piece.by !== user)
    return {
      ok: false,
      reason: `That's u/${piece.by}'s piece. You can only take down your own.`,
    };
  const rest = pieces.filter((p) => p !== piece);
  const idx = indexOf(rest);
  const stranded = rest.find((p) => supportProblem(idx, p) !== null);
  if (stranded)
    return {
      ok: false,
      reason: `${capitalize(describePiece(stranded))} rests on it. Remove that first.`,
    };
  return { ok: true, piece };
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- Snapping a tap to the grid ----------

/** The slot of `kind` nearest to world point (wx, wz) on `level`. */
export const snapToGrid = (
  kind: PieceKind,
  wx: number,
  wz: number,
  level: number,
  material: WallMaterial | null
): PieceSpec => {
  const u = wx / CELL;
  const v = wz / CELL;
  const L = kind === 'foundation' ? 0 : level;
  const mat = kind === 'wall' ? (material ?? 'brick') : null;
  if (isCellKind(kind))
    return {
      kind,
      x: Math.floor(u),
      z: Math.floor(v),
      level: L,
      dir: null,
      material: null,
    };
  if (kind === 'column')
    return {
      kind,
      x: Math.round(u),
      z: Math.round(v),
      level: L,
      dir: null,
      material: null,
    };
  // Edges: whichever grid line is closer.
  const du = Math.abs(u - Math.round(u));
  const dv = Math.abs(v - Math.round(v));
  return dv < du
    ? {
        kind,
        x: Math.floor(u),
        z: Math.round(v),
        level: L,
        dir: 'x',
        material: mat,
      }
    : {
        kind,
        x: Math.round(u),
        z: Math.floor(v),
        level: L,
        dir: 'z',
        material: mat,
      };
};
