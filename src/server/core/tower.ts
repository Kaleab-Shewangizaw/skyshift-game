import { redis } from '@devvit/web/server';
import type {
  BuildRequest,
  SiteResponse,
  StateResponse,
} from '../../shared/api';
import {
  applyPlace,
  applyRemove,
  applySiteWork,
  type ContributionKind,
  type SiteWork,
  type TowerState,
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

type Editor = {
  postId: string;
  dateKey: string;
  userId: string;
  username: string;
  now: number;
};

/**
 * Unlimited edits to the shared site (site work and building). They are
 * separate from the daily shift, so only the tower key is watched. `kind` is
 * the feed entry the edit records, used to spot a retry that already committed.
 */
const editTower = async (
  p: Editor,
  kind: ContributionKind,
  apply: (tower: TowerState) => { state: TowerState } | { error: string }
): Promise<SiteResponse> => {
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
        (c) => c.kind === kind && c.user === p.username && c.at === p.now
      )
    ) {
      await txn.unwatch();
      return { ok: true, state };
    }
    const result = apply(tower);
    if ('error' in result) {
      await txn.unwatch();
      // Two players working the same spot at once: the second just sees it done.
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

/** Demolish a city tile next to the site, or pour a pad on a site tile. */
export const doSiteWork = (
  p: Editor & { work: SiteWork; x: number; z: number }
): Promise<SiteResponse> =>
  editTower(p, p.work, (t) =>
    applySiteWork(t, p.work, p.x, p.z, p.username, p.now)
  );

/** Place a piece on the build grid, or take down one of your own. */
export const doBuild = (
  p: Editor & { request: BuildRequest }
): Promise<SiteResponse> => {
  const r = p.request;
  return r.op === 'place'
    ? editTower(p, 'place', (t) => applyPlace(t, r.piece, p.username, p.now))
    : editTower(p, 'remove', (t) => applyRemove(t, r.slot, p.username, p.now));
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
