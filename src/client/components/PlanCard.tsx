import type { Blueprint, Progress } from '../../shared/blueprints';

/** Today's community blueprint and how far the crew has got. */
export const PlanCard = ({
  blueprint,
  progress,
}: {
  blueprint: Blueprint;
  progress: Progress;
}) => {
  const pct = progress.total
    ? Math.round((100 * progress.done) / progress.total)
    : 0;
  const done = progress.done === progress.total;
  return (
    <div className="card px-3 py-2" title={blueprint.blurb}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#9a8466]">
            📋 Today&apos;s build
          </div>
          <div className="truncate text-[15px] font-bold leading-tight text-[#3b2a1a]">
            {blueprint.name}
          </div>
        </div>
        <div className="shrink-0 text-right text-[13px] font-bold text-[#3b2a1a]">
          {done ? '🎉 Built!' : `${progress.done} / ${progress.total}`}
        </div>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full border-2 border-[#3b2a1a] bg-[#f3e6c9]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: done ? '#4cd964' : '#4fa8ff',
          }}
        />
      </div>
    </div>
  );
};
