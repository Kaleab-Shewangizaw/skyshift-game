import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyPlace,
  applyRemove,
  emptyTower,
  type TowerState,
} from './rules.ts';
import {
  buildableCells,
  canPlace,
  needsCrane,
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
  // Steel goes up by crane, like in the game.
  const r = applyPlace(s, p, user, 1, needsCrane(p) ? 'crane' : 'hand');
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

void test('heavy steel goes up by crane; the crane only lifts steel', () => {
  let s = withPad();
  s = place(s, piece('foundation', 3, 0));
  const beam = piece('beam', 3, 0, 0, 'x');
  assert.equal(canPlace(s.pieces, s.pads, piece('column', 3, 0)).ok, true); // ground column by hand
  s = place(s, piece('column', 3, 0));
  const byHand = canPlace(s.pieces, s.pads, beam);
  assert.ok(!byHand.ok && /crane/.test(byHand.reason));
  assert.equal(canPlace(s.pieces, s.pads, beam, 'crane').ok, true);
  assert.equal(canPlace(s.pieces, s.pads, piece('column', 3, 0, 1)).ok, false);
  assert.equal(
    canPlace(s.pieces, s.pads, piece('column', 3, 0, 1), 'crane').ok,
    true
  );
  assert.equal(
    canPlace(s.pieces, s.pads, piece('foundation', 4, 0), 'crane').ok,
    false
  );
  const r = applyPlace(s, beam, 'ana', 5, 'crane');
  assert.ok(!('error' in r) && /craned in a beam/.test(r.summary));
});
