import type { Presence, SkylineEntry } from '../../shared/live';
import type {
  ApiError,
  BuildRequest,
  PlotRequest,
  SiteRequest,
  StateResponse,
} from '../../shared/api';
import {
  makeChallenge,
  utcDateKey,
  type Challenge,
} from '../../shared/challenge';
import { dailyBlueprint, dayStart, planAt } from '../../shared/blueprints';
import {
  buyTile,
  freeBlock,
  newPlot,
  placeOnPlot,
  removeFromPlot,
  rentDue,
  type Plot,
} from '../../shared/plots';
import {
  applyDeliver,
  applyPlace,
  applyRemove,
  applyReturn,
  applySiteWork,
  type SiteWork,
  type TowerState,
} from '../../shared/rules';
import type { DropSpec, PalletSpec, PieceSpec } from '../../shared/structure';
import {
  parsePlot,
  parsePlotResponse,
  parseSiteResponse,
  parseStateResponse,
  parseTower,
} from '../../shared/validate';

export type GameView = {
  dateKey: string;
  challenge: Challenge;
  tower: TowerState;
  /** null when logged out. */
  username: string | null;
  /** Every player's plot in this post's city. */
  plots: Plot[];
  coins: number;
  /** Finished daily builds, newest first. */
  skyline: SkylineEntry[];
};

export type SiteResult =
  { ok: true; view: GameView } | { ok: false; reason: string; view: GameView };

export type BuildOp =
  | { op: 'place'; piece: PieceSpec }
  | { op: 'deliver'; drop: DropSpec }
  | { op: 'return'; pallet: PalletSpec }
  | { op: 'remove'; slot: string };

export type PlotResult =
  | { ok: true; view: GameView; finished: string | null; bonus: number }
  | { ok: false; reason: string; view: GameView };

/**
 * This open game's session id: sent with every request so realtime echoes
 * of our own actions can be told apart (even with two windows on one account).
 */
export const SESSION_ID = Math.random()
  .toString(36)
  .slice(2, 12)
  .padEnd(6, '0');

export type GameService = {
  load(): Promise<GameView>;
  /**
   * Demolish city tile (x, z) next to the site, or pour a buildable pad on
   * site tile (x, z). Unlimited.
   */
  siteWork(work: SiteWork, x: number, z: number): Promise<SiteResult>;
  /** Place a piece, or take down one of your own by its slot. Unlimited. */
  build(op: BuildOp): Promise<SiteResult>;
  /** Claim a plot, buy land, build on your own plot, or help on someone else's. */
  plot(op: PlotRequest): Promise<PlotResult>;
  /** Report where this player's worker is, for live presence. Fire and forget. */
  presence(p: Presence): void;
};

// ---------------------------------------------------------------------------
// Server-backed service: the real game. The server owns the day, the user and
// the site; the client only sends what it wants to do.
// ---------------------------------------------------------------------------

const toView = (s: StateResponse): GameView => ({
  dateKey: s.dateKey,
  challenge: makeChallenge(s.dateKey),
  tower: s.tower,
  username: s.username,
  plots: s.plots,
  coins: s.coins,
  skyline: s.skyline,
});

const isApiError = (v: unknown): v is ApiError =>
  typeof v === 'object' &&
  v !== null &&
  'status' in v &&
  v.status === 'error' &&
  'message' in v;

/** Fetch and validate. Throws with a player-friendly message on any failure. */
const request = async <T>(
  path: string,
  parse: (v: unknown) => T | null,
  init?: RequestInit
): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { ...init?.headers, 'x-skyshift-sid': SESSION_ID },
    });
  } catch {
    throw new Error(
      "Can't reach the site. Check your connection and try again."
    );
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      isApiError(body) && typeof body.message === 'string'
        ? body.message
        : `The site said no (${res.status}).`
    );
  }
  const parsed = parse(body);
  if (!parsed)
    throw new Error('The site sent back something unexpected. Try reloading.');
  return parsed;
};

const post = (path: string, body: unknown) =>
  request(path, parseSiteResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export const createServerService = (): GameService => {
  // The day the player is looking at, so the server can tell them if it rolled over.
  let dateKey = utcDateKey();
  const result = (r: Awaited<ReturnType<typeof post>>): SiteResult => {
    dateKey = r.state.dateKey;
    return r.ok
      ? { ok: true, view: toView(r.state) }
      : { ok: false, reason: r.reason, view: toView(r.state) };
  };
  return {
    async load() {
      const s = await request('/api/state', parseStateResponse);
      dateKey = s.dateKey;
      return toView(s);
    },
    async siteWork(work, x, z) {
      const body: SiteRequest = { dateKey, work, x, z };
      return result(await post('/api/site', body));
    },
    async build(op) {
      const body: BuildRequest = { dateKey, ...op };
      return result(await post('/api/build', body));
    },
    presence(p) {
      fetch('/api/presence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-skyshift-sid': SESSION_ID,
        },
        body: JSON.stringify(p),
      }).catch(() => {
        // Presence is best effort.
      });
    },
    async plot(op) {
      const r = await request('/api/plot', parsePlotResponse, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(op),
      });
      dateKey = r.state.dateKey;
      return r.ok
        ? {
            ok: true,
            view: toView(r.state),
            finished: r.finished,
            bonus: r.bonus,
          }
        : { ok: false, reason: r.reason, view: toView(r.state) };
    },
  };
};

// ---------------------------------------------------------------------------
// Local, single-browser implementation for UI work without the Devvit server.
// Enabled only when built with VITE_LOCAL_DEMO=1 (see README).
// ---------------------------------------------------------------------------

/** Saves from older versions are upgraded by the same parser the server uses. */
const read = (key: string): TowerState | null => {
  try {
    const raw = localStorage.getItem(key);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (typeof v !== 'object' || v === null || !('tower' in v)) return null;
    return parseTower(v.tower);
  } catch {
    return null;
  }
};

const write = (key: string, tower: TowerState) => {
  try {
    localStorage.setItem(key, JSON.stringify({ tower }));
  } catch {
    // Storage blocked (private mode etc.): the round just won't persist.
  }
};

/** The local city (your plot and coins) outlives each day, like on the server. */
type LocalCity = { plot: Plot | null; coins: number };
const CITY_KEY = 'skyshift:local:city';

const readCity = (): LocalCity => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CITY_KEY) ?? 'null');
    if (typeof v !== 'object' || v === null) return { plot: null, coins: 0 };
    const plot = 'plot' in v ? parsePlot(v.plot) : null;
    const coins =
      'coins' in v && typeof v.coins === 'number' && v.coins >= 0
        ? Math.floor(v.coins)
        : 0;
    return { plot, coins };
  } catch {
    return { plot: null, coins: 0 };
  }
};

const writeCity = (c: LocalCity) => {
  try {
    localStorage.setItem(CITY_KEY, JSON.stringify(c));
  } catch {
    // Storage blocked: progress just won't persist.
  }
};

/** Same reward as the server gives for each piece of today's blueprint. */
const DAILY_PIECE_COINS = 3;

export const createLocalService = (username = 'you') => {
  const dateKey = utcDateKey();
  const challenge = makeChallenge(dateKey);
  const key = `skyshift:local:${dateKey}`;
  let tower: TowerState = read(key) ?? dayStart(dateKey);
  let city = readCity();

  const collectRent = () => {
    if (!city.plot) return;
    const due = rentDue(city.plot, Date.now());
    if (due.coins === 0) return;
    city = {
      plot: { ...city.plot, rentAt: due.rentAt },
      coins: city.coins + due.coins,
    };
    writeCity(city);
  };

  const view = (): GameView => ({
    dateKey,
    challenge,
    tower,
    username,
    plots: city.plot ? [city.plot] : [],
    coins: city.coins,
    skyline: [],
  });
  const apply = (r: { state: TowerState } | { error: string }): SiteResult => {
    if ('error' in r) return { ok: false, reason: r.error, view: view() };
    tower = r.state;
    write(key, tower);
    return { ok: true, view: view() };
  };

  const service: GameService & { reset(): GameView } = {
    async load() {
      collectRent();
      return view();
    },
    presence() {
      // Nobody else is here in local play.
    },
    async plot(op) {
      const now = Date.now();
      const fail = (reason: string): PlotResult => ({
        ok: false,
        reason,
        view: view(),
      });
      const save = (
        plot: Plot,
        coins: number,
        finished: string | null,
        bonus: number
      ): PlotResult => {
        city = { plot, coins };
        writeCity(city);
        return { ok: true, view: view(), finished, bonus };
      };
      if (op.op === 'help')
        return fail('There are no neighbors in local play.');
      if (op.op === 'claim') {
        if (city.plot) return fail('You already have a plot.');
        const block = freeBlock([]);
        return block
          ? save(newPlot(username, block, now), city.coins, null, 0)
          : fail('No plots left.');
      }
      const mine = city.plot;
      if (!mine) return fail('Get a plot first.');
      if (op.op === 'buy') {
        const r = buyTile(mine, city.coins);
        return r.ok
          ? save(r.plot, city.coins - r.price, null, 0)
          : fail(r.reason);
      }
      if (op.op === 'place') {
        const r = placeOnPlot(mine, op.piece, now);
        return r.ok
          ? save(r.plot, city.coins + r.bonus, r.finished, r.bonus)
          : fail(r.reason);
      }
      const r = removeFromPlot(mine, op.slot);
      return r.ok ? save(r.plot, city.coins, null, 0) : fail(r.reason);
    },
    async siteWork(work, x, z) {
      return apply(applySiteWork(tower, work, x, z, username, Date.now()));
    },
    async build(op) {
      const at = Date.now();
      if (op.op === 'place') {
        const res = apply(applyPlace(tower, op.piece, username, at));
        const want = planAt(dailyBlueprint(dateKey), op.piece);
        if (
          res.ok &&
          want &&
          want.material === op.piece.material &&
          want.dir === op.piece.dir
        ) {
          city = { ...city, coins: city.coins + DAILY_PIECE_COINS };
          writeCity(city);
          return { ok: true, view: view() };
        }
        return res;
      }
      return apply(
        op.op === 'deliver'
          ? applyDeliver(tower, op.drop, username, at)
          : op.op === 'return'
            ? applyReturn(tower, op.pallet, username, at)
            : applyRemove(tower, op.slot, username, at)
      );
    },
    reset() {
      tower = dayStart(dateKey);
      write(key, tower);
      return view();
    },
  };
  return service;
};

export type LocalService = ReturnType<typeof createLocalService>;
