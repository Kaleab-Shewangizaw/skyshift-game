import type {
  SiteRequest,
  SiteResponse,
  ShiftRequest,
  ShiftResponse,
  StateResponse,
} from './api.ts';
import { isValidDateKey } from './challenge.ts';
import { inCity, parseTileKey } from './city.ts';
import {
  DECORATIONS,
  MATERIALS,
  type DecorId,
  type MaterialId,
} from './content.ts';
import {
  emptyTower,
  type Action,
  type Contribution,
  type ContributionKind,
  type CrewRequest,
  type Floor,
  type ShiftKind,
  type SiteWork,
  type TowerState,
} from './rules.ts';

// Runtime guards for anything that crosses a trust boundary: request bodies
// from the client and JSON read back from Redis. No casts: each guard narrows
// `unknown` structurally.

const isObject = (v: unknown): v is object =>
  typeof v === 'object' && v !== null;

const isCount = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0;

export const isMaterialId = (v: unknown): v is MaterialId =>
  typeof v === 'string' && Object.hasOwn(MATERIALS, v);

export const isDecorId = (v: unknown): v is DecorId =>
  typeof v === 'string' && Object.hasOwn(DECORATIONS, v);

const isShiftKind = (v: unknown): v is ShiftKind =>
  v === 'build' || v === 'reinforce' || v === 'decorate';

const isSiteWork = (v: unknown): v is SiteWork =>
  v === 'demolish' || v === 'prepare';

const isContributionKind = (v: unknown): v is ContributionKind =>
  isShiftKind(v) || isSiteWork(v);

/** Returns a fresh Action object (unknown extra fields dropped), or null. */
export const parseAction = (v: unknown): Action | null => {
  if (!isObject(v) || !('kind' in v)) return null;
  if (v.kind === 'reinforce') return { kind: 'reinforce' };
  if (v.kind === 'build' && 'material' in v && isMaterialId(v.material)) {
    return { kind: 'build', material: v.material };
  }
  if (v.kind === 'decorate' && 'decor' in v && isDecorId(v.decor)) {
    return { kind: 'decorate', decor: v.decor };
  }
  return null;
};

export const parseShiftRequest = (v: unknown): ShiftRequest | null => {
  if (!isObject(v) || !('dateKey' in v) || !('action' in v)) return null;
  if (typeof v.dateKey !== 'string' || !isValidDateKey(v.dateKey)) return null;
  const ask = 'ask' in v ? v.ask : null;
  if (ask !== null && !isShiftKind(ask)) return null;
  const action = parseAction(v.action);
  return action ? { dateKey: v.dateKey, action, ask } : null;
};

const parseFloor = (v: unknown): Floor | null => {
  if (
    !isObject(v) ||
    !('material' in v) ||
    !('braces' in v) ||
    !('decor' in v) ||
    !('builtBy' in v)
  )
    return null;
  if (
    !isMaterialId(v.material) ||
    !isCount(v.braces) ||
    typeof v.builtBy !== 'string'
  )
    return null;
  if (!Array.isArray(v.decor) || !v.decor.every(isDecorId)) return null;
  return {
    material: v.material,
    braces: v.braces,
    decor: [...v.decor],
    builtBy: v.builtBy,
  };
};

export const parseContribution = (v: unknown): Contribution | null => {
  if (
    !isObject(v) ||
    !('user' in v) ||
    !('kind' in v) ||
    !('summary' in v) ||
    !('at' in v)
  )
    return null;
  if (
    typeof v.user !== 'string' ||
    !isContributionKind(v.kind) ||
    typeof v.summary !== 'string' ||
    !isCount(v.at)
  ) {
    return null;
  }
  // `teamwork` arrived with crew requests; older records default to false.
  const teamwork = 'teamwork' in v && v.teamwork === true;
  return { user: v.user, kind: v.kind, summary: v.summary, at: v.at, teamwork };
};

const parseCrewRequest = (v: unknown): CrewRequest | null => {
  if (!isObject(v) || !('kind' in v) || !('by' in v)) return null;
  if (!isShiftKind(v.kind) || typeof v.by !== 'string') return null;
  return { kind: v.kind, by: v.by };
};

const parseJson = (raw: string | undefined | null): unknown => {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

export const parseContributionJson = (
  raw: string | undefined | null
): Contribution | null => parseContribution(parseJson(raw));

export const parseTower = (v: unknown): TowerState | null => {
  if (
    !isObject(v) ||
    !('floors' in v) ||
    !('recent' in v) ||
    !('shiftCount' in v)
  )
    return null;
  if (
    !Array.isArray(v.floors) ||
    !Array.isArray(v.recent) ||
    !isCount(v.shiftCount)
  )
    return null;
  const floors = v.floors.map(parseFloor);
  const recent = v.recent.map(parseContribution);
  const okFloors = floors.filter((f): f is Floor => f !== null);
  const okRecent = recent.filter((c): c is Contribution => c !== null);
  if (okFloors.length !== floors.length || okRecent.length !== recent.length)
    return null;
  // Crew fields arrived later; towers saved before that start with an empty crew.
  const request =
    'request' in v && v.request !== null ? parseCrewRequest(v.request) : null;
  const chain = 'chain' in v && isCount(v.chain) ? v.chain : 0;
  const spirit = 'spirit' in v && isCount(v.spirit) ? v.spirit : 0;
  // Site work arrived later too: keep only well-formed, unique tile keys.
  const site = 'site' in v ? parseTileKeys(v.site) : [];
  const pads = 'pads' in v ? parseTileKeys(v.pads) : [];
  return {
    floors: okFloors,
    recent: okRecent,
    shiftCount: v.shiftCount,
    request,
    chain,
    spirit,
    site,
    pads,
  };
};

const parseTileKeys = (v: unknown): string[] =>
  Array.isArray(v)
    ? [
        ...new Set(
          v.filter(
            (k): k is string =>
              typeof k === 'string' && parseTileKey(k) !== null
          )
        ),
      ]
    : [];

/**
 * Parse a stored tower. Missing data means nobody has built yet today.
 * Corrupt data is reported as null so the caller can decide (the server
 * refuses to overwrite it rather than silently wiping a day's work).
 */
export const parseTowerJson = (
  raw: string | undefined | null
): TowerState | null => (raw ? parseTower(parseJson(raw)) : emptyTower());

// ---------- API responses (checked on the client) ----------

export const parseStateResponse = (v: unknown): StateResponse | null => {
  if (
    !isObject(v) ||
    !('dateKey' in v) ||
    !('tower' in v) ||
    !('myShift' in v) ||
    !('username' in v)
  )
    return null;
  if (typeof v.dateKey !== 'string' || !isValidDateKey(v.dateKey)) return null;
  if (v.username !== null && typeof v.username !== 'string') return null;
  const tower = parseTower(v.tower);
  const myShift = v.myShift === null ? null : parseContribution(v.myShift);
  if (!tower || (v.myShift !== null && !myShift)) return null;
  return { dateKey: v.dateKey, tower, myShift, username: v.username };
};

export const parseShiftResponse = (v: unknown): ShiftResponse | null => {
  if (!isObject(v) || !('ok' in v) || !('state' in v)) return null;
  const state = parseStateResponse(v.state);
  if (!state) return null;
  if (v.ok === true && 'floorIndex' in v && isCount(v.floorIndex)) {
    return { ok: true, state, floorIndex: v.floorIndex };
  }
  if (v.ok === false && 'reason' in v && typeof v.reason === 'string') {
    return { ok: false, reason: v.reason, state };
  }
  return null;
};

export const parseSiteRequest = (v: unknown): SiteRequest | null => {
  if (
    !isObject(v) ||
    !('dateKey' in v) ||
    !('work' in v) ||
    !('x' in v) ||
    !('z' in v)
  )
    return null;
  if (typeof v.dateKey !== 'string' || !isValidDateKey(v.dateKey)) return null;
  if (!isSiteWork(v.work)) return null;
  if (typeof v.x !== 'number' || typeof v.z !== 'number' || !inCity(v.x, v.z))
    return null;
  return { dateKey: v.dateKey, work: v.work, x: v.x, z: v.z };
};

export const parseSiteResponse = (v: unknown): SiteResponse | null => {
  if (!isObject(v) || !('ok' in v) || !('state' in v)) return null;
  const state = parseStateResponse(v.state);
  if (!state) return null;
  if (v.ok === true) return { ok: true, state };
  if (v.ok === false && 'reason' in v && typeof v.reason === 'string')
    return { ok: false, reason: v.reason, state };
  return null;
};
