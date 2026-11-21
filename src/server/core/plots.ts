import { redis } from '@devvit/web/server';
import type {
  PlotRequest,
  PlotResponse,
  StateResponse,
} from '../../shared/api';
import {
  buyTile,
  freeBlock,
  newPlot,
  placeOnPlot,
  removeFromPlot,
  rentDue,
  type Plot,
} from '../../shared/plots';
import { parsePlotJson } from '../../shared/validate';
import { RETRY, committed, optimistic } from './txn';

// The post's city persists across days (no expiry):
//   plots:{postId}  hash  userId -> JSON Plot
//   coins:{postId}  hash  userId -> integer coins

export const plotsKey = (postId: string) => `plots:${postId}`;
export const coinsKey = (postId: string) => `coins:${postId}`;

const readPlots = async (postId: string): Promise<Plot[]> => {
  const all = await redis.hGetAll(plotsKey(postId));
  return Object.values(all)
    .map(parsePlotJson)
    .filter((p): p is Plot => p !== null);
};

const readCoins = async (postId: string, userId: string): Promise<number> => {
  const raw = await redis.hGet(coinsKey(postId), userId);
  const n = Number(raw ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/** Everyone's plots, plus the viewer's coins. */
export const readCity = async (
  postId: string,
  userId: string | undefined
): Promise<Pick<StateResponse, 'plots' | 'coins'>> => {
  const [plots, coins] = await Promise.all([
    readPlots(postId),
    userId ? readCoins(postId, userId) : Promise.resolve(0),
  ]);
  return { plots, coins };
};

/** Pay out the rent this player's buildings earned since their last visit. */
export const collectRent = async (
  postId: string,
  userId: string,
  now: number
): Promise<void> => {
  const pk = plotsKey(postId);
  const ck = coinsKey(postId);
  await optimistic<void>([pk, ck], async (txn) => {
    const plot = parsePlotJson(await redis.hGet(pk, userId));
    const due = plot ? rentDue(plot, now) : null;
    if (!plot || !due || due.coins === 0) {
      await txn.unwatch();
      return;
    }
    await txn.multi();
    await txn.hSet(pk, {
      [userId]: JSON.stringify({ ...plot, rentAt: due.rentAt }),
    });
    await txn.hIncrBy(ck, userId, due.coins);
    return (await committed(txn.exec(), 2)) ? undefined : RETRY;
  });
};

/** Coins for helping with today's build. */
export const addCoins = (postId: string, userId: string, n: number) =>
  redis.hIncrBy(coinsKey(postId), userId, n);

type Done =
  | { ok: true; finished: string | null; bonus: number }
  | { ok: false; reason: string };

/**
 * Claim a plot, buy land, or place / take down a piece on your own plot.
 * The caller reloads the state afterwards for the response.
 */
export const plotAction = async (p: {
  postId: string;
  userId: string;
  username: string;
  request: PlotRequest;
  now: number;
  /** Builds the response once the change is saved. */
  state: () => Promise<StateResponse>;
}): Promise<PlotResponse> => {
  const pk = plotsKey(p.postId);
  const ck = coinsKey(p.postId);
  const r = p.request;
  const done = await optimistic<Done>([pk, ck], async (txn) => {
    const mine = parsePlotJson(await redis.hGet(pk, p.userId));
    const coins = await readCoins(p.postId, p.userId);
    const fail = async (reason: string): Promise<Done> => {
      await txn.unwatch();
      return { ok: false, reason };
    };
    let next: Plot;
    let spend = 0;
    let bonus = 0;
    let finished: string | null = null;
    if (r.op === 'claim') {
      if (mine) return fail('You already have a plot.');
      const block = freeBlock(await readPlots(p.postId));
      if (!block)
        return fail('Every plot in this city is taken. Help a neighbor build!');
      next = newPlot(p.username, block, p.now);
    } else {
      if (!mine) return fail('Get a plot first.');
      if (r.op === 'buy') {
        const b = buyTile(mine, coins);
        if (!b.ok) return fail(b.reason);
        next = b.plot;
        spend = b.price;
      } else if (r.op === 'place') {
        const b = placeOnPlot(mine, r.piece, p.now);
        if (!b.ok) return fail(b.reason);
        next = b.plot;
        bonus = b.bonus;
        finished = b.finished;
      } else {
        const b = removeFromPlot(mine, r.slot);
        if (!b.ok) return fail(b.reason);
        next = b.plot;
      }
    }
    await txn.multi();
    await txn.hSet(pk, { [p.userId]: JSON.stringify(next) });
    await txn.hIncrBy(ck, p.userId, bonus - spend);
    return (await committed(txn.exec(), 2))
      ? { ok: true, finished, bonus }
      : RETRY;
  });
  const state = await p.state();
  return done.ok
    ? { ok: true, state, finished: done.finished, bonus: done.bonus }
    : { ok: false, reason: done.reason, state };
};
