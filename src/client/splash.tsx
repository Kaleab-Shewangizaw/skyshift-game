import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { makeChallenge, utcDateKey } from '../shared/challenge';

// Inline (feed) view: keep it light. The full game loads in game.html.
export const Splash = () => {
  const c = makeChallenge(utcDateKey());
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 p-5 text-center"
      style={{
        background: `linear-gradient(${c.theme.sky[0]}, ${c.theme.sky[1]})`,
      }}
    >
      <div className="text-5xl" aria-hidden>
        🏗️
      </div>
      <div>
        <p className="text-xs font-extrabold uppercase tracking-widest text-stone-600">
          Skyshift · today's site
        </p>
        <h1 className="text-2xl font-black text-stone-800">{c.theme.name}</h1>
        <p className="text-sm text-stone-700">
          {c.condition.name} on {c.theme.site}. Goal: {c.targets.height} m,
          sturdy and stylish.
        </p>
      </div>
      <button
        className="min-h-12 rounded-2xl bg-amber-400 px-8 text-lg font-extrabold text-stone-900 shadow-[0_4px_0_#b7791f] transition active:scale-95"
        onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
      >
        Take a shift
      </button>
      <p className="text-xs text-stone-600">
        One shift each. Build today's tower together.
      </p>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
