import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeChallenge } from './challenge.ts';
import { applyAction, emptyTower } from './rules.ts';
import { parseAction, parseShiftRequest, parseTowerJson } from './validate.ts';

void test('parseAction accepts the three shapes and strips extras', () => {
  assert.deepEqual(parseAction({ kind: 'reinforce', floor: 3 }), {
    kind: 'reinforce',
  });
  assert.deepEqual(
    parseAction({ kind: 'build', material: 'brick', height: 99 }),
    { kind: 'build', material: 'brick' }
  );
  assert.deepEqual(parseAction({ kind: 'decorate', decor: 'flag' }), {
    kind: 'decorate',
    decor: 'flag',
  });
});

void test('parseAction rejects unknown kinds, ids and prototype keys', () => {
  for (const bad of [
    null,
    'build',
    {},
    { kind: 'demolish' },
    { kind: 'build' },
    { kind: 'build', material: 'gold' },
    { kind: 'build', material: 'toString' },
    { kind: 'decorate', decor: '__proto__' },
  ]) {
    assert.equal(parseAction(bad), null, JSON.stringify(bad));
  }
});

void test('parseShiftRequest requires a valid date key', () => {
  const action = { kind: 'reinforce' };
  assert.deepEqual(parseShiftRequest({ dateKey: '2026-11-19', action }), {
    dateKey: '2026-11-19',
    action,
    ask: null,
  });
  assert.deepEqual(
    parseShiftRequest({ dateKey: '2026-11-19', action, ask: 'decorate' }),
    {
      dateKey: '2026-11-19',
      action,
      ask: 'decorate',
    }
  );
  assert.equal(
    parseShiftRequest({ dateKey: '2026-11-19', action, ask: 'dance' }),
    null
  );
  assert.equal(parseShiftRequest({ dateKey: 'today', action }), null);
  assert.equal(parseShiftRequest({ action }), null);
});

void test('parseTowerJson round-trips real state and flags corruption', () => {
  const c = makeChallenge('2026-11-19');
  const r = applyAction(
    emptyTower(),
    { kind: 'build', material: c.materials[0]! },
    c,
    'ana',
    1_700_000_000_000
  );
  assert.ok(!('error' in r));
  assert.deepEqual(parseTowerJson(JSON.stringify(r.state)), r.state);
  assert.deepEqual(parseTowerJson(undefined), emptyTower());
  assert.equal(parseTowerJson('{not json'), null);
  // Towers saved before crew fields existed still load.
  assert.deepEqual(
    parseTowerJson(JSON.stringify({ floors: [], recent: [], shiftCount: 0 })),
    emptyTower()
  );
  assert.equal(
    parseTowerJson(
      JSON.stringify({
        floors: [{ material: 'gold' }],
        recent: [],
        shiftCount: 1,
      })
    ),
    null
  );
});
