import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyDeliver,
  applyPlace,
  applyRemove,
  emptyTower,
  type TowerState,
} from './rules.ts';
import {
  buildableCells,
  canPlace,
  deliveryTarget,
  steelOnFloor,
  cellTile,
  slotKey,
  snapToGrid,
  type PieceSpec,
} from './structure.ts';

const piece = (
  kind: PieceSpec['kind'],
  x: number,
  z: number,
  level = 0,
  dir: PieceSpec['dir'] = null,
  material: PieceSpec['material'] = null
): PieceSpec => ({ kind, x, z, level, dir, material });

/** Tower with a pad on tile (1, 0): cells x 2..5, z -2..1. */
const withPad = (): TowerState => ({ ...emptyTower(), pads: ['1,0'] });

const place = (s: TowerState, p: PieceSpec, user = 'ana'): TowerState => {
  const r = applyPlace(s, p, user, 1);
  if ('error' in r) throw new Error(`${slotKey(p)}: ${r.error}`);
  return r.state;
};

void test('cells map onto tiles four to a tile', () => {
  assert.deepEqual([-3, -2, 1, 2, 5, 6].map(cellTile), [-1, 0, 0, 1, 1, 2]);
  // The center tile starts with a pad; tile (1, 0) adds 16 cells.
  assert.equal(buildableCells(emptyTower().pads).length, 16);
  assert.equal(buildableCells(withPad().pads).length, 32);
});

void test('pieces only go on poured pads', () => {
  const s = withPad();
  assert.equal(canPlace(s.pieces, s.pads, piece('foundation', 3, 0)).ok, true);
  assert.equal(canPlace(s.pieces, s.pads, piece('foundation', 0, 0)).ok, true); // starting pad
  assert.equal(canPlace(s.pieces, s.pads, piece('foundation', 7, 0)).ok, false); // no pad
  assert.equal(
    canPlace(s.pieces, s.pads, piece('foundation', 3, 0, 2)).ok,
    false
  ); // underground only
});

void test('a frame goes up foundation → column → beam → slab → wall', () => {
  let s = withPad();
  assert.equal(canPlace(s.pieces, s.pads, piece('column', 3, 0)).ok, false);
  s = place(s, piece('foundation', 3, 0));
  s = place(s, piece('column', 3, 0)); // corner of the foundation cell
  s = place(s, piece('column', 4, 0, 0));
  assert.equal(canPlace(s.pieces, s.pads, piece('column', 5, 0)).ok, false); // no foundation there
  assert.equal(canPlace(s.pieces, s.pads, piece('slab', 3, 0)).ok, false); // no beams yet
  s = place(s, piece('beam', 3, 0, 0, 'x'));
  assert.equal(canPlace(s.pieces, s.pads, piece('slab', 3, 0)).ok, false); // one side only
  s = place(s, piece('foundation', 3, 1));
  s = place(s, piece('column', 3, 1));
  s = place(s, piece('beam', 3, 0, 0, 'z'));
  s = place(s, piece('slab', 3, 0));
  s = place(s, piece('wall', 3, 0, 0, 'x', 'glass'));
  assert.equal(
    canPlace(s.pieces, s.pads, piece('wall', 3, 0, 0, 'x', 'brick')).ok,
    false
  ); // occupied
  // Upstairs: walls need a beam or slab under them; columns need a column below.
  s = place(s, piece('wall', 3, 0, 1, 'z', 'brick'));
  s = place(s, piece('column', 3, 0, 1));
  assert.equal(canPlace(s.pieces, s.pads, piece('column', 5, 0, 1)).ok, false);
  assert.equal(s.recent[0]?.kind, 'place');
  assert.match(s.recent[0]?.summary ?? '', /column on floor 2/);
});

void test('you can only take down your own pieces with nothing resting on them', () => {
  let s = withPad();
  s = place(s, piece('foundation', 3, 0));
  s = place(s, piece('column', 3, 0), 'bo');
  const found = slotKey(piece('foundation', 3, 0));
  const r1 = applyRemove(s, found, 'ana', 2);
  assert.ok('error' in r1 && /column/.test(r1.error));
  const col = slotKey(piece('column', 3, 0));
  assert.ok('error' in applyRemove(s, col, 'ana', 2)); // bo's piece
  const r2 = applyRemove(s, col, 'bo', 2);
  assert.ok(!('error' in r2));
  const r3 = applyRemove(r2.state, found, 'ana', 3);
  assert.ok(!('error' in r3));
  assert.equal(r3.state.pieces.length, 0);
  assert.equal(r3.state.recent[0]?.kind, 'remove');
});

void test('taps snap to the nearest cell, corner or edge', () => {
  assert.deepEqual(snapToGrid('slab', 10, 1, 2, null), piece('slab', 3, 0, 2));
  assert.deepEqual(
    snapToGrid('foundation', 10, 1, 4, null),
    piece('foundation', 3, 0, 0)
  );
  assert.deepEqual(
    snapToGrid('column', 8.4, 0.9, 1, null),
    piece('column', 3, 0, 1)
  );
  assert.deepEqual(
    snapToGrid('beam', 10.5, 0.2, 0, null),
    piece('beam', 3, 0, 0, 'x')
  );
  assert.deepEqual(
    snapToGrid('wall', 9.2, 1.5, 0, 'stone'),
    piece('wall', 3, 0, 0, 'z', 'stone')
  );
});

const CORNERS: [number, number][] = [
  [3, 0],
  [4, 0],
  [5, 0],
  [3, 1],
  [4, 1],
  [5, 1],
];

/** Footings, columns, beams and slabs for the 2×1 cells (3..4, 0) up to `levels` storeys. */
const frame = (start: TowerState, levels: number): TowerState => {
  let s = start;
  s = place(s, piece('foundation', 3, 0));
  s = place(s, piece('foundation', 4, 0));
  for (let L = 0; L < levels; L++) {
    for (const [x, z] of CORNERS) s = place(s, piece('column', x, z, L));
    for (const x of [3, 4]) {
      s = place(s, piece('beam', x, 0, L, 'x'));
      s = place(s, piece('beam', x, 1, L, 'x'));
    }
    s = place(s, piece('slab', 3, 0, L));
    s = place(s, piece('slab', 4, 0, L));
  }
  return s;
};

void test('floors 1 and 2 take steel by hand; higher floors need a crane pallet', () => {
  let s = frame(withPad(), 2); // two storeys built entirely by hand
  const col = piece('column', 3, 0, 2);
  const noSteel = canPlace(s.pieces, s.pads, col, s.pallets);
  assert.ok(!noSteel.ok && /pallet/.test(noSteel.reason));

  // The crane sets 4 columns down on floor 3 (on the slab of cell 3,0).
  const target = deliveryTarget(s.pieces, 'column', 10, 12, 1);
  assert.deepEqual(target, { kind: 'column', x: 3, z: 0, level: 2 });
  assert.equal(deliveryTarget(s.pieces, 'column', 10, 5, 1)?.level, 1); // below the top slab
  assert.equal(deliveryTarget(s.pieces, 'column', 30, 12, 1), null); // no slab there
  const d = applyDeliver(s, { kind: 'column', x: 3, z: 0, level: 2 }, 'bo', 2);
  assert.ok(!('error' in d) && /4 columns up to floor 3/.test(d.summary));
  s = d.state;
  assert.equal(steelOnFloor(s.pallets, 'column', 2), 4);

  // Building from the pallet uses it up; an empty pallet disappears.
  for (const x of [3, 4, 5]) s = place(s, piece('column', x, 0, 2));
  assert.equal(steelOnFloor(s.pallets, 'column', 2), 1);
  s = place(s, piece('column', 3, 1, 2));
  assert.equal(s.pallets.length, 0);
  assert.equal(
    canPlace(s.pieces, s.pads, piece('column', 4, 1, 2), s.pallets).ok,
    false
  );
  // The slab can't be removed while a pallet sits on it.
  const again = applyDeliver(
    s,
    { kind: 'beam', x: 3, z: 0, level: 2 },
    'bo',
    3
  );
  assert.ok(!('error' in again));
  const r = applyRemove(again.state, slotKey(piece('slab', 3, 0, 1)), 'ana', 4);
  assert.ok('error' in r);
  // Pallets only go on slabs.
  assert.ok(
    'error' in applyDeliver(s, { kind: 'beam', x: 9, z: 9, level: 2 }, 'bo', 5)
  );
});

void test('stairs climb the way you face and need an open stairwell', () => {
  let s = frame(withPad(), 1);
  assert.deepEqual(
    snapToGrid('stairs', 10, 1, 1, null, '-x'),
    piece('stairs', 3, 0, 1, '-x')
  );
  // Ground-floor stairs under an existing slab: blocked.
  const under = canPlace(s.pieces, s.pads, piece('stairs', 3, 0, 0, 'x'));
  assert.ok(!under.ok && /stairwell/.test(under.reason));
  // Upstairs on the slab, with nothing above: fine. Then no slab may close it.
  s = place(s, piece('stairs', 3, 0, 1, 'z'));
  assert.equal(
    canPlace(s.pieces, s.pads, piece('stairs', 3, 0, 1, 'x')).ok,
    false
  );
  const lid = canPlace(s.pieces, s.pads, piece('slab', 3, 0, 1));
  assert.ok(!lid.ok && /stairwell/.test(lid.reason));
  // Stairs on bare ground floor work too.
  assert.equal(
    canPlace(s.pieces, s.pads, piece('stairs', 2, -2, 0, 'z')).ok,
    true
  );
});

void test('slabs rest on any two sides held by beams or other slabs', () => {
  const pads = withPad().pads;
  const at = (...ps: PieceSpec[]) => ps.map((p) => ({ ...p, by: 'x', at: 1 }));
  // Slab (3,0) sits on two beams; the rest of the layout is built around it.
  const base = at(
    piece('beam', 3, 0, 0, 'x'),
    piece('beam', 3, 1, 0, 'x'),
    piece('slab', 3, 0)
  );
  const ok = (pieces: PieceSpec[], p: PieceSpec) =>
    canPlace(pieces, pads, p).ok;

  // One beam alone: not enough.
  assert.equal(ok(at(piece('beam', 4, 0, 0, 'x')), piece('slab', 4, 0)), false);
  // Two beams.
  assert.equal(
    ok(
      at(piece('beam', 4, 0, 0, 'x'), piece('beam', 4, 1, 0, 'x')),
      piece('slab', 4, 0)
    ),
    true
  );
  // One beam + one slab: (2,0) has a beam on its top edge and slab (3,0) beside it.
  assert.equal(
    ok([...base, ...at(piece('beam', 2, 1, 0, 'x'))], piece('slab', 2, 0)),
    true
  );
  // Two slabs, no beam of its own: (4,0) between slabs (3,0) and (5,0).
  const twoSlabs = [...base, ...at(piece('slab', 5, 0))];
  assert.equal(ok(twoSlabs, piece('slab', 4, 0)), true);
  // Only one slab next to it: not enough.
  const lone = canPlace(base, pads, piece('slab', 4, 0));
  assert.ok(!lone.ok && /two supported sides/.test(lone.reason));
});

void test('a block of slabs cannot hold itself up without any beam', () => {
  const s = withPad();
  // 2×2 block with no beams at all: every slab would touch two others.
  const pieces = [
    piece('slab', 3, 0),
    piece('slab', 4, 0),
    piece('slab', 3, 1),
  ].map((p) => ({ ...p, by: 'x', at: 1 }));
  const r = canPlace(pieces, s.pads, piece('slab', 4, 1));
  assert.ok(!r.ok && /beam/.test(r.reason));
});

void test('slabs can rest on walls', () => {
  const pads = withPad().pads;
  const at = (...ps: PieceSpec[]) => ps.map((p) => ({ ...p, by: 'x', at: 1 }));
  // A room of two brick walls holds a roof slab with no beams at all.
  const room = at(
    piece('wall', 3, 0, 0, 'x', 'brick'),
    piece('wall', 3, 1, 0, 'x', 'brick')
  );
  assert.equal(canPlace(room, pads, piece('slab', 3, 0)).ok, true);
  // Next door, (4,0) shares a wall with slab (3,0): the wall counts once, so one side.
  const next = [
    ...room,
    ...at(piece('slab', 3, 0), piece('wall', 4, 0, 0, 'z', 'stone')),
  ];
  assert.equal(canPlace(next, pads, piece('slab', 4, 0)).ok, false);
  // Add a glass wall on its far side: two walls hold it.
  const twoWalls = [...next, ...at(piece('wall', 4, 1, 0, 'x', 'glass'))];
  assert.equal(canPlace(twoWalls, pads, piece('slab', 4, 0)).ok, true);
  // A lone wall is one side only.
  const one = canPlace(
    at(piece('wall', 6, 0, 0, 'x', 'brick')),
    pads,
    piece('slab', 5, 0)
  );
  assert.equal(one.ok, false);
});

void test('upper walls can stand on the wall below', () => {
  const pads = withPad().pads;
  const below = [{ ...piece('wall', 3, 0, 0, 'x', 'stone'), by: 'x', at: 1 }];
  assert.equal(
    canPlace(below, pads, piece('wall', 3, 0, 1, 'x', 'brick')).ok,
    true
  );
  assert.equal(
    canPlace(below, pads, piece('wall', 4, 0, 1, 'x', 'brick')).ok,
    false
  );
});

void test('upper columns stand on any floor, not only on a column', () => {
  const pads = ['1,0', '2,0'];
  const at = (...ps: PieceSpec[]) => ps.map((p) => ({ ...p, by: 'x', at: 1 }));
  const floor = at(piece('slab', 3, 0, 0));
  // On a slab: corner (4,1) is a corner of slab (3,0).
  assert.equal(canPlace(floor, pads, piece('column', 4, 1, 1)).ok, true);
  // On a beam or a wall below.
  assert.equal(
    canPlace(at(piece('beam', 6, 0, 0, 'x')), pads, piece('column', 7, 0, 1))
      .ok,
    true
  );
  assert.equal(
    canPlace(
      at(piece('wall', 6, 0, 0, 'z', 'brick')),
      pads,
      piece('column', 6, 0, 1)
    ).ok,
    true
  );
  // Nothing below: no.
  const air = canPlace([], pads, piece('column', 4, 1, 1));
  assert.ok(!air.ok && /floor under it/.test(air.reason));
});

void test('beams bolt end to end into long lines that rest on a column somewhere', () => {
  const pads = ['1,0', '2,0', '3,0'];
  const at = (...ps: PieceSpec[]) => ps.map((p) => ({ ...p, by: 'x', at: 1 }));
  // One column at the start, then a bridge of beams marching along +x.
  let pieces = at(piece('foundation', 3, 0), piece('column', 3, 0));
  for (let x = 3; x < 9; x++) {
    const b = piece('beam', x, 0, 0, 'x');
    const r = canPlace(pieces, pads, b);
    assert.ok(r.ok, `beam ${x}: ${r.ok ? '' : r.reason}`);
    pieces = [...pieces, ...at(b)];
  }
  // And around a corner.
  assert.equal(canPlace(pieces, pads, piece('beam', 9, 0, 0, 'z')).ok, true);
  // A beam sitting on a wall needs no column.
  assert.equal(
    canPlace(
      at(piece('wall', 12, 0, 0, 'x', 'stone')),
      pads,
      piece('beam', 12, 0, 0, 'x')
    ).ok,
    true
  );
  // Beams bolted only to each other, far from any column or wall: no.
  const floating = at(piece('beam', 20, 0, 0, 'x'));
  const r = canPlace(floating, ['5,0'], piece('beam', 21, 0, 0, 'x'));
  assert.ok(!r.ok && /column or wall somewhere/.test(r.reason));
  // The start column now carries the whole bridge, so it can't be taken down.
  const all = pieces.map((p) => ({ ...p, by: 'ana' }));
  assert.ok(
    'error' in
      applyRemove(
        { ...emptyTower(), pads, pieces: all },
        slotKey(piece('column', 3, 0)),
        'ana',
        9
      )
  );
});
