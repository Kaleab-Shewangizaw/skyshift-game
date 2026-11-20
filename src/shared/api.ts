import type { PieceSpec, PlaceMethod } from './structure.ts';
import type {
  Action,
  Contribution,
  ShiftKind,
  SiteWork,
  TowerState,
} from './rules.ts';

/** GET /api/state */
export type StateResponse = {
  /** The server's current UTC day. The client derives the challenge from it. */
  dateKey: string;
  tower: TowerState;
  /** This player's shift today, if they already took one. */
  myShift: Contribution | null;
  /** null when the viewer is logged out. */
  username: string | null;
};

/** POST /api/shift body. `dateKey` is the day the client was looking at. */
export type ShiftRequest = {
  dateKey: string;
  action: Action;
  /** What this builder asks the next one to do. */
  ask: ShiftKind | null;
};

/**
 * Game-level outcomes come back with HTTP 200. `ok: false` is a friendly
 * rejection (already shifted, new day started, nothing to brace...), and
 * always carries fresh state so the client can resync.
 */
export type ShiftResponse =
  | { ok: true; state: StateResponse; floorIndex: number }
  | { ok: false; reason: string; state: StateResponse };

/**
 * POST /api/site body. `demolish` clears city tile (x, z) to grow the site;
 * `prepare` levels site tile (x, z) into a buildable pad.
 */
export type SiteRequest = {
  dateKey: string;
  work: SiteWork;
  x: number;
  z: number;
};

/** Site work is unlimited and separate from the daily shift. */
export type SiteResponse =
  | { ok: true; state: StateResponse }
  | { ok: false; reason: string; state: StateResponse };

/** POST /api/build body: place a piece, or take down your own piece by its slot. */
export type BuildRequest =
  | { dateKey: string; op: 'place'; piece: PieceSpec; method: PlaceMethod }
  | { dateKey: string; op: 'remove'; slot: string };

/** Same shape as site work: unlimited, with fresh state either way. */
export type BuildResponse = SiteResponse;

/** Non-2xx responses: malformed request, missing context, server busy. */
export type ApiError = {
  status: 'error';
  message: string;
};
