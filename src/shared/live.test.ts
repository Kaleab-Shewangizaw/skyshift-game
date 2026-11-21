import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSid, parseLiveMessage, parsePresence } from './live.ts';

void test('live messages parse only with a session id and the right fields', () => {
  const piece = {
    kind: 'wall',
    x: 1,
    z: 2,
    level: 0,
    dir: 'x',
    material: 'brick',
  };
  assert.deepEqual(
    parseLiveMessage({
      t: 'piece',
      sid: 'abc123',
      by: 'ana',
      block: null,
      place: piece,
      remove: null,
    }),
    {
      t: 'piece',
      sid: 'abc123',
      by: 'ana',
      block: null,
      place: piece,
      remove: null,
    }
  );
  assert.equal(
    parseLiveMessage({ t: 'piece', sid: 'abc123', by: 'ana' }),
    null
  ); // nothing to do
  assert.equal(parseLiveMessage({ t: 'changed', by: 'ana' }), null); // no session
  assert.deepEqual(parseLiveMessage({ t: 'changed', sid: 'zz99', by: 'ana' }), {
    t: 'changed',
    sid: 'zz99',
    by: 'ana',
  });
  const pos = parseLiveMessage({
    t: 'pos',
    sid: 'abcd',
    user: 'bo',
    x: 1,
    y: 2,
    z: 3,
    h: 0.5,
    vx: 4,
    vz: -1,
  });
  assert.ok(pos && pos.t === 'pos' && pos.vx === 4 && pos.crane === false);
  assert.equal(isSid('ABC!'), false);
  assert.equal(parsePresence({ x: 1, y: 2, z: Infinity, h: 0 }), null);
});
