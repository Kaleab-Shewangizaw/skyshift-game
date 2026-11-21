import { realtime } from '@devvit/web/server';
import type { LiveMessage } from '../../shared/live';

/**
 * Tell every open game on this post. Realtime is a nice-to-have: if it fails,
 * games still catch up on their next refresh, so errors are only logged.
 */
export const announce = async (
  postId: string,
  msg: LiveMessage
): Promise<void> => {
  try {
    await realtime.send(postId, msg);
  } catch (error) {
    console.warn('realtime.send failed:', error);
  }
};
