import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dayNumber,
  makeChallenge,
  roundEndsAt,
  utcDateKey,
} from './challenge.ts';
import { THEMES } from './content.ts';
import {
  MILESTONES,
  applyAction,
  emptyTower,
  evaluate,
  previewAction,
  scores,
  weakFloors,
  type Action,
  type TowerState,
} from './rules.ts';

const DATE = '2026-11-18';
const c = makeChallenge(DATE);

const play = (s: TowerState, ...actions: Parameters<typeof applyAction>[1][]) =>
  actions.reduce((acc, a, i) => {
    const r = applyAction(acc, a, c, `p${i}`, i);
    if ('error' in r) throw new Error(r.error);
    return r.state;
  }, s);

void test('challenge is deterministic per date and differs across dates', () => {
  assert.deepEqual(makeChallenge(DATE), makeChallenge(DATE));
  assert.notDeepEqual(makeChallenge(DATE), makeChallenge('2026-11-19'));
  assert.equal(c.materials.length, 3);
  assert.equal(c.decorations.length, 3);
  assert.ok(c.materials.some((m) => ['brick', 'steel', 'stone'].includes(m)));
});

void test('themes do not repeat within a cycle', () => {
  const start = dayNumber('2026-01-01');
  const cycleStart = start - (start % THEMES.length);
  const seen = new Set<string>();
  for (let d = 0; d < THEMES.length; d++) {
    const key = new Date((cycleStart + d) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    seen.add(makeChallenge(key).theme.id);
  }
  assert.equal(seen.size, THEMES.length);
});

void test('UTC date boundary', () => {
  assert.equal(utcDateKey(new Date('2026-11-18T23:59:59Z')), '2026-11-18');
  assert.equal(utcDateKey(new Date('2026-11-19T00:00:00Z')), '2026-11-19');
  assert.equal(roundEndsAt('2026-11-18'), Date.parse('2026-11-19T00:00:00Z'));
});

void test('build adds height and records the contribution', () => {
  const s = play(emptyTower(), { kind: 'build', material: c.materials[0]! });
  assert.equal(s.floors.length, 1);
  assert.ok(scores(s, c).height > 0);
  assert.equal(s.shiftCount, 1);
  assert.equal(s.recent[0]!.user, 'p0');
});

void test('reinforce fixes the weakest floor and never lowers stability', () => {
  let s = emptyTower();
  for (let i = 0; i < 9; i++)
    s = play(s, { kind: 'build', material: c.materials[i % 3]! });
  const weakBefore = weakFloors(s, c).length;
  const p = previewAction(s, { kind: 'reinforce' }, c);
  assert.ok(p.ok);
  assert.ok(p.after.stability >= p.before.stability);
  if (weakBefore > 0) assert.ok(p.after.stability > p.before.stability);
});

void test('decorate needs a floor and adds style', () => {
  const d = { kind: 'decorate' as const, decor: c.decorations[0]! };
  assert.equal(previewAction(emptyTower(), d, c).ok, false);
  const s = play(emptyTower(), { kind: 'build', material: c.materials[0]! });
  const p = previewAction(s, d, c);
  assert.ok(p.ok && p.after.style > p.before.style);
});

void test('actions outside today’s challenge are rejected', () => {
  const notToday = (
    ['brick', 'timber', 'steel', 'glass', 'stone', 'bamboo'] as const
  ).find((m) => !c.materials.includes(m))!;
  const r = applyAction(
    emptyTower(),
    { kind: 'build', material: notToday },
    c,
    'x',
    0
  );
  assert.ok('error' in r);
});

void test('evaluate gives stars for met targets', () => {
  assert.equal(evaluate(emptyTower(), c).stars, 0);
  let s = emptyTower();
  const sturdiest = c.materials[0]!;
  while (scores(s, c).height < c.targets.height)
    s = play(s, { kind: 'build', material: sturdiest });
  for (let i = 0; i < 30 && weakFloors(s, c).length > 0; i++)
    s = play(s, { kind: 'reinforce' });
  const v = evaluate(s, c);
  assert.ok(v.met.height);
  assert.ok(v.scores.stability >= c.targets.stability);
});

void test('no theme or condition repeats on consecutive days for a year', () => {
  let prev = makeChallenge('2026-01-01');
  for (let d = 1; d < 366; d++) {
    const key = new Date(Date.parse('2026-01-01T00:00:00Z') + d * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const cur = makeChallenge(key);
    assert.notEqual(cur.theme.id, prev.theme.id, key);
    assert.notEqual(cur.condition.id, prev.condition.id, key);
    prev = cur;
  }
});

// ---------- Crew ----------

const build: Action = { kind: 'build', material: c.materials[0]! };

void test('answering the open request is teamwork and grows the chain', () => {
  let s = emptyTower();
  const step = (
    a: Parameters<typeof applyAction>[1],
    user: string,
    ask: 'build' | 'reinforce' | 'decorate' | null
  ) => {
    const r = applyAction(s, a, c, user, 1, ask);
    if ('error' in r) throw new Error(r.error);
    s = r.state;
    return r;
  };
  step(build, 'a', 'build');
  assert.deepEqual(s.request, { kind: 'build', by: 'a' });
  assert.equal(s.spirit, 1);
  assert.equal(s.chain, 0);

  const r2 = step(build, 'b', 'build');
  assert.equal(r2.preview.teamwork, true);
  assert.equal(s.recent[0]!.teamwork, true);
  assert.equal(s.chain, 1);
  assert.equal(s.spirit, 3);

  step(build, 'c', 'build');
  step(build, 'd', 'reinforce'); // chain 3: bonus spirit
  assert.equal(s.chain, 3);
  assert.equal(s.spirit, 3 + 2 + 3);

  // Ignoring the request is fine, it just resets the chain.
  step({ kind: 'decorate', decor: c.decorations[0]! }, 'e', null);
  assert.equal(s.chain, 0);
  assert.equal(s.request, null);
  assert.equal(s.recent[0]!.teamwork, false);
});

void test('you cannot answer your own request', () => {
  const r = applyAction(emptyTower(), build, c, 'a', 1, 'build');
  assert.ok(!('error' in r));
  const p = previewAction(r.state, build, c, 'a');
  assert.ok(p.ok && !p.teamwork);
});

void test('crew milestones add style, sturdiness and a spire', () => {
  let s = emptyTower();
  for (let i = 0; i < 6; i++) s = play(s, build);
  s = { ...s, spirit: 0 }; // baseline without crew bonuses
  const base = scores(s, c);
  const weakBase = weakFloors(s, c).length;

  const at = (id: string) => MILESTONES.find((m) => m.id === id)!.at;
  const picnic = scores({ ...s, spirit: at('picnic') }, c);
  assert.equal(picnic.style, base.style + 4);
  assert.equal(picnic.height, base.height);

  const scaffold = { ...s, spirit: at('scaffold') };
  assert.ok(weakFloors(scaffold, c).length <= weakBase);
  assert.ok(scores(scaffold, c).stability >= base.stability);

  const spire = scores({ ...s, spirit: at('spire') }, c);
  assert.equal(spire.height, base.height + 6);
  assert.equal(spire.style, base.style + 8);
});

void test('preview reports milestones a shift would unlock', () => {
  const s = { ...play(emptyTower(), build), spirit: MILESTONES[0]!.at - 1 };
  const p = previewAction(s, build, c, 'z');
  assert.ok(p.ok);
  assert.deepEqual(
    p.unlocks.map((m) => m.id),
    ['picnic']
  );
});
