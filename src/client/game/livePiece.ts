import { applyPlace, applyRemove } from '../../shared/rules';
import { placeOnPlot, removeFromPlot, type Block } from '../../shared/plots';
import type { PieceSpec } from '../../shared/structure';
import type { GameView } from './service';

/** One piece going in or coming out, on today's build (block null) or a plot. */
export type PieceChange = {
  by: string;
  block: Block | null;
  place: PieceSpec | null;
  remove: string | null;
};

/**
 * Apply a piece change to the view with the shared rules, exactly as the
 * server did. Used for other players' changes arriving over realtime, and
 * for our own taps before the server answers. Returns null if the rules say
 * no here (our view is out of date): the caller then reloads.
 */
export const applyPieceChange = (
  v: GameView,
  ch: PieceChange,
  at = Date.now()
): GameView | null => {
  if (!ch.block) {
    const r = ch.place
      ? applyPlace(v.tower, ch.place, ch.by, at)
      : ch.remove
        ? applyRemove(v.tower, ch.remove, ch.by, at)
        : null;
    return r && !('error' in r) ? { ...v, tower: r.state } : null;
  }
  const { bx, bz } = ch.block;
  const i = v.plots.findIndex((p) => p.block.bx === bx && p.block.bz === bz);
  const plot = v.plots[i];
  if (!plot) return null;
  const r = ch.place
    ? placeOnPlot(plot, ch.place, at, ch.by)
    : ch.remove
      ? removeFromPlot(plot, ch.remove, ch.by)
      : null;
  if (!r || !r.ok) return null;
  const plots = v.plots.map((p, j) => (j === i ? r.plot : p));
  return { ...v, plots };
};
