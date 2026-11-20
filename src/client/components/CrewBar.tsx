import { MILESTONES, nextMilestone, type TowerState } from '../../shared/rules';
import { ASK_LABEL } from './labels';

const MAX = MILESTONES[MILESTONES.length - 1]!.at;

/**
 * The shared crew meter: Crew Spirit with milestone badges, the current
 * teamwork chain, and the open request from the last builder.
 */
export const CrewBar = ({
  tower,
  spiritPreview,
}: {
  tower: TowerState;
  spiritPreview?: number | null;
}) => {
  const spirit = tower.spirit;
  const shown = spiritPreview ?? spirit;
  const next = nextMilestone(shown);
  const pct = (v: number) => Math.min(100, (v / MAX) * 100);
  return (
    <div className="card px-3 pb-2.5 pt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-[#3b2a1a]">
          🤝 Crew Spirit
        </span>
        <span className="flex items-center gap-1.5">
          {tower.chain > 0 && (
            <span className="pop-in flex items-center gap-0.5 rounded-full border-2 border-[#3b2a1a] bg-[#ff8a3d] px-2 text-[11px] font-bold text-white">
              <span className="flame inline-block">🔥</span> chain ×
              {tower.chain}
            </span>
          )}
          <span className="text-[11px] font-semibold text-[#7a6346]">
            {next
              ? `${next.at - shown} to ${next.icon}`
              : 'All perks unlocked!'}
          </span>
        </span>
      </div>
      <div className="relative mx-3 mt-2 h-4 rounded-full border-[2.5px] border-[#3b2a1a] bg-[#e8dcc4]">
        {shown > spirit && (
          <div
            className="meter-fill absolute inset-y-0 left-0 rounded-full bg-[#ffe9a8]"
            style={{ width: `${pct(shown)}%` }}
          />
        )}
        <div
          className="meter-fill meter-stripes absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${pct(spirit)}%`,
            backgroundColor: '#f5b800',
          }}
        />
        {MILESTONES.map((m) => {
          const got = spirit >= m.at;
          const soon = !got && shown >= m.at;
          return (
            <span
              key={m.id}
              title={`${m.name}: ${m.perk}`}
              className={`absolute top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[2.5px] border-[#3b2a1a] text-base ${
                got
                  ? 'bg-[#ffc93c] shadow-[0_0_10px_#ffd166]'
                  : soon
                    ? 'breathe bg-[#fff4dc]'
                    : 'bg-[#cfc3ad]'
              }`}
              style={{ left: `${pct(m.at)}%` }}
            >
              <span className={got || soon ? '' : 'opacity-50 grayscale'}>
                {m.icon}
              </span>
            </span>
          );
        })}
      </div>
      <div className="mt-2.5 min-h-5 text-[12px] leading-tight text-[#5c4630]">
        {tower.request ? (
          <span>
            <b className="text-[#3b2a1a]">u/{tower.request.by}</b> asks:{' '}
            <span
              className="wiggle inline-block rounded-md border-2 border-[#3b2a1a] px-1.5 font-bold text-white"
              style={{ background: ASK_LABEL[tower.request.kind].color }}
            >
              {ASK_LABEL[tower.request.kind].icon}{' '}
              {ASK_LABEL[tower.request.kind].verb}
            </span>{' '}
            <span className="text-[#7a6346]">Answer for bonus spirit.</span>
          </span>
        ) : (
          <span className="text-[#7a6346]">
            Help each other: answer requests to fill the meter and unlock perks.
          </span>
        )}
      </div>
    </div>
  );
};
