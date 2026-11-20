import { useMemo, type CSSProperties } from 'react';
import type { Milestone } from '../../shared/rules';

export type CelebrationEvent = {
  key: number;
  gains: { label: string; color: string }[];
  teamwork: boolean;
  chain: number;
  unlocks: Milestone[];
};

const COLORS = [
  '#ffc93c',
  '#ff6fae',
  '#4fa8ff',
  '#4cd964',
  '#ff8a3d',
  '#b18cff',
];

/** Full-screen, non-blocking burst played after a successful shift. */
export const Celebration = ({ event }: { event: CelebrationEvent }) => {
  const pieces = useMemo(
    () =>
      Array.from({ length: event.unlocks.length > 0 ? 70 : 40 }, (_, i) => {
        const r = (n: number) => {
          const x =
            Math.sin(event.key * 0.001 + i * 12.9898 + n * 78.233) * 43758.5453;
          return x - Math.floor(x);
        };
        const style: CSSProperties & Record<`--${string}`, string> = {
          left: `${r(1) * 100}%`,
          background: COLORS[i % COLORS.length],
          '--dx': `${(r(2) - 0.5) * 160}px`,
          '--rot': `${360 + r(3) * 720}deg`,
          '--delay': `${r(4) * 0.35}s`,
          '--dur': `${1.4 + r(5) * 1.2}s`,
        };
        return <span key={i} className="confetti" style={style} />;
      }),
    [event.key, event.unlocks.length]
  );

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      aria-live="polite"
    >
      {pieces}
      <div className="absolute inset-x-0 top-[22%] flex flex-col items-center gap-2">
        {event.gains.map((g, i) => (
          <span
            key={g.label}
            className="float-up text-3xl font-bold text-outline"
            style={{ color: g.color, animationDelay: `${0.1 + i * 0.18}s` }}
          >
            {g.label}
          </span>
        ))}
      </div>
      {(event.teamwork || event.unlocks.length > 0) && (
        <div className="absolute inset-x-0 top-[45%] flex justify-center px-6">
          {event.unlocks.length > 0 ? (
            <div
              className="banner-in card max-w-xs px-5 py-3 text-center"
              style={{ animationDuration: '3.2s' }}
            >
              <div className="text-xs font-bold uppercase tracking-widest text-[#b8336f]">
                Crew perk unlocked!
              </div>
              {event.unlocks.map((m) => (
                <div key={m.id}>
                  <div className="text-5xl">{m.icon}</div>
                  <div className="text-xl font-bold text-[#3b2a1a]">
                    {m.name}
                  </div>
                  <div className="text-sm font-semibold text-[#5c4630]">
                    {m.perk}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="banner-in rounded-2xl border-[3px] border-[#3b2a1a] bg-[#4cd964] px-5 py-2 text-center shadow-[0_5px_0_#3b2a1a]">
              <div className="text-2xl font-bold text-white text-outline-sm">
                🤝 Teamwork!
              </div>
              {event.chain > 1 && (
                <div className="text-sm font-bold text-white">
                  🔥 Crew chain ×{event.chain}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
