import type { Challenge } from './challenge.ts';
import { canDemolish, canPrepare, describeTile, tileKey } from './city.ts';
import {
  canPlace,
  canRemove,
  canDeliver,
  describePiece,
  needsPallet,
  PALLET_SIZE,
  type Pallet,
  type PalletSpec,
  type Piece,
  type PieceSpec,
} from './structure.ts';
import {
  DECORATIONS,
  MATERIALS,
  type DecorId,
  type MaterialId,
} from './content.ts';

// ---------- State ----------

export type Floor = {
  material: MaterialId;
  braces: number;
  decor: DecorId[];
  builtBy: string;
};

export type ShiftKind = 'build' | 'reinforce' | 'decorate';

/** Free, unlimited work on the construction site itself. */
export type SiteWork = 'demolish' | 'prepare';

/** Everything that shows up in the crew feed: daily shifts plus site work. */
/** Freeform building: placing or taking down a piece. */
/** Freeform building: placing or taking down a piece, or a crane delivery. */
export type BuildOp = 'place' | 'remove' | 'deliver';

export type ContributionKind = ShiftKind | SiteWork | BuildOp;

export type Contribution = {
  user: string;
  kind: ContributionKind;
  summary: string;
  at: number;
  /** True when this shift answered the previous builder's request. */
  teamwork: boolean;
};

/** A note the last builder left for whoever comes next. */
export type CrewRequest = { kind: ShiftKind; by: string };

export type TowerState = {
  floors: Floor[];
  /** Most recent first, capped at RECENT_LIMIT. */
  recent: Contribution[];
  shiftCount: number;
  /** The open request from the last builder, if any. */
  request: CrewRequest | null;
  /** Consecutive shifts that answered the open request. */
  chain: number;
  /** Shared crew meter. Milestones unlock tower-wide bonuses. */
  spirit: number;
  /** Tiles demolished to grow the construction site ("x,z" keys, in order). */
  site: string[];
  /** Site tiles leveled into buildable foundation pads ("x,z" keys, in order). */
  pads: string[];
  /** Freeform pieces on the build grid, in the order they were placed. */
  pieces: Piece[];
  /** Steel the crane has set down on upper floors, waiting to be built in. */
  pallets: Pallet[];
};

export type Action =
  | { kind: 'build'; material: MaterialId }
  | { kind: 'reinforce' }
  | { kind: 'decorate'; decor: DecorId };

export const MAX_FLOORS = 40;
export const MAX_BRACES = 3;
export const MAX_DECOR_PER_FLOOR = 2;
export const RECENT_LIMIT = 12;
export const THEME_DECOR_BONUS = 3;
export const VARIETY_BONUS = 2;

export const emptyTower = (): TowerState => ({
  floors: [],
  recent: [],
  shiftCount: 0,
  request: null,
  chain: 0,
  spirit: 0,
  site: [],
  pads: [],
  pieces: [],
  pallets: [],
});

// ---------- Crew (cooperation) ----------

export type MilestoneId = 'picnic' | 'scaffold' | 'spire';

export type Milestone = {
  id: MilestoneId;
  at: number;
  name: string;
  icon: string;
  perk: string;
};

/** Crew Spirit thresholds. Bonuses are permanent for the rest of the day. */
export const MILESTONES: Milestone[] = [
  { id: 'picnic', at: 5, name: 'Crew picnic', icon: '🧺', perk: '+4 style' },
  {
    id: 'scaffold',
    at: 12,
    name: 'Safety scaffolding',
    icon: '🛟',
    perk: '+1 sturdiness on every floor',
  },
  {
    id: 'spire',
    at: 22,
    name: 'Golden spire',
    icon: '🗼',
    perk: '+6 m height, +4 style',
  },
];

export const CHAIN_BONUS_AT = 3;

export const unlocked = (spirit: number, id: MilestoneId): boolean =>
  spirit >= (MILESTONES.find((m) => m.id === id)?.at ?? Infinity);

export const nextMilestone = (spirit: number): Milestone | null =>
  MILESTONES.find((m) => spirit < m.at) ?? null;

/** Does this shift answer the open request? */
export const answersRequest = (
  s: TowerState,
  kind: ShiftKind,
  user: string
): boolean =>
  s.request !== null && s.request.kind === kind && s.request.by !== user;

/** Spirit for one shift: +1 for showing up, +1 for teamwork, +1 while the chain is 3+. */
export const spiritFor = (teamwork: boolean, chainAfter: number): number =>
  1 + (teamwork ? 1 : 0) + (teamwork && chainAfter >= CHAIN_BONUS_AT ? 1 : 0);

// ---------- Derived numbers (pure, recomputed, never stored) ----------

/** Extra sturdiness every floor gets from crew milestones. */
export const crewSturdiness = (s: Pick<TowerState, 'spirit'>): number =>
  unlocked(s.spirit, 'scaffold') ? 1 : 0;

export const floorSturdiness = (
  floor: Floor,
  c: Challenge,
  crewBonus = 0
): number =>
  Math.max(
    0,
    MATERIALS[floor.material].sturdiness +
      (c.condition.materialMods[floor.material] ?? 0) +
      floor.braces +
      crewBonus
  );

/**
 * How sturdy floor `index` must be. Lower floors carry everything above them
 * (+1 need per 3 floors above). Wind adds need to the upper half.
 */
export const floorNeed = (
  index: number,
  total: number,
  c: Challenge
): number => {
  const above = total - 1 - index;
  const upper =
    total >= 4 && index >= Math.floor(total / 2) ? c.condition.upperNeed : 0;
  return 1 + Math.floor(above / 3) + upper;
};

export const SPIRE_HEIGHT = 6;

export const towerHeight = (s: TowerState): number =>
  s.floors.reduce((sum, f) => sum + MATERIALS[f.material].height, 0) +
  (s.floors.length > 0 && unlocked(s.spirit, 'spire') ? SPIRE_HEIGHT : 0);

export const towerStability = (s: TowerState, c: Challenge): number => {
  const n = s.floors.length;
  if (n === 0) return 100;
  let have = 0;
  let need = 0;
  const bonus = crewSturdiness(s);
  s.floors.forEach((f, i) => {
    const nd = floorNeed(i, n, c);
    have += Math.min(floorSturdiness(f, c, bonus), nd);
    need += nd;
  });
  return Math.round((100 * have) / need);
};

export const decorStyle = (d: DecorId, c: Challenge): number =>
  DECORATIONS[d].style +
  (DECORATIONS[d].tags.includes(c.theme.tag) ? THEME_DECOR_BONUS : 0);

export const towerStyle = (s: TowerState, c: Challenge): number => {
  const distinct = new Set(s.floors.map((f) => f.material)).size;
  let style = Math.max(0, distinct - 1) * VARIETY_BONUS;
  if (unlocked(s.spirit, 'picnic')) style += 4;
  if (s.floors.length > 0 && unlocked(s.spirit, 'spire')) style += 4;
  for (const f of s.floors) {
    style += MATERIALS[f.material].style;
    for (const d of f.decor) style += decorStyle(d, c);
  }
  return style;
};

export type Scores = { height: number; stability: number; style: number };

export const scores = (s: TowerState, c: Challenge): Scores => ({
  height: towerHeight(s),
  stability: towerStability(s, c),
  style: towerStyle(s, c),
});

/** Indices of floors whose sturdiness is below what they need right now. */
export const weakFloors = (s: TowerState, c: Challenge): number[] => {
  const n = s.floors.length;
  const bonus = crewSturdiness(s);
  return s.floors.flatMap((f, i) =>
    floorSturdiness(f, c, bonus) < floorNeed(i, n, c) ? [i] : []
  );
};

/** Which floor a Reinforce shift would brace, or null if none can be. */
export const reinforceTarget = (s: TowerState, c: Challenge): number | null => {
  const n = s.floors.length;
  let best: number | null = null;
  let bestMargin = Infinity;
  const bonus = crewSturdiness(s);
  s.floors.forEach((f, i) => {
    if (f.braces >= MAX_BRACES) return;
    const margin = floorSturdiness(f, c, bonus) - floorNeed(i, n, c);
    if (margin < bestMargin) {
      best = i;
      bestMargin = margin;
    }
  });
  return best;
};

/** Which floor a decoration would be hung on, or null if nowhere fits. */
export const decorTarget = (s: TowerState, d: DecorId): number | null => {
  for (let i = s.floors.length - 1; i >= 0; i--) {
    const f = s.floors[i]!;
    if (f.decor.length < MAX_DECOR_PER_FLOOR && !f.decor.includes(d)) return i;
  }
  return null;
};

/** What the community most needs next, as a short hint. */
export const communityNeed = (s: TowerState, c: Challenge): ShiftKind => {
  const sc = scores(s, c);
  if (s.floors.length === 0) return 'build';
  if (sc.stability < c.targets.stability) return 'reinforce';
  const hGap = 1 - sc.height / c.targets.height;
  const sGap = 1 - sc.style / c.targets.style;
  return sGap > hGap ? 'decorate' : 'build';
};

// ---------- Actions ----------

export type Preview =
  | { ok: false; reason: string }
  | {
      ok: true;
      next: TowerState;
      before: Scores;
      after: Scores;
      floorIndex: number;
      headline: string;
      notes: string[];
      /** Answers the open crew request. */
      teamwork: boolean;
      spiritGain: number;
      /** Milestones this shift would unlock. */
      unlocks: Milestone[];
    };

const floorLabel = (i: number) =>
  i === 0 ? 'the ground floor' : `floor ${i + 1}`;

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export const actionAllowed = (a: Action, c: Challenge): boolean => {
  if (a.kind === 'build') return c.materials.includes(a.material);
  if (a.kind === 'decorate') return c.decorations.includes(a.decor);
  return a.kind === 'reinforce';
};

/**
 * Simulate an action without committing it. Used by the client to explain an
 * action before confirming, and by the server as the single source of truth.
 */
export const previewAction = (
  s: TowerState,
  a: Action,
  c: Challenge,
  user = 'you'
): Preview => {
  if (!actionAllowed(a, c))
    return { ok: false, reason: "That isn't on today's site." };

  const before = scores(s, c);
  const floors = s.floors.map((f) => ({ ...f, decor: [...f.decor] }));
  const notes: string[] = [];
  let floorIndex: number;
  let headline: string;

  if (a.kind === 'build') {
    if (floors.length >= MAX_FLOORS) {
      return {
        ok: false,
        reason:
          "The crane can't reach any higher today. Try reinforcing or decorating.",
      };
    }
    const m = MATERIALS[a.material];
    floors.push({ material: a.material, braces: 0, decor: [], builtBy: user });
    floorIndex = floors.length - 1;
    headline = `Add a ${m.name.toLowerCase()} floor`;
    const mod = c.condition.materialMods[a.material];
    if (mod)
      notes.push(
        `${c.condition.name}: ${m.name.toLowerCase()} is ${mod > 0 ? 'sturdier' : 'weaker'} today (${signed(mod)}).`
      );
  } else if (a.kind === 'reinforce') {
    const t = reinforceTarget({ ...s, floors }, c);
    if (floors.length === 0)
      return {
        ok: false,
        reason: 'Nothing to reinforce yet. Lay the first floor!',
      };
    if (t === null)
      return {
        ok: false,
        reason: 'Every floor is fully braced. Try building or decorating.',
      };
    floors[t]!.braces += 1;
    floorIndex = t;
    headline = `Brace ${floorLabel(t)}`;
  } else {
    if (floors.length === 0)
      return { ok: false, reason: 'Build a floor first, then decorate it.' };
    const t = decorTarget({ ...s, floors }, a.decor);
    if (t === null)
      return {
        ok: false,
        reason: 'No room left for that decoration. Try another.',
      };
    floors[t]!.decor.push(a.decor);
    floorIndex = t;
    headline = `Hang ${DECORATIONS[a.decor].name.toLowerCase()} on ${floorLabel(t)}`;
    if (DECORATIONS[a.decor].tags.includes(c.theme.tag)) {
      notes.push(
        `Matches today's ${c.theme.name} theme (+${THEME_DECOR_BONUS} style).`
      );
    }
  }

  const teamwork = answersRequest(s, a.kind, user);
  const chain = teamwork ? s.chain + 1 : 0;
  const spiritGain = spiritFor(teamwork, chain);
  const spirit = s.spirit + spiritGain;
  const unlocks = MILESTONES.filter((m) => s.spirit < m.at && spirit >= m.at);
  const next: TowerState = { ...s, floors, chain, spirit };
  const after = scores(next, c);

  // Explain stability movement in plain words.
  const weakBefore = new Set(weakFloors(s, c));
  const weakAfter = weakFloors(next, c);
  const newlyWeak = weakAfter.filter(
    (i) => !weakBefore.has(i) && i !== floorIndex
  );
  if (a.kind === 'build') {
    if (weakAfter.includes(floorIndex))
      notes.push(
        'This floor is lighter than it should be. It will want bracing.'
      );
    if (newlyWeak.length > 0) {
      notes.push(
        `The extra weight means ${newlyWeak.map(floorLabel).join(', ')} ${newlyWeak.length === 1 ? 'needs' : 'need'} bracing.`
      );
    }
  }
  if (a.kind === 'reinforce') {
    notes.push(
      after.stability > before.stability
        ? `${capitalize(floorLabel(floorIndex))} was the weakest point.`
        : 'No floor is weak right now, so this is extra safety for floors to come.'
    );
  }

  return {
    ok: true,
    next,
    before,
    after,
    floorIndex,
    headline,
    notes,
    teamwork,
    spiritGain,
    unlocks,
  };
};

export const summarizeAction = (a: Action, floorIndex: number): string => {
  if (a.kind === 'build')
    return `built a ${MATERIALS[a.material].name.toLowerCase()} floor`;
  if (a.kind === 'reinforce') return `braced ${floorLabel(floorIndex)}`;
  return `hung ${DECORATIONS[a.decor].name.toLowerCase()} on ${floorLabel(floorIndex)}`;
};

/**
 * Commit an action. `ask` is the request this builder leaves for the next
 * one (null keeps no open request). Returns an error if the action is invalid.
 */
export const applyAction = (
  s: TowerState,
  a: Action,
  c: Challenge,
  user: string,
  at: number,
  ask: ShiftKind | null = null
):
  | { state: TowerState; preview: Extract<Preview, { ok: true }> }
  | { error: string } => {
  const p = previewAction(s, a, c, user);
  if (!p.ok) return { error: p.reason };
  const contribution: Contribution = {
    user,
    kind: a.kind,
    summary: summarizeAction(a, p.floorIndex),
    at,
    teamwork: p.teamwork,
  };
  const state: TowerState = {
    ...p.next,
    recent: [contribution, ...s.recent].slice(0, RECENT_LIMIT),
    shiftCount: s.shiftCount + 1,
    request: ask ? { kind: ask, by: user } : null,
  };
  return { state, preview: p };
};

// ---------- Site work ----------

/**
 * Demolish a city tile next to the site so the site grows onto it.
 * Free and unlimited: it is not a daily shift and does not touch requests,
 * chains or spirit. It does show up in the crew feed.
 */
export const applyDemolish = (
  s: TowerState,
  x: number,
  z: number,
  user: string,
  at: number
): { state: TowerState; summary: string } | { error: string } => {
  const check = canDemolish(s.site, x, z);
  if (!check.ok) return { error: check.reason };
  const summary = `cleared ${describeTile(check.tile)}`;
  const entry: Contribution = {
    user,
    kind: 'demolish',
    summary,
    at,
    teamwork: false,
  };
  return {
    summary,
    state: {
      ...s,
      site: [...s.site, tileKey(x, z)],
      recent: [entry, ...s.recent].slice(0, RECENT_LIMIT),
    },
  };
};

/**
 * Level a site tile and pour a foundation pad so it can be built on.
 * Free and unlimited, like demolishing.
 */
export const applyPrepare = (
  s: TowerState,
  x: number,
  z: number,
  user: string,
  at: number
): { state: TowerState; summary: string } | { error: string } => {
  const check = canPrepare(s.site, s.pads, x, z);
  if (!check.ok) return { error: check.reason };
  const summary =
    check.ground === 'rubble'
      ? 'hauled off rubble and poured a pad'
      : 'leveled the dirt and poured a pad';
  const entry: Contribution = {
    user,
    kind: 'prepare',
    summary,
    at,
    teamwork: false,
  };
  return {
    summary,
    state: {
      ...s,
      pads: [...s.pads, tileKey(x, z)],
      recent: [entry, ...s.recent].slice(0, RECENT_LIMIT),
    },
  };
};

export const applySiteWork = (
  s: TowerState,
  work: SiteWork,
  x: number,
  z: number,
  user: string,
  at: number
): { state: TowerState; summary: string } | { error: string } =>
  work === 'demolish'
    ? applyDemolish(s, x, z, user, at)
    : applyPrepare(s, x, z, user, at);

// ---------- Freeform building ----------

type Applied = { state: TowerState; summary: string } | { error: string };

const logged = (
  s: TowerState,
  next: Partial<TowerState>,
  entry: Contribution
): TowerState => ({
  ...s,
  ...next,
  recent: [entry, ...s.recent].slice(0, RECENT_LIMIT),
});

/** Place one piece on the build grid. Unlimited, like site work. */
export const applyPlace = (
  s: TowerState,
  spec: PieceSpec,
  user: string,
  at: number
): Applied => {
  const check = canPlace(s.pieces, s.pads, spec, s.pallets);
  if (!check.ok) return { error: check.reason };
  const piece: Piece = { ...spec, by: user, at };
  const summary = `placed ${describePiece(spec)}`;
  return {
    summary,
    state: logged(
      s,
      {
        pieces: [...s.pieces, piece],
        pallets: needsPallet(spec) ? useSteel(s.pallets, spec) : s.pallets,
      },
      { user, kind: 'place', summary, at, teamwork: false }
    ),
  };
};

/** Take one piece of steel off the first pallet on that floor; empty pallets go away. */
const useSteel = (pallets: readonly Pallet[], spec: PieceSpec): Pallet[] => {
  const i = pallets.findIndex(
    (q) => q.kind === spec.kind && q.level === spec.level && q.left > 0
  );
  return pallets
    .map((q, j) => (j === i ? { ...q, left: q.left - 1 } : q))
    .filter((q) => q.left > 0);
};

/** The crane sets a pallet of steel down on a floor slab. */
export const applyDeliver = (
  s: TowerState,
  d: PalletSpec,
  user: string,
  at: number
): Applied => {
  const check = canDeliver(s.pieces, s.pallets, d);
  if (!check.ok) return { error: check.reason };
  const n = PALLET_SIZE[d.kind];
  const same = s.pallets.findIndex(
    (q) =>
      q.kind === d.kind && q.x === d.x && q.z === d.z && q.level === d.level
  );
  const pallets =
    same >= 0
      ? s.pallets.map((q, j) => (j === same ? { ...q, left: q.left + n } : q))
      : [...s.pallets, { ...d, left: n, by: user, at }];
  const summary = `craned ${n} ${d.kind}s up to floor ${d.level + 1}`;
  return {
    summary,
    state: logged(
      s,
      { pallets },
      { user, kind: 'deliver', summary, at, teamwork: false }
    ),
  };
};

/** Take down one of your own pieces, if nothing rests on it. */
export const applyRemove = (
  s: TowerState,
  slot: string,
  user: string,
  at: number
): Applied => {
  const check = canRemove(s.pieces, slot, user, s.pallets);
  if (!check.ok) return { error: check.reason };
  const summary = `took down ${describePiece(check.piece)}`;
  return {
    summary,
    state: logged(
      s,
      { pieces: s.pieces.filter((p) => p !== check.piece) },
      { user, kind: 'remove', summary, at, teamwork: false }
    ),
  };
};

// ---------- End of round ----------

export type Verdict = {
  scores: Scores;
  met: { height: boolean; stability: boolean; style: boolean };
  stars: 0 | 1 | 2 | 3;
  title: string;
};

const TITLES = [
  'A brave little start',
  'Standing proud',
  'A neighborhood landmark',
  'Skyline legend',
];

export const evaluate = (s: TowerState, c: Challenge): Verdict => {
  const sc = scores(s, c);
  const met = {
    height: sc.height >= c.targets.height,
    stability: sc.stability >= c.targets.stability && s.floors.length > 0,
    style: sc.style >= c.targets.style,
  };
  const count = [met.height, met.stability, met.style].filter(Boolean).length;
  const stars: Verdict['stars'] =
    count >= 3 ? 3 : count === 2 ? 2 : count === 1 ? 1 : 0;
  return { scores: sc, met, stars, title: TITLES[stars]! };
};
