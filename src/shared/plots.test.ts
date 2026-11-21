import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blueprintTiles, progressOf } from './blueprints.ts';
import {
  LEVELS,
  PLOT_BLOCKS,
  blockTile,
  buyTile,
  freeBlock,
  landPrice,
  newPlot,
  placeOnPlot,
  plotAt,
  removeFromPlot,
  rentDue,
  rentRate,
  tilesNeeded,
  type Plot,
} from './plots.ts';
import { slotKey } from './structure.ts';

const HOUR = 3_600_000;

/** Build the plot's current level piece by piece. */
const finishLevel = (p: Plot, at: number) => {
  const lvl = LEVELS[p.level];
  assert.ok(lvl);
  const bp = lvl.blueprint(p.block);
  let plot = p;
  let bonus = 0;
  let finished: string | null = null;
  for (const piece of bp.pieces) {
    const r = placeOnPlot(plot, piece, at);
    if (!r.ok)
      throw new Error(
        `${bp.id}: ${piece.kind} ${piece.x},${piece.z} L${piece.level}: ${r.reason}`
      );
    plot = r.plot;
    bonus += r.bonus;
    finished = r.finished ?? finished;
  }
  return { plot, bonus, finished };
};

void test('plots fill the blocks around the middle, nearest first', () => {
  assert.equal(PLOT_BLOCKS.length, 24);
  assert.deepEqual(
    PLOT_BLOCKS.slice(0, 4).map((b) =>
      Math.max(Math.abs(b.bx), Math.abs(b.bz))
    ),
    [1, 1, 1, 1]
  );
  const first = freeBlock([]);
  assert.ok(first);
  const taken = newPlot('ana', first, 0);
  assert.notDeepEqual(freeBlock([taken]), first);
});

void test('every level fits its own land on the block, without overlapping', () => {
  const block = { bx: 1, bz: 0 };
  const seen = new Set<string>();
  LEVELS.forEach((lvl, i) => {
    const bp = lvl.blueprint(block);
    const own = new Set(lvl.tiles.map(([a, b]) => blockTile(block, a, b)));
    // Every tile the plan stands on is in this block.
    const blockTiles = new Set(
      [0, 1, 2].flatMap((a) => [0, 1, 2].map((b) => blockTile(block, a, b)))
    );
    for (const t of blueprintTiles(bp))
      assert.ok(
        blockTiles.has(t) || !own.has(t),
        `level ${i + 1} reaches ${t}`
      );
    for (const p of bp.pieces) {
      assert.ok(
        !seen.has(slotKey(p)),
        `level ${i + 1} overlaps an earlier level at ${slotKey(p)}`
      );
      seen.add(slotKey(p));
    }
  });
});

void test('the whole campaign: build, earn, buy land, level up', () => {
  let plot = newPlot('ana', { bx: 1, bz: 0 }, 0);
  let coins = 0;
  let now = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    // Buy the land this level needs, waiting for rent when short.
    while (tilesNeeded(plot).length > 0) {
      const r = buyTile(plot, coins);
      if (r.ok) {
        coins -= r.price;
        plot = r.plot;
        continue;
      }
      assert.ok(
        rentRate(plot) > 0,
        `stuck before level ${i + 1} with ${coins} coins`
      );
      now += HOUR;
      const due = rentDue(plot, now);
      coins += due.coins;
      plot = { ...plot, rentAt: due.rentAt };
    }
    const r = finishLevel(plot, now);
    assert.ok(r.finished, `level ${i + 1} did not finish`);
    coins += r.bonus;
    plot = r.plot;
    assert.equal(plot.level, i + 1);
  }
  assert.equal(
    rentRate(plot),
    LEVELS.reduce((n, l) => n + l.rent, 0)
  );
  assert.equal(tilesNeeded(plot).length, 0); // nothing left to build
  assert.ok(now < 48 * HOUR, `the campaign took ${now / HOUR} hours of rent`);
});

void test('rent pays whole coins and keeps the leftover time', () => {
  const plot = { ...newPlot('ana', { bx: 1, bz: 0 }, 0), level: 1 }; // 6 coins/hour
  const due = rentDue(plot, 30 * 60_000); // half an hour
  assert.equal(due.coins, 3);
  assert.equal(due.rentAt, 30 * 60_000);
  const early = rentDue(plot, 5 * 60_000);
  assert.equal(early.coins, 0);
  assert.equal(early.rentAt, 0);
});

void test('land costs more as you grow; you can only build on your own land', () => {
  const plot = newPlot('ana', { bx: 1, bz: 0 }, 0);
  assert.equal(landPrice(plot), 40);
  const level2 = { ...plot, level: 1 };
  assert.equal(buyTile(level2, 10).ok, false);
  const r = buyTile(level2, 40);
  assert.ok(r.ok);
  assert.equal(landPrice(r.plot), 65);
  // Plan pieces outside the land you own are refused.
  const pavilion = LEVELS[1]?.blueprint(plot.block).pieces[0];
  assert.ok(pavilion);
  assert.equal(placeOnPlot(level2, pavilion, 1).ok, false);
  assert.equal(placeOnPlot(r.plot, pavilion, 1).ok, true);
  assert.equal(plotAt([r.plot], pavilion), r.plot);
});

void test('finished buildings are rented out and stay up', () => {
  const r = finishLevel(newPlot('ana', { bx: 1, bz: 0 }, 0), 5);
  assert.equal(r.finished, 'Brick cottage');
  assert.equal(r.bonus, LEVELS[0]?.bonus);
  const wall = r.plot.pieces[0];
  assert.ok(wall);
  const gone = removeFromPlot(r.plot, slotKey(wall));
  assert.ok(!gone.ok && /rented/.test(gone.reason));
  const cottagePlan = LEVELS[0]?.blueprint(r.plot.block);
  assert.ok(cottagePlan);
  const prog = progressOf(cottagePlan, r.plot.pieces);
  assert.equal(prog.done, prog.total);
});
