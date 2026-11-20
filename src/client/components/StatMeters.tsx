import type { Challenge } from '../../shared/challenge';
import type { Scores } from '../../shared/rules';

type Props = {
  scores: Scores;
  challenge: Challenge;
  preview?: Scores | null;
  /** An empty lot is trivially "stable", so its star stays dark. */
  hasFloors: boolean;
};

const STATS = [
  {
    key: 'height',
    label: 'Height',
    unit: 'm',
    icon: '📏',
    color: '#4fa8ff',
    edge: '#1d63b8',
  },
  {
    key: 'stability',
    label: 'Sturdy',
    unit: '%',
    icon: '🧱',
    color: '#4cd964',
    edge: '#1f8f3a',
  },
  {
    key: 'style',
    label: 'Style',
    unit: '',
    icon: '✨',
    color: '#ff6fae',
    edge: '#b8336f',
  },
] as const;

/** Three chunky gauges. Each fills toward its goal; the star lights when met. */
export const StatMeters = ({
  scores,
  challenge,
  preview,
  hasFloors,
}: Props) => (
  <div className="grid grid-cols-3 gap-2">
    {STATS.map((s) => {
      const target = challenge.targets[s.key];
      const value = scores[s.key];
      const shown = preview?.[s.key] ?? value;
      const delta = shown - value;
      const pct = Math.min(100, (shown / target) * 100);
      const basePct = Math.min(100, (value / target) * 100);
      const met = shown >= target && (s.key !== 'stability' || hasFloors);
      return (
        <div key={s.key} className="relative">
          <div className="flex h-5 items-end justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-white text-outline-sm">
              {s.icon} {s.label}
            </span>
            {delta !== 0 && (
              <span
                className={`pop-in rounded-full border-2 border-[#3b2a1a] px-1.5 text-[11px] font-bold leading-4 ${
                  delta > 0
                    ? 'bg-[#4cd964] text-white'
                    : 'bg-[#ff5b5b] text-white'
                }`}
              >
                {delta > 0 ? '+' : ''}
                {delta}
              </span>
            )}
          </div>
          <div className="relative mt-0.5 h-7 overflow-visible rounded-full border-[2.5px] border-[#3b2a1a] bg-[#3b2a1a]/35 shadow-[0_3px_0_#3b2a1a]">
            {/* preview ghost */}
            {delta > 0 && (
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-white/70 meter-fill"
                style={{ width: `${pct}%` }}
              />
            )}
            <div
              className="meter-fill meter-stripes absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${delta > 0 ? basePct : pct}%`,
                background: `linear-gradient(180deg, color-mix(in srgb, ${s.color} 70%, white), ${s.color} 60%, ${s.edge})`,
                minWidth: shown > 0 ? '14px' : 0,
              }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-white text-outline-sm">
              {shown}
              {s.unit}
              <span className="ml-0.5 text-[10px] opacity-90">/{target}</span>
            </span>
            <span
              className={`absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border-[2.5px] border-[#3b2a1a] text-sm ${
                met
                  ? 'pop-in bg-[#ffc93c] shadow-[0_0_10px_#ffd166]'
                  : 'bg-[#cfc3ad]'
              }`}
              aria-label={met ? 'goal met' : 'goal not met yet'}
            >
              <span className={met ? '' : 'opacity-40 grayscale'}>⭐</span>
            </span>
          </div>
        </div>
      );
    })}
  </div>
);
