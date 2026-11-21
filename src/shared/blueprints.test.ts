import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  blueprintTiles,
  cottage,
  dailyBlueprint,
  dayStart,
  fitToPlan,
  house,
  latticeTower,
  pavilion,
  planAt,
  progressOf,
  watchtower,
  type Blueprint,
} from './blueprints.ts';
import { applyPlace, emptyTower, type TowerState } from './rules.ts';
import {
  HAND_LEVELS,
  MAX_LEVEL,
  type Pallet,
  type Piece,
} from './structure.ts';

const STEEL: Pallet['kind'][] = ['beam', 'column'];

/** Plenty of crane steel on every upper floor, as if the crane kept up. */
const steelEverywhere = (): Pallet[] =>
  Array.from({ length: MAX_LEVEL + 1 - HAND_LEVELS }, (_, i) =>
    STEEL.map((kind): Pallet => ({
      kind,
      x: 0,
      z: 0,
      level: i + HAND_LEVELS,
      left: 999,
      by: 'crane',
      at: 1,
    }))
  ).flat();

/** Build a blueprint piece by piece, in its own order, through the real rules. */
const buildAll = (bp: Blueprint): TowerState => {
  let s: TowerState = {
    ...emptyTower(),
    pads: blueprintTiles(bp),
    pallets: steelEverywhere(),
  };
  bp.pieces.forEach((p, i) => {
    const r = applyPlace(s, p, 'ana', i);
    if ('error' in r)
      throw new Error(
        `${bp.id} piece ${i} (${p.kind} ${p.x},${p.z} L${p.level}): ${r.error}`
      );
    s = r.state;
  });
  return s;
};

void test('every blueprint can be built piece by piece under the rules', () => {
  for (const bp of [
    cottage(-5, -1, 'brick'),
    cottage(-5, -1, 'stone'),
    pavilion(-5, -1),
    house(-5, -1, 'timber'),
    watchtower(-5, -1),
    latticeTower(-5, -1),
  ]) {
    const s = buildAll(bp);
    const prog = progressOf(bp, s.pieces);
    assert.equal(prog.done, prog.total, bp.id);
    assert.equal(prog.missing.length, 0);
  }
});

void test('progress counts matching pieces; a wrong material does not count', () => {
  const bp = cottage(0, 0, 'stone');
  const wall = bp.pieces[0];
  assert.ok(wall);
  const brick: Piece = { ...wall, material: 'brick', by: 'x', at: 1 };
  assert.equal(progressOf(bp, [brick]).done, 0);
  assert.equal(progressOf(bp, [{ ...wall, by: 'x', at: 1 }]).done, 1);
  assert.equal(planAt(bp, brick)?.material, 'stone');
});

void test('the daily blueprint is fixed per day and its pads come poured', () => {
  assert.deepEqual(dailyBlueprint('2026-11-21'), dailyBlueprint('2026-11-21'));
  const ids = new Set(
    Array.from(
      { length: 30 },
      (_, i) =>
        dailyBlueprint(`2026-12-${String(i + 1).padStart(2, '0')}`).id.split(
          '-'
        )[0]
    )
  );
  assert.ok(ids.size >= 3, `only ${[...ids].join(', ')} in a month`);
  const start = dayStart('2026-11-21');
  assert.deepEqual(start.pads, blueprintTiles(dailyBlueprint('2026-11-21')));
  assert.equal(start.pieces.length, 0);
});

void test('aiming at the plan takes its direction and material, and stacks elevator shafts', () => {
  const bp = watchtower(-5, -1);
  const shaft = bp.pieces.filter((p) => p.kind === 'lift');
  const base = shaft[0];
  assert.ok(base && shaft.length === 5);
  // Facing the "wrong" way: the door still comes out as planned.
  const fitted = fitToPlan(bp, [], { ...base, dir: '-z' });
  assert.equal(fitted.dir, base.dir);
  // Standing at the foot of the shaft: each Place goes one storey higher.
  const placed = [{ ...base, by: 'x', at: 1 }];
  assert.equal(fitToPlan(bp, placed, base).level, 1);
  const two = [...placed, { ...base, level: 1, by: 'x', at: 2 }];
  assert.equal(fitToPlan(bp, two, base).level, 2);
  // A wall aimed with the wrong material takes the plan's.
  const cot = cottage(0, 0, 'stone');
  const wall = cot.pieces[0];
  assert.ok(wall);
  assert.equal(
    fitToPlan(cot, [], { ...wall, material: 'glass' }).material,
    'stone'
  );
  // Off the plan, nothing changes.
  const off = { ...wall, x: wall.x + 40 };
  assert.deepEqual(fitToPlan(cot, [], off), off);
});
