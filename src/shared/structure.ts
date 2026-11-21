import { isPad, padTiles } from './city.ts';

// Freeform building on the poured pads.
//
// The site has a 3 m build grid (a 12 m tile = 4×4 cells, matching the chalk
// lines on the pads) and 3 m storeys. Grid coordinates are global:
//   cell (x, z)  covers world [3x, 3x+3] × [3z, 3z+3]
//   node (x, z)  is the grid corner at world (3x, 3z)
//   edge (x, z, 'x') runs from node (x, z) to node (x+1, z)
//   edge (x, z, 'z') runs from node (x, z) to node (x, z+1)
// Pieces live on cells (foundation, slab, stairs), nodes (column) or edges
// (beam, wall). `level` is the storey: 0 is the ground floor. A column, wall
// or flight of stairs on level L fills that storey; a beam or slab on level L
// sits at its top (the floor of L+1).
//
// Steel: workers carry beams and columns by hand on the first HAND_LEVELS
// floors. Higher up, the crane delivers pallets of steel onto a floor slab and
// each beam or column built on that floor uses one from a pallet there.

export const CELL = 3;
/** Storey height (m): walls and columns are this tall. */
export const STOREY = 4;
/** 48 storeys: almost 200 m, room for a supertall. */
export const MAX_LEVEL = 47;
export const MAX_PIECES = 2500;

export type PieceKind =
  | 'foundation'
  | 'column'
  | 'beam'
  | 'slab'
  | 'wall'
  | 'stairs'
  | 'lean'
  | 'brace'
  | 'arch'
  | 'spire';
export type WallMaterial = 'brick' | 'stone' | 'glass' | 'timber';
/**
 * Edges run along +x or +z. Stairs climb toward one of the four axis
 * directions. Leaning columns tilt toward any of the eight neighbors.
 */
export type Dir = 'x' | 'z' | '-x' | '-z' | 'x+z' | 'x-z' | '-x+z' | '-x-z';

/** Grid step for each direction. */
export const DIR_OFFSET: Record<Dir, [number, number]> = {
  x: [1, 0],
  z: [0, 1],
  '-x': [-1, 0],
  '-z': [0, -1],
  'x+z': [1, 1],
  'x-z': [1, -1],
  '-x+z': [-1, 1],
  '-x-z': [-1, -1],
};
export const ALL_DIRS: Dir[] = [
  'x',
  'z',
  '-x',
  '-z',
  'x+z',
  'x-z',
  '-x+z',
  '-x-z',
];
const AXIS_DIRS: Dir[] = ['x', 'z', '-x', '-z'];

/** What a player asks to place. */
export type PieceSpec = {
  kind: PieceKind;
  x: number;
  z: number;
  level: number;
  /** Edges (beam, wall): 'x' or 'z'. Stairs: the direction they climb. */
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
    hint: 'Stands on a grid corner: next to a footing on the ground, or on any floor above.',
    weight: 1,
    capacity: 30,
  },
  beam: {
    name: 'Beam',
    icon: '➖',
    hint: 'Spans a grid edge at the top of the floor. Rests on a column or wall, or bolts onto another beam.',
    weight: 1,
    capacity: 12,
  },
  slab: {
    name: 'Floor slab',
    icon: '⬜',
    hint: 'Fills a cell at the top of the floor. Needs two sides held by beams, walls or other slabs.',
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
  stairs: {
    name: 'Stairs',
    icon: '🪜',
    hint: 'Fills a cell and climbs the way you face. Leave the cell above open.',
    weight: 2,
    capacity: 6,
  },
  lean: {
    name: 'Leaning column',
    icon: '📐',
    hint: 'A column that leans one cell the way you face (diagonals too) over one floor. Stack them for tapering legs.',
    weight: 1,
    capacity: 24,
  },
  brace: {
    name: 'Cross brace',
    icon: '❎',
    hint: 'Steel X bracing across a grid edge. Needs a column or leaning column at both ends.',
    weight: 0.5,
    capacity: 10,
  },
  arch: {
    name: 'Arch',
    icon: '🌉',
    hint: 'A curved steel arch along a grid edge, between columns at both ends.',
    weight: 1,
    capacity: 14,
  },
  spire: {
    name: 'Spire',
    icon: '🗼',
    hint: 'A tall spire on a grid corner: the tip of a tower.',
    weight: 1,
    capacity: 0,
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
  'stairs',
  'lean',
  'brace',
  'arch',
  'spire',
];
export const WALL_MATERIALS: WallMaterial[] = [
  'brick',
  'stone',
  'glass',
  'timber',
];

export const isEdgeKind = (k: PieceKind): boolean =>
  k === 'beam' || k === 'wall' || k === 'brace' || k === 'arch';
export const isCellKind = (k: PieceKind): boolean =>
  k === 'foundation' || k === 'slab' || k === 'stairs';
/** Pieces that stand on a grid corner. */
export const isNodeKind = (k: PieceKind): boolean =>
  k === 'column' || k === 'lean' || k === 'spire';

/**
 * One slot per position: two pieces can never share a slot. Edges and
 * leaning columns include their direction (several legs may leave one corner).
 */
export const slotKey = (p: PieceSpec): string =>
  `${p.kind}:${p.x},${p.z},${p.level}${isEdgeKind(p.kind) || p.kind === 'lean' ? (p.dir ?? '') : ''}`;

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
const nodeCells = (x: number, z: number): [number, number][] => [
  [x - 1, z - 1],
  [x, z - 1],
  [x - 1, z],
  [x, z],
];

export const touchingCells = (p: PieceSpec): [number, number][] => {
  if (isCellKind(p.kind)) return [[p.x, p.z]];
  if (p.kind === 'lean') {
    // Both ends: the corner it stands on and the corner it leans to.
    const [dx, dz] = p.dir ? DIR_OFFSET[p.dir] : [0, 0];
    return [...nodeCells(p.x, p.z), ...nodeCells(p.x + dx, p.z + dz)];
  }
  if (isNodeKind(p.kind)) return nodeCells(p.x, p.z);
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

/** Cells under the crane base and its steel stack (world x 9..18, z -12..-6). */
const isCraneCell = (cx: number, cz: number) =>
  cx >= 3 && cx <= 5 && (cz === -4 || cz === -3);

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
  (isEdgeKind(p.kind)
    ? p.dir === 'x' || p.dir === 'z'
    : p.kind === 'stairs'
      ? p.dir !== null && AXIS_DIRS.includes(p.dir)
      : p.kind === 'lean'
        ? p.dir !== null
        : p.dir === null) &&
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

/** Slots ignore wall material and stair direction, so look pieces up by position. */
const indexOf = (pieces: readonly PieceSpec[]): Index =>
  new Set(pieces.map(slotKey));

/** Why `p` would not be held up by the pieces in `idx`, or null if it is. */
const supportProblem = (idx: Index, p: PieceSpec): string | null => {
  const L = p.level;
  switch (p.kind) {
    case 'foundation':
      return null;
    case 'column':
    case 'lean':
    case 'spire':
      return standsAt(idx, p.x, p.z, L);
    case 'brace':
    case 'arch': {
      const ends = beamEnds(p);
      return ends.every(([x, z]) => nodePost(idx, x, z, L))
        ? null
        : `${p.kind === 'arch' ? 'An arch' : 'A brace'} needs a column or leaning column at both ends.`;
    }
    case 'beam':
      if (beamHeld(idx, p.x, p.z, p.dir, L)) return null;
      if (!beamEnds(p).some(([x, z]) => nodeHasBeam(idx, x, z, L)))
        return 'A beam needs a column or wall under it, or another beam to bolt onto.';
      return reachesColumn(idx, p, L)
        ? null
        : 'This line of beams needs a column or wall somewhere to rest on.';
    case 'slab': {
      const sides = slabSides(idx, p.x, p.z, L);
      if (sides.filter((s) => s !== 'open').length < 2)
        return 'A floor slab needs two supported sides: beams, walls or other slabs.';
      return sides.some(holdsUp) || reachesSupport(idx, p.x, p.z, L)
        ? null
        : 'These slabs need to rest on at least one beam or wall somewhere.';
    }
    case 'wall':
      if (L === 0) return null;
      return has(idx, spec('beam', p.x, p.z, L - 1, p.dir)) ||
        has(idx, spec('wall', p.x, p.z, L - 1, p.dir)) ||
        touchingCells(p).some(([x, z]) => has(idx, spec('slab', x, z, L - 1)))
        ? null
        : 'An upper wall needs a wall, beam or floor slab under it.';
    case 'stairs':
      return L === 0 || has(idx, spec('slab', p.x, p.z, L - 1))
        ? null
        : 'Upper stairs need a floor slab under them.';
  }
};

/** Corner (x, z) at the top of storey L carries load: a column, or a leaning column ending there. */
const nodeTop = (idx: Index, x: number, z: number, L: number): boolean =>
  has(idx, spec('column', x, z, L)) ||
  ALL_DIRS.some((d) => {
    const [dx, dz] = DIR_OFFSET[d];
    return has(idx, spec('lean', x - dx, z - dz, L, d));
  });

/** Some upright stands at corner (x, z) in storey L: a column, or a leaning column from or to it. */
const nodePost = (idx: Index, x: number, z: number, L: number): boolean =>
  nodeTop(idx, x, z, L) ||
  ALL_DIRS.some((d) => has(idx, spec('lean', x, z, L, d)));

/**
 * Can something upright (column, leaning column, spire) stand on corner
 * (x, z) of storey L? On the ground it needs a footing beside it; higher up,
 * any floor below: a slab, beam, wall, or the top of a column below.
 */
const standsAt = (
  idx: Index,
  x: number,
  z: number,
  L: number
): string | null => {
  if (L === 0)
    return nodeCells(x, z).some(([cx, cz]) =>
      has(idx, spec('foundation', cx, cz, 0))
    )
      ? null
      : 'On the ground floor this needs a footing next to it.';
  return nodeTop(idx, x, z, L - 1) ||
    nodeEdges(x, z).some(
      ([ex, ez, dir]) =>
        has(idx, spec('beam', ex, ez, L - 1, dir)) ||
        has(idx, spec('wall', ex, ez, L - 1, dir))
    ) ||
    nodeCells(x, z).some(([cx, cz]) => has(idx, spec('slab', cx, cz, L - 1)))
    ? null
    : 'This needs a floor under it: a slab, beam, wall or column.';
};

/** The two corners a beam or wall edge runs between. */
const beamEnds = (p: PieceSpec): [number, number][] =>
  p.dir === 'x'
    ? [
        [p.x, p.z],
        [p.x + 1, p.z],
      ]
    : [
        [p.x, p.z],
        [p.x, p.z + 1],
      ];

/** The four edges that meet at corner (x, z). */
const nodeEdges = (x: number, z: number): [number, number, Dir][] => [
  [x, z, 'x'],
  [x - 1, z, 'x'],
  [x, z, 'z'],
  [x, z - 1, 'z'],
];

const nodeHasBeam = (idx: Index, x: number, z: number, L: number) =>
  nodeEdges(x, z).some(([ex, ez, dir]) =>
    has(idx, spec('beam', ex, ez, L, dir))
  );

/** Is this beam held directly: a column at either end, or a wall right under it? */
const beamHeld = (
  idx: Index,
  x: number,
  z: number,
  dir: Dir | null,
  L: number
): boolean => {
  const b = spec('beam', x, z, L, dir);
  return (
    has(idx, spec('wall', x, z, L, dir)) ||
    beamEnds(b).some(([nx, nz]) => nodeTop(idx, nx, nz, L))
  );
};

/**
 * Do the beams bolted to `p` (end to end, through shared corners) reach a
 * column or wall anywhere? Without this, a chain of beams could float.
 */
const reachesColumn = (idx: Index, p: PieceSpec, L: number): boolean => {
  const seen = new Set<string>();
  const queue: PieceSpec[] = [p];
  while (queue.length > 0 && seen.size < 400) {
    const b = queue.shift();
    if (!b) break;
    const key = slotKey(b);
    if (seen.has(key)) continue;
    seen.add(key);
    if (b !== p && beamHeld(idx, b.x, b.z, b.dir, L)) return true;
    for (const [nx, nz] of beamEnds(b)) {
      if (nodeTop(idx, nx, nz, L)) return true;
      for (const [ex, ez, dir] of nodeEdges(nx, nz)) {
        const next = spec('beam', ex, ez, L, dir);
        if (has(idx, next) && !seen.has(slotKey(next))) queue.push(next);
      }
    }
  }
  return false;
};

type Side = 'beam' | 'wall' | 'slab' | 'open';

/** Beams and walls carry a slab down to the ground; a neighboring slab only shares the load. */
const holdsUp = (s: Side) => s === 'beam' || s === 'wall';

/**
 * What holds each of a slab cell's four sides: a beam on that edge, a wall
 * under it (walls fill the storey up to the slab), a slab next door, or nothing.
 */
const slabSides = (idx: Index, x: number, z: number, L: number): Side[] =>
  (
    [
      [x, z, 'x', x, z - 1],
      [x, z + 1, 'x', x, z + 1],
      [x, z, 'z', x - 1, z],
      [x + 1, z, 'z', x + 1, z],
    ] satisfies [number, number, Dir, number, number][]
  ).map(([ex, ez, dir, nx, nz]) =>
    has(idx, spec('beam', ex, ez, L, dir))
      ? 'beam'
      : has(idx, spec('wall', ex, ez, L, dir))
        ? 'wall'
        : has(idx, spec('slab', nx, nz, L))
          ? 'slab'
          : 'open'
  );

/**
 * Do the slabs joined to cell (x, z) on storey L rest on a beam or wall
 * anywhere? Without this, a block of slabs could hold itself up in mid-air.
 */
const reachesSupport = (
  idx: Index,
  x: number,
  z: number,
  L: number
): boolean => {
  const seen = new Set<string>();
  const queue: [number, number][] = [[x, z]];
  while (queue.length > 0 && seen.size < 400) {
    const [cx, cz] = queue.shift() ?? [x, z];
    const key = `${cx},${cz}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sides = slabSides(idx, cx, cz, L);
    if (sides.some(holdsUp)) return true;
    const next: [number, number][] = [
      [cx, cz - 1],
      [cx, cz + 1],
      [cx - 1, cz],
      [cx + 1, cz],
    ];
    next.forEach((n, i) => {
      if (sides[i] === 'slab') queue.push(n);
    });
  }
  return false;
};

// ---------- Steel pallets ----------

export type SteelKind = 'beam' | 'column';

/** Floors 1 and 2 (levels 0 and 1): steel is carried up by hand. */
export const HAND_LEVELS = 2;

/** What the crane can bring up in one trip. */
export type CraneLoadId = 'beams' | 'columns' | 'mixed';

export const CRANE_LOADS: Record<
  CraneLoadId,
  { beam: number; column: number }
> = {
  beams: { beam: 24, column: 0 },
  columns: { beam: 0, column: 16 },
  mixed: { beam: 16, column: 8 },
};

export const CRANE_LOAD_IDS: CraneLoadId[] = ['beams', 'columns', 'mixed'];

/** Most steel one pallet can hold. */
const PALLET_MAX = 80;
export const MAX_PALLETS = 40;

/** A spot on an upper floor: the slab of cell (x, z) that floors `level`. */
export type DropSpot = { x: number; z: number; level: number };

/** What a crane drop asks for: a load, set down at a spot. */
export type DropSpec = DropSpot & { load: CraneLoadId };

/** A stack of one kind of steel on a floor. A mixed drop makes two, side by side. */
export type PalletSpec = DropSpot & { kind: SteelKind };

export type Pallet = PalletSpec & { left: number; by: string; at: number };

/** Which pallet steel a piece is cut from: columns and leaning columns use columns; beams, braces and arches use beams. */
export const steelOf = (k: PieceKind): SteelKind | null =>
  k === 'column' || k === 'lean'
    ? 'column'
    : k === 'beam' || k === 'brace' || k === 'arch'
      ? 'beam'
      : null;

/** Steel pieces above floor 2 come off a pallet on their own floor. */
export const needsPallet = (p: PieceSpec): boolean =>
  steelOf(p.kind) !== null && p.level >= HAND_LEVELS;

/** Steel of `kind` waiting on floor `level`. */
export const steelOnFloor = (
  pallets: readonly Pallet[],
  kind: SteelKind,
  level: number
): number =>
  pallets
    .filter((q) => q.kind === kind && q.level === level)
    .reduce((n, q) => n + q.left, 0);

/** Where a load hanging at world (wx, wy, wz) would land: the highest slab below it. */
export const deliveryTarget = (
  pieces: readonly PieceSpec[],
  wx: number,
  wy: number,
  wz: number
): DropSpot | null => {
  const x = Math.floor(wx / CELL);
  const z = Math.floor(wz / CELL);
  let best = -1;
  for (const p of pieces)
    if (
      p.kind === 'slab' &&
      p.x === x &&
      p.z === z &&
      (p.level + 1) * STOREY < wy &&
      p.level > best
    )
      best = p.level;
  return best < 0 ? null : { x, z, level: best + 1 };
};

const STEEL_KINDS: SteelKind[] = ['beam', 'column'];

/** The pallets a drop adds to (or creates): one per kind of steel in the load. */
export const dropParts = (d: DropSpec): { kind: SteelKind; n: number }[] =>
  STEEL_KINDS.map((kind) => ({ kind, n: CRANE_LOADS[d.load][kind] })).filter(
    (part) => part.n > 0
  );

const palletAt = (pallets: readonly Pallet[], kind: SteelKind, d: DropSpot) =>
  pallets.find(
    (q) => q.kind === kind && q.x === d.x && q.z === d.z && q.level === d.level
  );

export const canDeliver = (
  pieces: readonly PieceSpec[],
  pallets: readonly Pallet[],
  d: DropSpec
): PlaceCheck => {
  if (!isWhole(d.x) || !isWhole(d.z) || !Number.isInteger(d.level))
    return { ok: false, reason: "The load can't go there." };
  if (d.level < 1 || d.level > MAX_LEVEL)
    return { ok: false, reason: 'Set the pallet down on a floor slab.' };
  if (!has(indexOf(pieces), spec('slab', d.x, d.z, d.level - 1)))
    return { ok: false, reason: 'Set the pallet down on a floor slab.' };
  const parts = dropParts(d);
  if (
    parts.some(
      ({ kind, n }) => (palletAt(pallets, kind, d)?.left ?? 0) + n > PALLET_MAX
    )
  )
    return {
      ok: false,
      reason: 'That pallet is already full. Use it up first.',
    };
  const fresh = parts.filter(({ kind }) => !palletAt(pallets, kind, d)).length;
  if (pallets.length + fresh > MAX_PALLETS)
    return {
      ok: false,
      reason: 'Too many pallets on site. Use some up first.',
    };
  return { ok: true };
};

export type PlaceCheck = { ok: true } | { ok: false; reason: string };

export const canPlace = (
  pieces: readonly PieceSpec[],
  pads: readonly string[],
  p: PieceSpec,
  /** Crane-delivered steel; pass null where steel is carried by hand at any height (plots). */
  pallets: readonly Pallet[] | null = []
): PlaceCheck => {
  if (!isWellFormed(p))
    return { ok: false, reason: "That piece doesn't fit there." };
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
  if (has(idx, p))
    return { ok: false, reason: "There's already a piece there." };
  if (p.kind === 'stairs' && has(idx, spec('slab', p.x, p.z, p.level)))
    return {
      ok: false,
      reason: 'Stairs need an open stairwell: there is a slab right above.',
    };
  if (p.kind === 'slab' && has(idx, spec('stairs', p.x, p.z, p.level)))
    return { ok: false, reason: "Keep it open: that's the stairwell." };
  const problem = supportProblem(idx, p);
  if (problem) return { ok: false, reason: problem };
  const steel = steelOf(p.kind);
  if (
    steel &&
    pallets &&
    needsPallet(p) &&
    steelOnFloor(pallets, steel, p.level) < 1
  )
    return {
      ok: false,
      reason: `No ${steel}s on floor ${p.level + 1}. Bring a pallet up with the crane.`,
    };
  return { ok: true };
};

export type RemoveCheck =
  { ok: true; piece: Piece } | { ok: false; reason: string };

/** A player can take down their own piece if nothing else rests on it. */
export const canRemove = (
  pieces: readonly Piece[],
  slot: string,
  user: string,
  pallets: readonly Pallet[] = []
): RemoveCheck => {
  const piece = pieces.find((p) => slotKey(p) === slot);
  if (!piece) return { ok: false, reason: 'That piece is already gone.' };
  if (piece.by !== user)
    return {
      ok: false,
      reason: `That's u/${piece.by}'s piece. You can only take down your own.`,
    };
  if (
    piece.kind === 'slab' &&
    pallets.some(
      (q) => q.x === piece.x && q.z === piece.z && q.level === piece.level + 1
    )
  )
    return {
      ok: false,
      reason: 'A pallet of steel sits on it. Use it up first.',
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

/** The one of eight directions (axes and diagonals) closest to a heading. */
export const facingDir8 = (heading: number): Dir => {
  const order: Dir[] = ['z', 'x+z', 'x', 'x-z', '-z', '-x-z', '-x', '-x+z'];
  const i = Math.round(heading / (Math.PI / 4));
  return order[((i % 8) + 8) % 8] ?? 'z';
};

/** The direction closest to a heading (radians, 0 = +z). */
export const facingDir = (heading: number): Dir => {
  const sx = Math.sin(heading);
  const cz = Math.cos(heading);
  return Math.abs(sx) > Math.abs(cz)
    ? sx > 0
      ? 'x'
      : '-x'
    : cz > 0
      ? 'z'
      : '-z';
};

/** The slot of `kind` nearest to world point (wx, wz) on `level`. */
export const snapToGrid = (
  kind: PieceKind,
  wx: number,
  wz: number,
  level: number,
  material: WallMaterial | null,
  facing: Dir = 'z'
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
      dir: kind === 'stairs' ? facing : null,
      material: null,
    };
  if (isNodeKind(kind))
    return {
      kind,
      x: Math.round(u),
      z: Math.round(v),
      level: L,
      dir: kind === 'lean' ? facing : null,
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
