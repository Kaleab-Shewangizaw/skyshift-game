import type { Block } from './plots.ts';
import type { PieceSpec } from './structure.ts';
import { parsePieceSpec } from './validate.ts';

// Realtime messages on a post's channel (server -> every open game).
//
// Every open game has a session id (`sid`), sent with each request, so a game
// can ignore its own echoes even when two windows share one Reddit account.
// Worker positions are relayed several times a second; placed and removed
// pieces travel as the piece itself, so games apply them instantly with the
// shared rules instead of reloading.

export type LiveMessage =
  | { t: 'changed'; sid: string; by: string }
  | {
      t: 'pos';
      sid: string;
      user: string;
      x: number;
      y: number;
      z: number;
      /** Facing (radians). */
      h: number;
      /** Velocity (m/s), so others can glide the worker between updates. */
      vx: number;
      vz: number;
      /** Up in the crane cab. */
      crane: boolean;
    }
  | {
      t: 'piece';
      sid: string;
      by: string;
      /** Whose plot, or null for today's build. */
      block: Block | null;
      /** The piece placed, or null when one was taken down. */
      place: PieceSpec | null;
      /** The slot of the piece taken down. */
      remove: string | null;
    };

/** Body of POST /api/presence. */
export type Presence = {
  x: number;
  y: number;
  z: number;
  h: number;
  vx: number;
  vz: number;
  crane: boolean;
};

/** A finished daily build, kept as a monument in the city. */
export type SkylineEntry = { dateKey: string; name: string; by: string };

/** Session ids are short random tokens. */
export const isSid = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-z0-9]{4,24}$/.test(v);

const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e4;

const isObject = (v: unknown): v is object =>
  typeof v === 'object' && v !== null;

export const parsePresence = (v: unknown): Presence | null => {
  if (!isObject(v) || !('x' in v) || !('y' in v) || !('z' in v) || !('h' in v))
    return null;
  const { x, y, z, h } = v;
  if (!finite(x) || !finite(y) || !finite(z) || !finite(h)) return null;
  const vx = 'vx' in v && finite(v.vx) ? v.vx : 0;
  const vz = 'vz' in v && finite(v.vz) ? v.vz : 0;
  const crane = 'crane' in v && v.crane === true;
  return { x, y, z, h, vx, vz, crane };
};

const parseBlock = (v: unknown): Block | null =>
  isObject(v) &&
  'bx' in v &&
  'bz' in v &&
  typeof v.bx === 'number' &&
  typeof v.bz === 'number'
    ? { bx: v.bx, bz: v.bz }
    : null;

export const parseLiveMessage = (v: unknown): LiveMessage | null => {
  if (!isObject(v) || !('t' in v) || !('sid' in v) || !isSid(v.sid))
    return null;
  const sid = v.sid;
  if (v.t === 'changed' && 'by' in v && typeof v.by === 'string')
    return { t: 'changed', sid, by: v.by };
  if (v.t === 'pos' && 'user' in v && typeof v.user === 'string') {
    const p = parsePresence(v);
    return p ? { t: 'pos', sid, user: v.user, ...p } : null;
  }
  if (v.t === 'piece' && 'by' in v && typeof v.by === 'string') {
    const block = 'block' in v && v.block !== null ? parseBlock(v.block) : null;
    const place =
      'place' in v && v.place !== null ? parsePieceSpec(v.place) : null;
    const remove =
      'remove' in v && typeof v.remove === 'string' ? v.remove : null;
    if (!place && !remove) return null;
    return { t: 'piece', sid, by: v.by, block, place, remove };
  }
  return null;
};
