import type { Progress } from '../../shared/blueprints';
import {
  LEVELS,
  currentLevel,
  landPrice,
  rentRate,
  tilesNeeded,
  type Plot,
} from '../../shared/plots';

/** Your plot: the level you're on, its progress, your rent, and land to buy. */
export const PlotCard = ({
  plot,
  progress,
  coins,
  busy,
  onBuy,
  visitor = false,
}: {
  plot: Plot;
  /** Progress on the current level's blueprint (null when every level is done). */
  progress: Progress | null;
  coins: number;
  busy: boolean;
  onBuy: () => void;
  /** Set when visiting someone else's plot: no buying, an invitation to help instead. */
  visitor?: boolean;
}) => {
  const lvl = currentLevel(plot);
  const name = lvl?.blueprint(plot.block).name ?? 'Every level built!';
  const need = tilesNeeded(plot);
  const price = landPrice(plot);
  const rate = rentRate(plot);
  const pct =
    progress && progress.total
      ? Math.round((100 * progress.done) / progress.total)
      : 100;
  return (
    <div className="card px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#9a8466]">
            {visitor ? `🤝 u/${plot.owner}'s plot` : '🏠 Your plot'} · level{' '}
            {Math.min(plot.level + 1, LEVELS.length)} of {LEVELS.length}
            {rate > 0 && <> · earning 🪙 {rate}/h</>}
          </div>
          <div className="truncate text-[15px] font-bold leading-tight text-[#3b2a1a]">
            {name}
          </div>
        </div>
        {progress && need.length === 0 && (
          <div className="shrink-0 text-[13px] font-bold text-[#3b2a1a]">
            {progress.done} / {progress.total}
          </div>
        )}
      </div>
      {visitor && lvl && need.length === 0 && (
        <div className="mt-1 text-[12px] font-semibold text-[#1f7a35]">
          Help build it: 🪙 3 for every piece of their plan you add.
        </div>
      )}
      {lvl && need.length > 0 && visitor ? (
        <div className="mt-1.5 text-[12px] font-semibold text-[#5c4630]">
          u/{plot.owner} needs more land before the next building.
        </div>
      ) : lvl && need.length > 0 ? (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[12px] font-semibold text-[#5c4630]">
            Needs {need.length} more tile{need.length > 1 ? 's' : ''} of land.
          </span>
          <button
            className="btn3d btn-yellow px-3 py-1 text-[12px] font-bold"
            disabled={busy || coins < price}
            onClick={onBuy}
          >
            Buy a tile · 🪙 {price}
          </button>
        </div>
      ) : (
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full border-2 border-[#3b2a1a] bg-[#f3e6c9]">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${pct}%`,
              backgroundColor: lvl ? '#ffb000' : '#4cd964',
            }}
          />
        </div>
      )}
    </div>
  );
};
