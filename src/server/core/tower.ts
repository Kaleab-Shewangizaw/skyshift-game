import { redis } from '@devvit/web/server';
import type {
  ShiftResponse,
  SiteResponse,
  StateResponse,
} from '../../shared/api';
import { makeChallenge } from '../../shared/challenge';
import {
  applyAction,
  applySiteWork,
  type Action,
  type ShiftKind,
  type SiteWork,
} from '../../shared/rules';
import { parseContributionJson, parseTowerJson } from '../../shared/validate';

// Redis layout (one round = one post on one UTC day):
//   tower:{postId}:{dateKey}   string  JSON TowerState
//   shifts:{postId}:{dateKey}  hash    userId -> JSON Contribution (one shift per user per day)
// Both expire after ROUND_TTL_S so old days clean themselves up. The window is
// generous so end-of-day results (stage 3) can still read yesterday's tower.

const ROUND_TTL_S = 60 * 60 * 24 * 14;
const MAX_ATTEMPTS = 5;

export const towerKey = (postId: string, dateKey: string) =>
  `tower:${postId}:${dateKey}`;
export const shiftsKey = (postId: string, dateKey: string) =>
  `shifts:${postId}:${dateKey}`;

export class CorruptTowerError extends Error {}
export class TowerBusyError extends Error {}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

type Txn = Awaited<ReturnType<typeof redis.watch>>;

/** Returned by an attempt whose EXEC lost a race; the loop retries. */
const RETRY = Symbol('retry');

/**
 * Optimistic concurrency loop: WATCH `keys`, let `attempt` read, decide and
 * queue writes, retry with backoff while EXEC reports a conflict.
 */
const optimistic = async <T>(
  keys: string[],
  attempt: (txn: Txn) => Promise<T | typeof RETRY>
): Promise<T> => {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const txn = await redis.watch(...keys);
    const result = await attempt(txn);
    if (result !== RETRY) return result;
    // Someone else wrote at the same moment: back off a little and retry.
    await sleep(15 * 2 ** i + Math.random() * 25);
  }
  throw new TowerBusyError(
    `Gave up on ${keys.join(', ')} after ${MAX_ATTEMPTS} attempts`
  );
};

export const loadState = async (
  postId: string,
  dateKey: string,
  userId: string | undefined,
  username: string | null
): Promise<StateResponse> => {
  const [rawTower, rawMine] = await Promise.all([
    redis.get(towerKey(postId, dateKey)),
    userId
      ? redis.hGet(shiftsKey(postId, dateKey), userId)
      : Promise.resolve(undefined),
  ]);
  const tower = parseTowerJson(rawTower);
  if (!tower)
    throw new CorruptTowerError(
      `Unreadable tower at ${towerKey(postId, dateKey)}`
    );
  return { dateKey, tower, myShift: parseContributionJson(rawMine), username };
};

/**
 * Apply one shift with optimistic concurrency.
 *
 * WATCH both keys, read, run the shared rules engine, then MULTI/EXEC the
 * new tower and this user's shift record together. If anyone else wrote in
 * between, EXEC fails and we retry from a fresh read. Because the shift
 * record is written in the same transaction as the tower, a user can never
 * get two shifts in a day, even with parallel requests.
 */
export const takeShift = async (p: {
  postId: string;
  dateKey: string;
  userId: string;
  username: string;
  action: Action;
  ask: ShiftKind | null;
  now: number;
}): Promise<ShiftResponse> => {
  const tk = towerKey(p.postId, p.dateKey);
  const sk = shiftsKey(p.postId, p.dateKey);
  const challenge = makeChallenge(p.dateKey);

  return optimistic<ShiftResponse>([tk, sk], async (txn) => {
    const [rawTower, rawMine] = await Promise.all([
      redis.get(tk),
      redis.hGet(sk, p.userId),
    ]);

    const tower = parseTowerJson(rawTower);
    if (!tower) {
      await txn.unwatch();
      throw new CorruptTowerError(`Unreadable tower at ${tk}`);
    }

    const mine = parseContributionJson(rawMine);
    if (rawMine) {
      await txn.unwatch();
      const state = {
        dateKey: p.dateKey,
        tower,
        myShift: mine,
        username: p.username,
      };
      // An earlier attempt of *this* request committed even though EXEC
      // looked like a conflict to us: report it as the success it was.
      if (mine && mine.at === p.now && mine.kind === p.action.kind) {
        // floorIndex only drives the highlight animation; the top floor is a fine fallback.
        const floorIndex = Math.max(0, tower.floors.length - 1);
        return { ok: true, state, floorIndex };
      }
      return {
        ok: false,
        reason: 'You already took your shift today. Thanks, builder!',
        state,
      };
    }

    const result = applyAction(
      tower,
      p.action,
      challenge,
      p.username,
      p.now,
      p.ask
    );
    if ('error' in result) {
      await txn.unwatch();
      return {
        ok: false,
        reason: result.error,
        state: {
          dateKey: p.dateKey,
          tower,
          myShift: null,
          username: p.username,
        },
      };
    }
    const contribution = result.state.recent[0];
    if (!contribution)
      throw new Error('applyAction did not record a contribution');

    await txn.multi();
    await txn.set(tk, JSON.stringify(result.state));
    await txn.expire(tk, ROUND_TTL_S);
    await txn.hSet(sk, { [p.userId]: JSON.stringify(contribution) });
    await txn.expire(sk, ROUND_TTL_S);

    if (await committed(txn.exec(), 4)) {
      return {
        ok: true,
        floorIndex: result.preview.floorIndex,
        state: {
          dateKey: p.dateKey,
          tower: result.state,
          myShift: contribution,
          username: p.username,
        },
      };
    }
    return RETRY;
  });
};

/**
 * Demolish a city tile next to the site, or pour a pad on a site tile.
 * Unlimited and separate from the daily shift, so only the tower key is involved.
 */
export const doSiteWork = async (p: {
  postId: string;
  dateKey: string;
  userId: string;
  username: string;
  work: SiteWork;
  x: number;
  z: number;
  now: number;
}): Promise<SiteResponse> => {
  const tk = towerKey(p.postId, p.dateKey);
  const sk = shiftsKey(p.postId, p.dateKey);
  return optimistic<SiteResponse>([tk], async (txn) => {
    const [rawTower, rawMine] = await Promise.all([
      redis.get(tk),
      redis.hGet(sk, p.userId),
    ]);
    const tower = parseTowerJson(rawTower);
    if (!tower) {
      await txn.unwatch();
      throw new CorruptTowerError(`Unreadable tower at ${tk}`);
    }
    const myShift = parseContributionJson(rawMine);
    const state = { dateKey: p.dateKey, tower, myShift, username: p.username };
    // An earlier attempt of this request committed even though EXEC looked like a conflict.
    if (
      tower.recent.some(
        (c) => c.kind === p.work && c.user === p.username && c.at === p.now
      )
    ) {
      await txn.unwatch();
      return { ok: true, state };
    }
    const result = applySiteWork(tower, p.work, p.x, p.z, p.username, p.now);
    if ('error' in result) {
      await txn.unwatch();
      // Two players working the same tile at once: the second just sees it done.
      return { ok: false, reason: result.error, state };
    }
    await txn.multi();
    await txn.set(tk, JSON.stringify(result.state));
    await txn.expire(tk, ROUND_TTL_S);
    if (await committed(txn.exec(), 2)) {
      return {
        ok: true,
        state: {
          dateKey: p.dateKey,
          tower: result.state,
          myShift,
          username: p.username,
        },
      };
    }
    return RETRY;
  });
};

/**
 * Redis reports a WATCH conflict as a null EXEC reply. Depending on the client
 * that surfaces as a throw, null, or an empty array, so anything other than
 * one reply per queued command counts as "not committed".
 */
const committed = async (
  exec: Promise<unknown[] | null>,
  queued: number
): Promise<boolean> => {
  try {
    const replies = await exec;
    return Array.isArray(replies) && replies.length === queued;
  } catch (error) {
    console.warn('EXEC failed, treating as conflict:', error);
    return false;
  }
};
