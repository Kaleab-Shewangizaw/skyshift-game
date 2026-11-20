import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CITY_RADIUS,
  MAX_SITE_TILES,
  baseTile,
  canDemolish,
  canPrepare,
  demolishCandidates,
  groundAt,
  isPad,
  padTiles,
  prepareCandidates,
  isRoadLine,
  siteTiles,
  tileAt,
  tileKey,
} from './city.ts';
import {
  applyDemolish,
  applyPrepare,
  applySiteWork,
  emptyTower,
} from './rules.ts';

void test('the city grid is deterministic with roads every 4th line', () => {
  assert.deepEqual(baseTile(4, 5), baseTile(4, 5));
  assert.equal(baseTile(0, 0).kind, 'lot');
  assert.equal(baseTile(2, 0).kind, 'road');
  assert.equal(baseTile(-6, 3).kind, 'road');
  assert.ok(isRoadLine(-2) && isRoadLine(6) && !isRoadLine(4));
  const b = baseTile(4, 4);
  assert.ok(b.kind === 'building' || b.kind === 'park');
});

void test('only tiles touching the site can be demolished', () => {
  assert.equal(canDemolish([], 2, 0).ok, true); // road right next to the starting block
  assert.equal(canDemolish([], 3, 0).ok, false); // one tile too far
  assert.equal(canDemolish([], 0, 0).ok, false); // already site
  assert.equal(canDemolish([], CITY_RADIUS + 1, 0).ok, false);
  // After clearing the road, the building behind it becomes reachable.
  assert.equal(canDemolish([tileKey(2, 0)], 3, 0).ok, true);
});

void test('demolishing grows the site and logs it, but costs no shift', () => {
  const r = applyDemolish(emptyTower(), 2, 0, 'ana', 5);
  assert.ok(!('error' in r));
  assert.deepEqual(r.state.site, ['2,0']);
  assert.equal(tileAt(r.state.site, 2, 0).kind, 'lot');
  assert.equal(r.state.shiftCount, 0);
  assert.equal(r.state.spirit, 0);
  assert.equal(r.state.recent[0]?.kind, 'demolish');
  assert.match(r.state.recent[0]?.summary ?? '', /road/);

  const again = applyDemolish(r.state, 2, 0, 'bo', 6);
  assert.ok('error' in again);
});

void test('the site is capped', () => {
  let s = emptyTower();
  let guard = 0;
  while (guard++ < 200) {
    const next = demolishCandidates(s.site)[0];
    if (!next) break;
    const r = applyDemolish(s, next.x, next.z, 'ana', guard);
    if ('error' in r) throw new Error(r.error);
    s = r.state;
  }
  assert.equal(siteTiles(s.site).length, MAX_SITE_TILES);
  assert.equal(demolishCandidates(s.site).length, 0);
});

void test('players choose which site tiles become buildable pads', () => {
  let s = emptyTower();
  assert.ok(isPad(s.pads, 0, 0)); // the tower's tile starts buildable
  assert.equal(prepareCandidates(s.site, s.pads).length, 8);
  assert.equal(canPrepare(s.site, s.pads, 0, 0).ok, false); // already a pad
  assert.equal(canPrepare(s.site, s.pads, 2, 0).ok, false); // outside the fence

  const dirt = applyPrepare(s, 1, 1, 'ana', 1);
  assert.ok(!('error' in dirt));
  s = dirt.state;
  assert.deepEqual(s.pads, ['1,1']);
  assert.equal(s.recent[0]?.kind, 'prepare');
  assert.match(s.recent[0]?.summary ?? '', /dirt/);
  assert.equal(s.shiftCount, 0);
  assert.ok('error' in applyPrepare(s, 1, 1, 'bo', 2));

  // Demolished land arrives as rubble and can then be prepared too.
  const cleared = applySiteWork(s, 'demolish', 2, 0, 'bo', 3);
  assert.ok(!('error' in cleared));
  assert.equal(groundAt(cleared.state.site, 2, 0), 'rubble');
  const poured = applySiteWork(cleared.state, 'prepare', 2, 0, 'bo', 4);
  assert.ok(!('error' in poured));
  assert.match(poured.state.recent[0]?.summary ?? '', /rubble/);
  assert.equal(padTiles(poured.state.pads).length, 3);
});
