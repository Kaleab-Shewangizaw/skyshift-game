import { hashString, makeRng } from './rng.ts';
import { emptyTower, type TowerState } from './rules.ts';
import {
  cellTile,
  slotKey,
  touchingCells,
  type Dir,
  type Piece,
  type PieceKind,
  type PieceSpec,
  type WallMaterial,
} from './structure.ts';

// Blueprints: target buildings made of our pieces. Players see the missing
// pieces as a see-through plan and fill it in. Each blueprint is a generator,
// so sizes and materials can vary, and the pieces come out in an order that
// is buildable one by one (the tests place every blueprint to prove it).

export type Blueprint = {
  id: string;
  name: string;
  blurb: string;
  /** Pieces in a buildable order, already placed on the site. */
  pieces: PieceSpec[];
};

/** Small builder that collects pieces relative to an anchor cell. */
const plan = (ax: number, az: number) => {
  const out: PieceSpec[] = [];
  const add = (
    kind: PieceKind,
    x: number,
    z: number,
    level = 0,
    dir: Dir | null = null,
    material: WallMaterial | null = null
  ) => out.push({ kind, x: ax + x, z: az + z, level, dir, material });
  return {
    out,
    footing: (x: number, z: number) => add('foundation', x, z),
    column: (x: number, z: number, L: number) => add('column', x, z, L),
    beam: (x: number, z: number, L: number, dir: 'x' | 'z') =>
      add('beam', x, z, L, dir),
    slab: (x: number, z: number, L: number) => add('slab', x, z, L),
    wall: (x: number, z: number, L: number, dir: 'x' | 'z', m: WallMaterial) =>
      add('wall', x, z, L, dir, m),
    brace: (x: number, z: number, L: number, dir: 'x' | 'z') =>
      add('brace', x, z, L, dir),
    stairs: (x: number, z: number, L: number, dir: Dir) =>
      add('stairs', x, z, L, dir),
    spire: (x: number, z: number, L: number) => add('spire', x, z, L),
    /** An elevator shaft in cell (x, z) from the ground up through storey `top`, door facing `door`. */
    lift: (x: number, z: number, top: number, door: Dir) => {
      for (let L = 0; L <= top; L++) add('lift', x, z, L, door);
    },
  };
};

/** The edges around a w × d rectangle of cells, as [x, z, dir]. */
const perimeter = (w: number, d: number): [number, number, 'x' | 'z'][] => [
  ...Array.from({ length: w }, (_, x): [number, number, 'x'] => [x, 0, 'x']),
  ...Array.from({ length: w }, (_, x): [number, number, 'x'] => [x, d, 'x']),
  ...Array.from({ length: d }, (_, z): [number, number, 'z'] => [0, z, 'z']),
  ...Array.from({ length: d }, (_, z): [number, number, 'z'] => [w, z, 'z']),
];

const MATERIAL_NAME: Record<WallMaterial, string> = {
  brick: 'Brick',
  stone: 'Stone',
  timber: 'Timber',
  glass: 'Glass',
};

/** 2 × 2 cottage: four walls (one doorway) carrying a flat roof. */
export const cottage = (ax: number, az: number, m: WallMaterial): Blueprint => {
  const p = plan(ax, az);
  for (const [x, z, dir] of perimeter(2, 2))
    if (!(x === 0 && z === 0 && dir === 'x')) p.wall(x, z, 0, dir, m);
  // Corner slabs first: each sits on two walls; the doorway slab rests on its neighbors.
  for (const [x, z] of [
    [1, 0],
    [0, 1],
    [1, 1],
    [0, 0],
  ])
    p.slab(x ?? 0, z ?? 0, 0);
  return {
    id: `cottage-${m}`,
    name: `${MATERIAL_NAME[m]} cottage`,
    blurb: 'Four walls and a flat roof. Leave the front doorway open.',
    pieces: p.out,
  };
};

/** 3 × 2 steel-framed glass pavilion. */
export const pavilion = (ax: number, az: number): Blueprint => {
  const p = plan(ax, az);
  for (const [x, z] of [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
  ])
    p.footing(x ?? 0, z ?? 0);
  for (const [x, z] of [
    [0, 0],
    [3, 0],
    [0, 2],
    [3, 2],
  ])
    p.column(x ?? 0, z ?? 0, 0);
  // Beams outward from the corner columns, so each bolts onto one already up.
  for (const z of [0, 2]) {
    p.beam(0, z, 0, 'x');
    p.beam(2, z, 0, 'x');
    p.beam(1, z, 0, 'x');
  }
  for (const x of [0, 3]) {
    p.beam(x, 0, 0, 'z');
    p.beam(x, 1, 0, 'z');
  }
  for (const [x, z, dir] of perimeter(3, 2))
    if (!(x === 1 && z === 0 && dir === 'x')) p.wall(x, z, 0, dir, 'glass');
  for (const [x, z] of [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [1, 0],
    [1, 1],
  ])
    p.slab(x ?? 0, z ?? 0, 0);
  return {
    id: 'pavilion',
    name: 'Glass pavilion',
    blurb:
      'A steel frame wrapped in glass. Footings, corner columns, beams, then glass.',
    pieces: p.out,
  };
};

/** 3 × 3 two-storey house with windows and a staircase. */
export const house = (ax: number, az: number, m: WallMaterial): Blueprint => {
  const p = plan(ax, az);
  const windows = new Set(['0,1,z', '3,1,z', '0,3,x', '2,3,x']);
  for (const L of [0, 1])
    for (const [x, z, dir] of perimeter(3, 3)) {
      if (L === 0 && x === 1 && z === 0 && dir === 'x') continue; // front door
      p.wall(x, z, L, dir, windows.has(`${x},${z},${dir}`) ? 'glass' : m);
    }
  // Ground-floor ceiling, leaving the stairwell (cell 2,1) open.
  const firstFloor: [number, number][] = [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
    [1, 0],
    [0, 1],
    [1, 2],
    [1, 1],
  ];
  for (const [x, z] of firstFloor) p.slab(x, z, 0);
  p.stairs(2, 1, 0, 'z');
  for (const [x, z] of [...firstFloor, [2, 1] satisfies [number, number]])
    p.slab(x, z, 1);
  // The upstairs walls were listed before the floor; put them after it.
  const walls = p.out.filter((q) => q.kind === 'wall');
  const ground = walls.filter((q) => q.level === 0);
  const upper = walls.filter((q) => q.level === 1);
  const rest = p.out.filter((q) => q.kind !== 'wall');
  const floor0 = rest.filter((q) => q.level === 0);
  const roof = rest.filter((q) => q.level === 1);
  return {
    id: `house-${m}`,
    name: `Two-storey ${MATERIAL_NAME[m].toLowerCase()} house`,
    blurb: 'Two floors with windows and stairs. Keep the stairwell open.',
    pieces: [...ground, ...floor0, ...upper, ...roof],
  };
};

/** 2 × 2 braced steel watchtower, five storeys and a spire. Needs the crane. */
export const watchtower = (ax: number, az: number): Blueprint => {
  const p = plan(ax, az);
  const LEVELS = 5;
  for (const [x, z] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ])
    p.footing(x ?? 0, z ?? 0);
  const ring: [number, number][] = [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
    [2, 2],
    [1, 2],
    [0, 2],
    [0, 1],
  ];
  // An elevator up one corner cell, so nobody has to climb five storeys.
  p.lift(0, 0, LEVELS - 1, 'x');
  for (let L = 0; L < LEVELS; L++) {
    for (const [x, z] of ring) p.column(x, z, L);
    for (const [x, z, dir] of perimeter(2, 2)) p.brace(x, z, L, dir);
  }
  const top = LEVELS - 1;
  for (const [x, z, dir] of perimeter(2, 2)) p.beam(x, z, top, dir);
  for (const [x, z] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ])
    p.slab(x ?? 0, z ?? 0, top);
  p.spire(1, 1, LEVELS);
  return {
    id: 'watchtower',
    name: 'Braced watchtower',
    blurb:
      'Five braced storeys, an elevator and a spire. Above floor 2 the steel comes up by crane.',
    pieces: p.out,
  };
};

/**
 * Eiffel-style iron lattice tower on an 8 × 8-cell base. Four legs lean
 * diagonally inward for two storeys to a first platform, lean in once more
 * to a braced 2 × 2 core, which rises six storeys to a spire.
 */
export const latticeTower = (ax: number, az: number): Blueprint => {
  const p = plan(ax, az);
  const add = (
    kind: PieceKind,
    x: number,
    z: number,
    level: number,
    dir: Dir | null = null
  ) => p.out.push({ kind, x: ax + x, z: az + z, level, dir, material: null });
  const B = 8;
  // Legs: from each corner toward the middle, one cell per storey.
  const legs: [number, number, Dir][] = [
    [0, 0, 'x+z'],
    [B, 0, '-x+z'],
    [0, B, 'x-z'],
    [B, B, '-x-z'],
  ];
  for (const [x, z] of [
    [0, 0],
    [B - 1, 0],
    [0, B - 1],
    [B - 1, B - 1],
  ])
    p.footing(x ?? 0, z ?? 0);
  for (let L = 0; L < 3; L++)
    for (const [x, z, dir] of legs) {
      const [dx, dz] = [Math.sign(B / 2 - x), Math.sign(B / 2 - z)];
      add('lean', x + dx * L, z + dz * L, L, dir);
    }
  // An elevator up the middle (cell 3, 3), stopping at each deck.
  const TOP_DECK = 8;
  p.lift(3, 3, TOP_DECK, 'x');
  // First platform: a 4 × 4 deck on the leg tops after two storeys.
  const deck = (lo: number, hi: number, L: number) => {
    for (let x = lo; x < hi; x++) {
      p.beam(x, lo, L, 'x');
      p.beam(x, hi, L, 'x');
    }
    for (let z = lo; z < hi; z++) {
      p.beam(lo, z, L, 'z');
      p.beam(hi, z, L, 'z');
    }
    // Slabs ring by ring from the edge inward, so each has two held sides.
    const cells: [number, number][] = [];
    for (let x = lo; x < hi; x++)
      for (let z = lo; z < hi; z++) cells.push([x, z]);
    const edgeDist = ([x, z]: [number, number]) =>
      Math.min(x - lo, z - lo, hi - 1 - x, hi - 1 - z);
    const corner = ([x, z]: [number, number]) =>
      (x === lo || x === hi - 1) && (z === lo || z === hi - 1);
    cells.sort(
      (a, b) =>
        edgeDist(a) - edgeDist(b) || Number(corner(b)) - Number(corner(a))
    );
    for (const [x, z] of cells) p.slab(x, z, L);
  };
  deck(2, B - 2, 1);
  // The core: a ring of eight columns around a 2 × 2 square, braced on every side.
  const lo = 3;
  const hi = B - 3;
  deck(lo, hi, 2);
  const ring: [number, number][] = [
    [3, 3],
    [4, 3],
    [5, 3],
    [5, 4],
    [5, 5],
    [4, 5],
    [3, 5],
    [3, 4],
  ];
  const TOP = TOP_DECK;
  for (let L = 3; L <= TOP; L++) {
    for (const [x, z] of ring) p.column(x, z, L);
    for (const [x, z, dir] of perimeter(2, 2)) p.brace(lo + x, lo + z, L, dir);
  }
  deck(lo, hi, TOP);
  p.spire(4, 4, TOP + 1);
  return {
    id: 'lattice-tower',
    name: 'Iron lattice tower',
    blurb:
      'Four leaning legs, a platform, a braced core, an elevator and a spire. A landmark!',
    pieces: p.out,
  };
};

// ---------- The daily challenge ----------

/** The daily build goes on the starting block, clear of the crane. */
const DAILY_ANCHOR: [number, number] = [-5, -1];

const DAILY: ((ax: number, az: number, pick: () => number) => Blueprint)[] = [
  (ax, az, pick) => cottage(ax, az, pickMaterial(pick)),
  (ax, az) => pavilion(ax, az),
  (ax, az, pick) => house(ax, az, pickMaterial(pick)),
  (ax, az) => watchtower(ax, az),
];

const SOLID: WallMaterial[] = ['brick', 'stone', 'timber'];
const pickMaterial = (pick: () => number): WallMaterial =>
  SOLID[Math.floor(pick() * SOLID.length)] ?? 'brick';

/** Today's community blueprint, the same for every post and player on that UTC day. */
export const dailyBlueprint = (dateKey: string): Blueprint => {
  const rng = makeRng(hashString(`skyshift:daily:${dateKey}`));
  const make = DAILY[Math.floor(rng() * DAILY.length)] ?? DAILY[0];
  if (!make) throw new Error('No daily blueprints');
  return make(DAILY_ANCHOR[0], DAILY_ANCHOR[1], rng);
};

/** The city tiles a blueprint stands on; they start the day with pads poured. */
export const blueprintTiles = (bp: Blueprint): string[] => {
  const tiles = new Set<string>();
  for (const p of bp.pieces)
    for (const [cx, cz] of touchingCells(p))
      tiles.add(`${cellTile(cx)},${cellTile(cz)}`);
  return [...tiles];
};

// ---------- Progress ----------

/** A placed piece matches a planned one when it fills the same slot the same way. */
const sameAs = (a: PieceSpec, b: PieceSpec) =>
  slotKey(a) === slotKey(b) && a.material === b.material && a.dir === b.dir;

export type Progress = {
  done: number;
  total: number;
  /** Planned pieces nobody has placed yet. */
  missing: PieceSpec[];
};

export const progressOf = (
  bp: Blueprint,
  pieces: readonly Piece[]
): Progress => {
  const placed = new Map<string, PieceSpec>();
  for (const p of pieces) placed.set(slotKey(p), p);
  const missing = bp.pieces.filter((want) => {
    const got = placed.get(slotKey(want));
    return !got || !sameAs(got, want);
  });
  return {
    done: bp.pieces.length - missing.length,
    total: bp.pieces.length,
    missing,
  };
};

/** What the plan wants in the slot `spec` aims at, if anything. */
export const planAt = (bp: Blueprint, spec: PieceSpec): PieceSpec | undefined =>
  bp.pieces.find((q) => slotKey(q) === slotKey(spec));

/** A new day's site: empty, with pads already poured under today's blueprint. */
export const dayStart = (dateKey: string): TowerState => ({
  ...emptyTower(),
  pads: blueprintTiles(dailyBlueprint(dateKey)),
});

/**
 * Help the player follow the plan. When they aim at a slot the blueprint
 * wants, their piece takes the plan's direction and material (an elevator's
 * door, a staircase's direction, a wall's brick or glass). And standing at
 * the foot of a planned elevator shaft, each new piece goes on top of the
 * shaft so far, so it can be built from the ground up.
 */
export const fitToPlan = (
  bp: Blueprint,
  placed: readonly PieceSpec[],
  spec: PieceSpec
): PieceSpec => {
  let s = spec;
  if (s.kind === 'lift') {
    const have = new Set(
      placed
        .filter((p) => p.kind === 'lift' && p.x === s.x && p.z === s.z)
        .map((p) => p.level)
    );
    if (have.has(s.level)) {
      const next = bp.pieces
        .filter((p) => p.kind === 'lift' && p.x === s.x && p.z === s.z)
        .map((p) => p.level)
        .sort((a, b) => a - b)
        .find((l) => !have.has(l));
      if (next !== undefined && next > s.level) s = { ...s, level: next };
    }
  }
  const want = planAt(bp, s);
  return want && want.kind === s.kind
    ? { ...s, dir: want.dir, material: want.material }
    : s;
};
