import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type { ApiError, SiteResponse, StateResponse } from '../../shared/api';
import { utcDateKey } from '../../shared/challenge';
import { parseBuildRequest, parseSiteRequest } from '../../shared/validate';
import {
  CorruptTowerError,
  TowerBusyError,
  doBuild,
  doSiteWork,
  loadState,
} from '../core/tower';

export const api = new Hono();

const fail = (message: string): ApiError => ({ status: 'error', message });

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
  return c.json<StateResponse>(
    await loadState(postId, dateKey, userId, username)
  );
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
    await doSiteWork({
      postId,
      dateKey,
      userId,
      username,
      work: req.work,
      x: req.x,
      z: req.z,
      now: Date.now(),
    })
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
    await doBuild({
      postId,
      dateKey,
      userId,
      username,
      request: req,
      now: Date.now(),
    })
  );
});
