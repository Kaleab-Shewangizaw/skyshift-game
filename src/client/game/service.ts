import type {
  ApiError,
  BuildRequest,
  SiteRequest,
  StateResponse,
} from '../../shared/api';
import {
  makeChallenge,
  utcDateKey,
  type Challenge,
} from '../../shared/challenge';
import {
  applyDeliver,
  applyPlace,
  applyRemove,
  applySiteWork,
  emptyTower,
  type SiteWork,
  type TowerState,
} from '../../shared/rules';
import type { PalletSpec, PieceSpec } from '../../shared/structure';
import {
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
};

export type SiteResult =
  { ok: true; view: GameView } | { ok: false; reason: string; view: GameView };

export type BuildOp =
  | { op: 'place'; piece: PieceSpec }
  | { op: 'deliver'; pallet: PalletSpec }
  | { op: 'remove'; slot: string };

export type GameService = {
  load(): Promise<GameView>;
  /**
   * Demolish city tile (x, z) next to the site, or pour a buildable pad on
   * site tile (x, z). Unlimited.
   */
  siteWork(work: SiteWork, x: number, z: number): Promise<SiteResult>;
  /** Place a piece, or take down one of your own by its slot. Unlimited. */
  build(op: BuildOp): Promise<SiteResult>;
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
    res = await fetch(path, init);
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

export const createLocalService = (username = 'you') => {
  const dateKey = utcDateKey();
  const challenge = makeChallenge(dateKey);
  const key = `skyshift:local:${dateKey}`;
  let tower: TowerState = read(key) ?? emptyTower();

  const view = (): GameView => ({ dateKey, challenge, tower, username });
  const apply = (r: { state: TowerState } | { error: string }): SiteResult => {
    if ('error' in r) return { ok: false, reason: r.error, view: view() };
    tower = r.state;
    write(key, tower);
    return { ok: true, view: view() };
  };

  const service: GameService & { reset(): GameView } = {
    async load() {
      return view();
    },
    async siteWork(work, x, z) {
      return apply(applySiteWork(tower, work, x, z, username, Date.now()));
    },
    async build(op) {
      const at = Date.now();
      return apply(
        op.op === 'place'
          ? applyPlace(tower, op.piece, username, at)
          : op.op === 'deliver'
            ? applyDeliver(tower, op.pallet, username, at)
            : applyRemove(tower, op.slot, username, at)
      );
    },
    reset() {
      tower = emptyTower();
      write(key, tower);
      return view();
    },
  };
  return service;
};

export type LocalService = ReturnType<typeof createLocalService>;
