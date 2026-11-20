import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type {
  ApiError,
  SiteResponse,
  ShiftResponse,
  StateResponse,
} from '../../shared/api';
import { utcDateKey } from '../../shared/challenge';
import { parseSiteRequest, parseShiftRequest } from '../../shared/validate';
import {
  CorruptTowerError,
  TowerBusyError,
  doSiteWork,
  loadState,
  takeShift,
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

api.post('/shift', async (c) => {
  const { postId, userId } = context;
  if (!postId)
    return c.json(fail('This only works inside a Skyshift post.'), 400);

  const body: unknown = await c.req.json().catch(() => null);
  const req = parseShiftRequest(body);
  if (!req)
    return c.json(fail("That shift didn't make sense to the foreman."), 400);

  // The server's clock decides the day. Never trust the client's.
  const dateKey = utcDateKey();
  const username = userId
    ? ((await reddit.getCurrentUsername()) ?? null)
    : null;

  if (!userId || !username) {
    const state = await loadState(postId, dateKey, undefined, null);
    return c.json<ShiftResponse>({
      ok: false,
      reason: 'Log in to Reddit to take a shift.',
      state,
    });
  }

  if (req.dateKey !== dateKey) {
    const state = await loadState(postId, dateKey, userId, username);
    return c.json<ShiftResponse>({
      ok: false,
      reason: "A new day started on the site! Here's today's fresh plot.",
      state,
    });
  }

  return c.json<ShiftResponse>(
    await takeShift({
      postId,
      dateKey,
      userId,
      username,
      action: req.action,
      ask: req.ask,
      now: Date.now(),
    })
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
