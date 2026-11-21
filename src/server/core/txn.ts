import { redis } from '@devvit/web/server';

// Optimistic transactions shared by every server module that writes Redis.

const MAX_ATTEMPTS = 5;

export class TowerBusyError extends Error {}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export type Txn = Awaited<ReturnType<typeof redis.watch>>;

/** Returned by an attempt whose EXEC lost a race; the loop retries. */
export const RETRY = Symbol('retry');

/**
 * Optimistic concurrency loop: WATCH `keys`, let `attempt` read, decide and
 * queue writes, retry with backoff while EXEC reports a conflict.
 */
export const optimistic = async <T>(
  keys: string[],
  attempt: (txn: Txn) => Promise<T | typeof RETRY>
): Promise<T> => {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const txn = await redis.watch(...keys);
    const result = await attempt(txn);
    if (result !== RETRY) return result;
    // Someone else wrote at the same moment: back off a little and retry.
    await sleep(15 * 2 ** i + Math.random() * 25);
  }
  throw new TowerBusyError(
    `Gave up on ${keys.join(', ')} after ${MAX_ATTEMPTS} attempts`
  );
};

/**
 * Redis reports a WATCH conflict as a null EXEC reply. Depending on the client
 * that surfaces as a throw, null, or an empty array, so anything other than
 * one reply per queued command counts as "not committed".
 */
export const committed = async (
  exec: Promise<unknown[] | null>,
  queued: number
): Promise<boolean> => {
  try {
    const replies = await exec;
    return Array.isArray(replies) && replies.length === queued;
  } catch (error) {
    console.warn('EXEC failed, treating as conflict:', error);
    return false;
  }
};
