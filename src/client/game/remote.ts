import type { Presence } from '../../shared/live';

// Other players' workers, as last reported over realtime, keyed by session.
// Written by the realtime listener, read every frame by the 3D scene: plain
// module state, no React.

export type Remote = Presence & {
  sid: string;
  user: string;
  /** When this report arrived (ms). */
  seen: number;
};

const remotes = new Map<string, Remote>();

/** Workers silent for this long have left. */
const GONE_MS = 8_000;

export const updateRemote = (r: Omit<Remote, 'seen'>) => {
  remotes.set(r.sid, { ...r, seen: Date.now() });
};

/** Workers heard from recently. */
export const activeRemotes = (): Remote[] => {
  const now = Date.now();
  for (const [sid, r] of remotes)
    if (now - r.seen > GONE_MS) remotes.delete(sid);
  return [...remotes.values()];
};

export const remoteBySid = (sid: string): Remote | undefined =>
  remotes.get(sid);

// The local worker's position, written by the player each frame and sent as presence.
type Mine = Omit<Presence, 'vx' | 'vz'>;
let mine: Mine = { x: 0, y: 0, z: 0, h: 0, crane: false };

export const setMyPosition = (p: Mine) => {
  mine = p;
};

export const myPosition = (): Mine => mine;
