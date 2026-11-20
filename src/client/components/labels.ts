import type { ShiftKind } from '../../shared/rules';

/** How each crew request reads on screen. */
export const ASK_LABEL: Record<
  ShiftKind,
  { verb: string; icon: string; color: string }
> = {
  build: { verb: 'Build higher!', icon: '🏗️', color: '#ff8a3d' },
  reinforce: { verb: 'Brace a floor!', icon: '🔩', color: '#4fa8ff' },
  decorate: { verb: 'Make it pretty!', icon: '🌸', color: '#ff6fae' },
};
