import { Hono, type Context } from 'hono';
import { context, reddit, redis } from '@devvit/web/server';
import type {
  ApiError,
  PlotResponse,
  SiteResponse,
  StateResponse,
} from '../../shared/api';
import { utcDateKey } from '../../shared/challenge';
import {
  parseBuildRequest,
  parsePlotRequest,
  parseSiteRequest,
} from '../../shared/validate';
import { isSid, parsePresence, type LiveMessage } from '../../shared/live';
import { announce } from '../core/live';
import { collectRent, plotAction } from '../core/plots';
import { TowerBusyError } from '../core/txn';
import {
  CorruptTowerError,
  doBuild,
  doSiteWork,
  loadState,
} from '../core/tower';

export const api = new Hono();

const fail = (message: string): ApiError => ({ status: 'error', message });

/** The session id of the open game that sent this request (see shared/live.ts). */
const sidOf = (c: Context): string => {
  const sid = c.req.header('x-skyshift-sid');
  return isSid(sid) ? sid : 'unknown';
};

/**
 * After a successful change, tell every open game. `msg` says what changed
 * (a piece, so games apply it at once); by default games just reload.
 */
const announced = async <R extends { ok: boolean }>(
  postId: string,
  c: Context,
  by: string,
  work: Promise<R>,
  msg?: (r: R) => LiveMessage | null
): Promise<R> => {
  const r = await work;
  if (r.ok)
    await announce(postId, msg?.(r) ?? { t: 'changed', sid: sidOf(c), by });
  return r;
};

//   names:{postId}  hash  userId -> username, so presence needs no Reddit API call
const namesKey = (postId: string) => `names:${postId}`;

api.onError((error, c) => {
  console.error(`API error on ${c.req.method} ${c.req.path}:`, error);
  if (error instanceof TowerBusyError) {
    return c.json(
      fail(
        'The site is really busy right now. Give it a second and try again.'
      ),
      503
    );
  }
  if (error instanceof CorruptTowerError) {
    return c.json(
      fail("Today's blueprints got smudged. The crew has been notified."),
      500
    );
  }
  return c.json(
    fail('Something went wrong on the site. Please try again.'),
    500
  );
});

api.get('/state', async (c) => {
  const { postId, userId } = context;
  if (!postId)
    return c.json(fail('This only works inside a Skyshift post.'), 400);

  const dateKey = utcDateKey();
  const username = userId
    ? ((await reddit.getCurrentUsername()) ?? null)
    : null;
  // Rent from the player's buildings accrues while they're away.
  if (userId) await collectRent(postId, userId, Date.now());
  if (userId && username)
    await redis.hSet(namesKey(postId), { [userId]: username });
  return c.json<StateResponse>(
    await loadState(postId, dateKey, userId, username)
  );
});

api.post('/plot', async (c) => {
  const { postId, userId } = context;
  if (!postId)
    return c.json(fail('This only works inside a Skyshift post.'), 400);
  const body: unknown = await c.req.json().catch(() => null);
  const req = parsePlotRequest(body);
  if (!req) return c.json(fail("The city planner couldn't read that."), 400);

  const dateKey = utcDateKey();
  const username = userId
    ? ((await reddit.getCurrentUsername()) ?? null)
    : null;
  if (!userId || !username) {
    const state = await loadState(postId, dateKey, undefined, null);
    return c.json<PlotResponse>({
      ok: false,
      reason: 'Log in to Reddit to get a plot.',
      state,
    });
  }
  return c.json<PlotResponse>(
    await announced(
      postId,
      c,
      username,
      plotAction({
        postId,
        userId,
        username,
        request: req,
        now: Date.now(),
        state: () => loadState(postId, dateKey, userId, username),
      }),
      (r) => {
        if (req.op === 'claim' || req.op === 'buy') return null;
        // Placing on your own plot: find its block in the fresh state.
        const block =
          req.op === 'help'
            ? req.block
            : r.state.plots.find((q) => q.owner === username)?.block;
        if (!block) return null;
        return {
          t: 'piece',
          sid: sidOf(c),
          by: username,
          block,
          place: req.op === 'remove' ? null : req.piece,
          remove: req.op === 'remove' ? req.slot : null,
        };
      }
    )
  );
});

/** Where this player's worker is; relayed live to everyone else on the post. */
/**
 * Where this player's worker is, several times a second while moving. Kept
 * cheap: one Redis read for the name, then a broadcast.
 */
api.post('/presence', async (c) => {
  const { postId, userId } = context;
  if (!postId || !userId) return c.json({ ok: false });
  const body: unknown = await c.req.json().catch(() => null);
  const pos = parsePresence(body);
  if (!pos) return c.json({ ok: false });
  const user = (await redis.hGet(namesKey(postId), userId)) ?? 'builder';
  await announce(postId, { t: 'pos', sid: sidOf(c), user, ...pos });
  return c.json({ ok: true });
});

api.post('/site', async (c) => {
  const { postId, userId } = context;
  if (!postId)
    return c.json(fail('This only works inside a Skyshift post.'), 400);

  const body: unknown = await c.req.json().catch(() => null);
  const req = parseSiteRequest(body);
  if (!req) return c.json(fail("The site crew couldn't find that spot."), 400);

  const dateKey = utcDateKey();
  const username = userId
    ? ((await reddit.getCurrentUsername()) ?? null)
    : null;
  if (!userId || !username) {
    const state = await loadState(postId, dateKey, undefined, null);
    return c.json<SiteResponse>({
      ok: false,
      reason: 'Log in to Reddit to work on the site.',
      state,
    });
  }
  if (req.dateKey !== dateKey) {
    const state = await loadState(postId, dateKey, userId, username);
    return c.json<SiteResponse>({
      ok: false,
      reason: "A new day started on the site! Here's today's fresh plot.",
      state,
    });
  }
  return c.json<SiteResponse>(
    await announced(
      postId,
      c,
      username,
      doSiteWork({
        postId,
        dateKey,
        userId,
        username,
        work: req.work,
        x: req.x,
        z: req.z,
        now: Date.now(),
      })
    )
  );
});

api.post('/build', async (c) => {
  const { postId, userId } = context;
  if (!postId)
    return c.json(fail('This only works inside a Skyshift post.'), 400);

  const body: unknown = await c.req.json().catch(() => null);
  const req = parseBuildRequest(body);
  if (!req)
    return c.json(fail("The foreman couldn't read that blueprint."), 400);

  const dateKey = utcDateKey();
  const username = userId
    ? ((await reddit.getCurrentUsername()) ?? null)
    : null;
  if (!userId || !username) {
    const state = await loadState(postId, dateKey, undefined, null);
    return c.json<SiteResponse>({
      ok: false,
      reason: 'Log in to Reddit to work on the site.',
      state,
    });
  }
  if (req.dateKey !== dateKey) {
    const state = await loadState(postId, dateKey, userId, username);
    return c.json<SiteResponse>({
      ok: false,
      reason: "A new day started on the site! Here's today's fresh plot.",
      state,
    });
  }
  return c.json<SiteResponse>(
    await announced(
      postId,
      c,
      username,
      doBuild({
        postId,
        dateKey,
        userId,
        username,
        request: req,
        now: Date.now(),
      }),
      () =>
        req.op === 'place' || req.op === 'remove'
          ? {
              t: 'piece',
              sid: sidOf(c),
              by: username,
              block: null,
              place: req.op === 'place' ? req.piece : null,
              remove: req.op === 'remove' ? req.slot : null,
            }
          : null
    )
  );
});
