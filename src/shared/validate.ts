import type {
  BuildRequest,
  PlotRequest,
  PlotResponse,
  SiteRequest,
  SiteResponse,
  ShiftRequest,
  ShiftResponse,
  StateResponse,
} from './api.ts';
import { isValidDateKey } from './challenge.ts';
import type { SkylineEntry } from './live.ts';
import { LEVELS, PLOT_BLOCKS, type Plot } from './plots.ts';
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
  type BuildOp,
  type ShiftKind,
  type SiteWork,
  type TowerState,
} from './rules.ts';
import {
  ALL_DIRS,
  CRANE_LOAD_IDS,
  PIECE_KINDS,
  WALL_MATERIALS,
  isWellFormed,
  type CraneLoadId,
  type Dir,
  type DropSpec,
  type DropSpot,
  type Pallet,
  type PalletSpec,
  type Piece,
  type PieceKind,
  type PieceSpec,
  type SteelKind,
  type WallMaterial,
} from './structure.ts';

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

const isBuildOp = (v: unknown): v is BuildOp =>
  v === 'place' || v === 'remove' || v === 'deliver' || v === 'return';

const isSiteWork = (v: unknown): v is SiteWork =>
  v === 'demolish' || v === 'prepare';

const isContributionKind = (v: unknown): v is ContributionKind =>
  isShiftKind(v) || isSiteWork(v) || isBuildOp(v);

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

const isPieceKind = (v: unknown): v is PieceKind =>
  typeof v === 'string' && PIECE_KINDS.some((k) => k === v);

const isWallMaterial = (v: unknown): v is WallMaterial =>
  typeof v === 'string' && WALL_MATERIALS.some((m) => m === v);

const isDir = (v: unknown): v is Dir =>
  typeof v === 'string' && ALL_DIRS.some((d) => d === v);

const isSteelKind = (v: unknown): v is SteelKind =>
  v === 'beam' || v === 'column';

const isLoadId = (v: unknown): v is CraneLoadId =>
  typeof v === 'string' && CRANE_LOAD_IDS.some((id) => id === v);

/** A cell on a floor: whole numbers in range. Shape only; rules check the rest. */
const parseSpot = (v: unknown): DropSpot | null => {
  if (!isObject(v) || !('x' in v) || !('z' in v) || !('level' in v))
    return null;
  const { x, z, level } = v;
  if (
    typeof x !== 'number' ||
    typeof z !== 'number' ||
    typeof level !== 'number'
  )
    return null;
  if (![x, z, level].every((n) => Number.isInteger(n) && Math.abs(n) <= 60))
    return null;
  return { x, z, level };
};

/** A crane drop request: which load, and where. */
export const parseDropSpec = (v: unknown): DropSpec | null => {
  const spot = parseSpot(v);
  if (!spot || !isObject(v) || !('load' in v) || !isLoadId(v.load)) return null;
  return { ...spot, load: v.load };
};

/** A stored pallet's position and kind. */
export const parsePalletSpec = (v: unknown): PalletSpec | null => {
  if (
    !isObject(v) ||
    !('kind' in v) ||
    !('x' in v) ||
    !('z' in v) ||
    !('level' in v)
  )
    return null;
  if (!isSteelKind(v.kind)) return null;
  const { x, z, level } = v;
  if (
    typeof x !== 'number' ||
    typeof z !== 'number' ||
    typeof level !== 'number'
  )
    return null;
  if (![x, z, level].every((n) => Number.isInteger(n) && Math.abs(n) <= 60))
    return null;
  return { kind: v.kind, x, z, level };
};

const parsePallet = (v: unknown): Pallet | null => {
  const spec = parsePalletSpec(v);
  if (!spec || !isObject(v) || !('left' in v) || !('by' in v) || !('at' in v))
    return null;
  if (
    !isCount(v.left) ||
    v.left < 1 ||
    typeof v.by !== 'string' ||
    !isCount(v.at)
  )
    return null;
  return { ...spec, left: v.left, by: v.by, at: v.at };
};

/** A placement request: kind, position and the fields that kind needs. Extras dropped. */
export const parsePieceSpec = (v: unknown): PieceSpec | null => {
  if (
    !isObject(v) ||
    !('kind' in v) ||
    !('x' in v) ||
    !('z' in v) ||
    !('level' in v)
  )
    return null;
  if (
    !isPieceKind(v.kind) ||
    typeof v.x !== 'number' ||
    typeof v.z !== 'number' ||
    typeof v.level !== 'number'
  )
    return null;
  const dir = 'dir' in v && isDir(v.dir) ? v.dir : null;
  const material =
    'material' in v && isWallMaterial(v.material) ? v.material : null;
  const spec: PieceSpec = {
    kind: v.kind,
    x: v.x,
    z: v.z,
    level: v.level,
    dir,
    material,
  };
  return isWellFormed(spec) ? spec : null;
};

const parsePiece = (v: unknown): Piece | null => {
  const spec = parsePieceSpec(v);
  if (!spec || !isObject(v) || !('by' in v) || !('at' in v)) return null;
  if (typeof v.by !== 'string' || !isCount(v.at)) return null;
  return { ...spec, by: v.by, at: v.at };
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
  const pieces =
    'pieces' in v && Array.isArray(v.pieces)
      ? v.pieces.map(parsePiece).filter((p): p is Piece => p !== null)
      : [];
  const pallets =
    'pallets' in v && Array.isArray(v.pallets)
      ? v.pallets.map(parsePallet).filter((p): p is Pallet => p !== null)
      : [];
  return {
    floors: okFloors,
    recent: okRecent,
    shiftCount: v.shiftCount,
    request,
    chain,
    spirit,
    site,
    pads,
    pieces,
    pallets,
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
  // Plots and coins arrived with progression; older servers send none.
  const plots =
    'plots' in v && Array.isArray(v.plots)
      ? v.plots.map(parsePlot).filter((p): p is Plot => p !== null)
      : [];
  const coins = 'coins' in v && isCount(v.coins) ? v.coins : 0;
  const skyline =
    'skyline' in v && Array.isArray(v.skyline)
      ? v.skyline.filter(isSkylineEntry)
      : [];
  return {
    dateKey: v.dateKey,
    tower,
    myShift,
    username: v.username,
    plots,
    coins,
    skyline,
  };
};

/** A stored plot. Pieces that don't parse are dropped rather than losing the plot. */
export const parsePlot = (v: unknown): Plot | null => {
  if (
    !isObject(v) ||
    !('owner' in v) ||
    !('block' in v) ||
    !('tiles' in v) ||
    !('level' in v) ||
    !('pieces' in v) ||
    !('rentAt' in v)
  )
    return null;
  const b = v.block;
  if (
    typeof v.owner !== 'string' ||
    !isObject(b) ||
    !('bx' in b) ||
    !('bz' in b) ||
    typeof b.bx !== 'number' ||
    typeof b.bz !== 'number' ||
    !PLOT_BLOCKS.some((q) => q.bx === b.bx && q.bz === b.bz) ||
    !isCount(v.level) ||
    v.level > LEVELS.length ||
    !isCount(v.rentAt) ||
    !Array.isArray(v.pieces)
  )
    return null;
  return {
    owner: v.owner,
    block: { bx: b.bx, bz: b.bz },
    tiles: parseTileKeys(v.tiles),
    level: v.level,
    pieces: v.pieces.map(parsePiece).filter((p): p is Piece => p !== null),
    rentAt: v.rentAt,
  };
};

export const isSkylineEntry = (v: unknown): v is SkylineEntry =>
  isObject(v) &&
  'dateKey' in v &&
  typeof v.dateKey === 'string' &&
  isValidDateKey(v.dateKey) &&
  'name' in v &&
  typeof v.name === 'string' &&
  'by' in v &&
  typeof v.by === 'string';

export const parsePlotJson = (raw: string | undefined | null): Plot | null =>
  parsePlot(parseJson(raw));

export const parsePlotRequest = (v: unknown): PlotRequest | null => {
  if (!isObject(v) || !('op' in v)) return null;
  if (v.op === 'claim') return { op: 'claim' };
  if (v.op === 'buy') return { op: 'buy' };
  if (v.op === 'help' && 'piece' in v && 'block' in v) {
    const piece = parsePieceSpec(v.piece);
    const b = v.block;
    if (
      !piece ||
      !isObject(b) ||
      !('bx' in b) ||
      !('bz' in b) ||
      typeof b.bx !== 'number' ||
      typeof b.bz !== 'number'
    )
      return null;
    const block = PLOT_BLOCKS.find((q) => q.bx === b.bx && q.bz === b.bz);
    return block ? { op: 'help', block, piece } : null;
  }
  if (v.op === 'place' && 'piece' in v) {
    const piece = parsePieceSpec(v.piece);
    return piece ? { op: 'place', piece } : null;
  }
  if (
    v.op === 'remove' &&
    'slot' in v &&
    typeof v.slot === 'string' &&
    v.slot.length <= 64
  )
    return { op: 'remove', slot: v.slot };
  return null;
};

export const parsePlotResponse = (v: unknown): PlotResponse | null => {
  if (!isObject(v) || !('ok' in v) || !('state' in v)) return null;
  const state = parseStateResponse(v.state);
  if (!state) return null;
  if (v.ok === true) {
    const finished =
      'finished' in v && typeof v.finished === 'string' ? v.finished : null;
    const bonus = 'bonus' in v && isCount(v.bonus) ? v.bonus : 0;
    return { ok: true, state, finished, bonus };
  }
  if (v.ok === false && 'reason' in v && typeof v.reason === 'string')
    return { ok: false, reason: v.reason, state };
  return null;
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

export const parseBuildRequest = (v: unknown): BuildRequest | null => {
  if (!isObject(v) || !('dateKey' in v) || !('op' in v)) return null;
  if (typeof v.dateKey !== 'string' || !isValidDateKey(v.dateKey)) return null;
  if (v.op === 'place' && 'piece' in v) {
    const piece = parsePieceSpec(v.piece);
    return piece ? { dateKey: v.dateKey, op: 'place', piece } : null;
  }
  if (v.op === 'return' && 'pallet' in v) {
    const pallet = parsePalletSpec(v.pallet);
    return pallet ? { dateKey: v.dateKey, op: 'return', pallet } : null;
  }
  if (v.op === 'deliver' && 'drop' in v) {
    const drop = parseDropSpec(v.drop);
    return drop ? { dateKey: v.dateKey, op: 'deliver', drop } : null;
  }
  if (
    v.op === 'remove' &&
    'slot' in v &&
    typeof v.slot === 'string' &&
    v.slot.length <= 64
  ) {
    return { dateKey: v.dateKey, op: 'remove', slot: v.slot };
  }
  return null;
};
