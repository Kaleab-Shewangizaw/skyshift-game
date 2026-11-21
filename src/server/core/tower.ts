import { redis } from '@devvit/web/server';
import { RETRY, committed, optimistic } from './txn';
import type {
  BuildRequest,
  SiteResponse,
  StateResponse,
} from '../../shared/api';
import {
  applyDeliver,
  applyPlace,
  applyRemove,
  applyReturn,
  applySiteWork,
  type ContributionKind,
  type SiteWork,
  type TowerState,
} from '../../shared/rules';
import { dailyBlueprint, dayStart, planAt } from '../../shared/blueprints';
import type { PieceSpec } from '../../shared/structure';
import { addCoins, readCity } from './plots';
import { parseContributionJson, parseTowerJson } from '../../shared/validate';

// Redis layout (one round = one post on one UTC day):
//   tower:{postId}:{dateKey}   string  JSON TowerState
//   shifts:{postId}:{dateKey}  hash    userId -> JSON Contribution (one shift per user per day)
// Both expire after ROUND_TTL_S so old days clean themselves up. The window is
// generous so end-of-day results (stage 3) can still read yesterday's tower.

const ROUND_TTL_S = 60 * 60 * 24 * 14;

export const towerKey = (postId: string, dateKey: string) =>
  `tower:${postId}:${dateKey}`;
export const shiftsKey = (postId: string, dateKey: string) =>
  `shifts:${postId}:${dateKey}`;

export class CorruptTowerError extends Error {}

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
  // Nobody has worked today yet: start from today's blueprint site.
  const tower = rawTower ? parseTowerJson(rawTower) : dayStart(dateKey);
  if (!tower)
    throw new CorruptTowerError(
      `Unreadable tower at ${towerKey(postId, dateKey)}`
    );
  const city = await readCity(postId, userId);
  return {
    dateKey,
    tower,
    myShift: parseContributionJson(rawMine),
    username,
    ...city,
  };
};

/** Today's part of the state; the city is added once the edit is saved. */
type DayState = Omit<StateResponse, 'plots' | 'coins'>;
type DayResult =
  | { ok: true; state: DayState }
  | { ok: false; reason: string; state: DayState };

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
  const r = await optimistic<DayResult>([tk], async (txn) => {
    const [rawTower, rawMine] = await Promise.all([
      redis.get(tk),
      redis.hGet(sk, p.userId),
    ]);
    const tower = rawTower ? parseTowerJson(rawTower) : dayStart(p.dateKey);
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
  const city = await readCity(p.postId, p.userId);
  return { ...r, state: { ...r.state, ...city } };
};

/** Demolish a city tile next to the site, or pour a pad on a site tile. */
export const doSiteWork = (
  p: Editor & { work: SiteWork; x: number; z: number }
): Promise<SiteResponse> =>
  editTower(p, p.work, (t) =>
    applySiteWork(t, p.work, p.x, p.z, p.username, p.now)
  );

/** Coins for each piece of today's blueprint a player puts in. */
const DAILY_PIECE_COINS = 3;

const placeDaily = async (
  p: Editor,
  piece: PieceSpec
): Promise<SiteResponse> => {
  const res = await editTower(p, 'place', (t) =>
    applyPlace(t, piece, p.username, p.now)
  );
  const want = planAt(dailyBlueprint(p.dateKey), piece);
  if (
    res.ok &&
    want &&
    want.material === piece.material &&
    want.dir === piece.dir
  ) {
    await addCoins(p.postId, p.userId, DAILY_PIECE_COINS);
    return {
      ...res,
      state: { ...res.state, coins: res.state.coins + DAILY_PIECE_COINS },
    };
  }
  return res;
};

/** Place a piece, take down one of your own, or set down a crane delivery. */
export const doBuild = (
  p: Editor & { request: BuildRequest }
): Promise<SiteResponse> => {
  const r = p.request;
  if (r.op === 'place') return placeDaily(p, r.piece);
  if (r.op === 'return')
    return editTower(p, 'return', (t) =>
      applyReturn(t, r.pallet, p.username, p.now)
    );
  if (r.op === 'deliver')
    return editTower(p, 'deliver', (t) =>
      applyDeliver(t, r.drop, p.username, p.now)
    );
  return editTower(p, 'remove', (t) =>
    applyRemove(t, r.slot, p.username, p.now)
  );
};
