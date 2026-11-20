import type {
  ApiError,
  ShiftRequest,
  SiteRequest,
  StateResponse,
} from '../../shared/api';
import {
  makeChallenge,
  utcDateKey,
  type Challenge,
} from '../../shared/challenge';
import {
  applyAction,
  applySiteWork,
  communityNeed,
  emptyTower,
  type Action,
  type Contribution,
  type ShiftKind,
  type SiteWork,
  type TowerState,
} from '../../shared/rules';
import {
  parseContribution,
  parseShiftResponse,
  parseSiteResponse,
  parseStateResponse,
  parseTower,
} from '../../shared/validate';

export type GameView = {
  dateKey: string;
  challenge: Challenge;
  tower: TowerState;
  /** This player's shift today, if they already took one. */
  myShift: Contribution | null;
  /** null when logged out. */
  username: string | null;
};

export type ShiftResult =
  | { ok: true; view: GameView; floorIndex: number }
  | { ok: false; reason: string; view?: GameView };

export type SiteResult =
  { ok: true; view: GameView } | { ok: false; reason: string; view: GameView };

export type GameService = {
  /**
   * Demolish city tile (x, z) next to the site, or pour a buildable pad on
   * site tile (x, z). Unlimited; not a shift.
   */
  siteWork(work: SiteWork, x: number, z: number): Promise<SiteResult>;
  load(): Promise<GameView>;
  /** `ask` is the request this player leaves for the next builder. */
  takeShift(action: Action, ask: ShiftKind | null): Promise<ShiftResult>;
};

// ---------------------------------------------------------------------------
// Server-backed service: the real game. The server owns the day, the user and
// the tower; the client only sends which action it wants.
// ---------------------------------------------------------------------------

const toView = (s: StateResponse): GameView => ({
  dateKey: s.dateKey,
  challenge: makeChallenge(s.dateKey),
  tower: s.tower,
  myShift: s.myShift,
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

export const createServerService = (): GameService => {
  // The day the player is looking at, so the server can tell them if it rolled over.
  let dateKey = utcDateKey();
  return {
    async load() {
      const s = await request('/api/state', parseStateResponse);
      dateKey = s.dateKey;
      return toView(s);
    },
    async siteWork(work, x, z) {
      const body: SiteRequest = { dateKey, work, x, z };
      const r = await request('/api/site', parseSiteResponse, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      dateKey = r.state.dateKey;
      return r.ok
        ? { ok: true, view: toView(r.state) }
        : { ok: false, reason: r.reason, view: toView(r.state) };
    },
    async takeShift(action, ask) {
      const body: ShiftRequest = { dateKey, action, ask };
      const r = await request('/api/shift', parseShiftResponse, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      dateKey = r.state.dateKey;
      return r.ok
        ? { ok: true, view: toView(r.state), floorIndex: r.floorIndex }
        : { ok: false, reason: r.reason, view: toView(r.state) };
    },
  };
};

// ---------------------------------------------------------------------------
// Local, single-browser implementation for UI work without the Devvit server.
// Enabled only when built with VITE_LOCAL_DEMO=1 (see README).
// ---------------------------------------------------------------------------

type LocalSave = { tower: TowerState; myShift: Contribution | null };

const NEIGHBORS = [
  'maple_mason',
  'quietcrane',
  'brickbybrick',
  'sunnyrivet',
  'loftlark',
];

/** Saves from older versions are upgraded by the same parsers the server uses. */
const read = (key: string): LocalSave | null => {
  try {
    const raw = localStorage.getItem(key);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (
      typeof v !== 'object' ||
      v === null ||
      !('tower' in v) ||
      !('myShift' in v)
    )
      return null;
    const tower = parseTower(v.tower);
    if (!tower) return null;
    return {
      tower,
      myShift: v.myShift === null ? null : parseContribution(v.myShift),
    };
  } catch {
    return null;
  }
};

const write = (key: string, save: LocalSave) => {
  try {
    localStorage.setItem(key, JSON.stringify(save));
  } catch {
    // Storage blocked (private mode etc.): the round just won't persist.
  }
};

export const createLocalService = (username = 'you') => {
  const dateKey = utcDateKey();
  const challenge = makeChallenge(dateKey);
  const key = `skyshift:local:${dateKey}`;
  let save: LocalSave = read(key) ?? { tower: emptyTower(), myShift: null };

  const view = (): GameView => ({
    dateKey,
    challenge,
    tower: save.tower,
    myShift: save.myShift,
    username,
  });

  const service: GameService & {
    simulateNeighbor(): GameView;
    reset(): GameView;
  } = {
    async load() {
      return view();
    },
    async siteWork(work, x, z) {
      const r = applySiteWork(save.tower, work, x, z, username, Date.now());
      if ('error' in r) return { ok: false, reason: r.error, view: view() };
      save = { ...save, tower: r.state };
      write(key, save);
      return { ok: true, view: view() };
    },
    async takeShift(action, ask) {
      if (save.myShift)
        return {
          ok: false,
          reason: 'You already took your shift today.',
          view: view(),
        };
      const r = applyAction(
        save.tower,
        action,
        challenge,
        username,
        Date.now(),
        ask
      );
      if ('error' in r) return { ok: false, reason: r.error, view: view() };
      save = { tower: r.state, myShift: r.state.recent[0]! };
      write(key, save);
      return { ok: true, view: view(), floorIndex: r.preview.floorIndex };
    },
    /**
     * Dev helper: pretend another player took a shift. Neighbors usually
     * answer the open request (so you can see chains build) and then ask for
     * whatever the tower needs most.
     */
    simulateNeighbor() {
      const t = save.tower;
      const n = t.shiftCount;
      const user = NEIGHBORS[n % NEIGHBORS.length]!;
      const byKind: Record<ShiftKind, Action> = {
        build: {
          kind: 'build',
          material: challenge.materials[n % challenge.materials.length]!,
        },
        reinforce: { kind: 'reinforce' },
        decorate: {
          kind: 'decorate',
          decor: challenge.decorations[n % challenge.decorations.length]!,
        },
      };
      const wanted =
        t.request && n % 4 !== 3 ? t.request.kind : communityNeed(t, challenge);
      const order: ShiftKind[] = [wanted, 'build', 'reinforce', 'decorate'];
      for (const kind of order) {
        const r = applyAction(t, byKind[kind], challenge, user, Date.now());
        if ('error' in r) continue;
        const ask = communityNeed(r.state, challenge);
        const withAsk = applyAction(
          t,
          byKind[kind],
          challenge,
          user,
          Date.now(),
          ask
        );
        if (!('error' in withAsk)) {
          save = { ...save, tower: withAsk.state };
          write(key, save);
        }
        break;
      }
      return view();
    },
    reset() {
      save = { tower: emptyTower(), myShift: null };
      write(key, save);
      return view();
    },
  };
  return service;
};

export type LocalService = ReturnType<typeof createLocalService>;
