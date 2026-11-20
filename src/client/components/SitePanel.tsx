import {
  describeGround,
  describeTile,
  type Ground,
  type Tile,
} from '../../shared/city';
import type { SiteWork } from '../../shared/rules';

type Props = {
  tool: SiteWork;
  setTool: (t: SiteWork) => void;
  siteSize: number;
  maxSize: number;
  padCount: number;
  candidates: number;
  /** The picked tile: a city tile to demolish, or a site tile to prepare. */
  selected: Tile | null;
  /** What lies on the picked site tile (prepare only). */
  ground: Ground | null;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  onDone: () => void;
};

const ICON: Record<Tile['kind'], string> = {
  building: '🏢',
  road: '🛣️',
  park: '🌳',
  lot: '🚧',
};

const TOOLS: { id: SiteWork; label: string }[] = [
  { id: 'demolish', label: '💥 Demolish' },
  { id: 'prepare', label: '🧱 Make buildable' },
];

/** Bottom panel for site work: pick a tool, pick a highlighted tile, confirm. */
export const SitePanel = (p: Props) => {
  const demolish = p.tool === 'demolish';
  const full = p.siteSize >= p.maxSize;
  const hint = demolish
    ? full
      ? 'The site is as big as the permit allows. Make the ground buildable next!'
      : p.candidates > 0
        ? 'Tap a building or road with a yellow outline. Only land touching the site can be cleared.'
        : 'Nothing next to the site can be cleared right now.'
    : p.candidates > 0
      ? 'Tap a spot inside the fence with a blue outline to level it and pour a foundation pad. Only pads can be built on.'
      : 'Every spot on the site is buildable. Demolish more to grow it!';

  return (
    <div className="card sheet-in p-3.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-[#3b2a1a]">🏗️ Site work</h2>
        <span className="rounded-full border-2 border-[#3b2a1a] bg-[#ffe9a8] px-2 py-0.5 text-[12px] font-bold">
          {demolish
            ? `${p.siteSize}/${p.maxSize} tiles`
            : `${p.padCount}/${p.siteSize} buildable`}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2" role="tablist">
        {TOOLS.map((t) => {
          const on = t.id === p.tool;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              className={`btn3d py-1.5 text-[14px] font-bold ${
                on
                  ? t.id === 'demolish'
                    ? 'btn-red text-outline-sm'
                    : 'btn-blue text-outline-sm'
                  : 'btn-cream opacity-80'
              }`}
              onClick={() => p.setTool(t.id)}
              disabled={p.busy}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {p.selected ? (
        <div className="pop-in mt-2.5">
          <p className="text-[14px] font-semibold text-[#5c4630]">
            {demolish ? (
              <>
                {ICON[p.selected.kind]} Clear{' '}
                <b className="text-[#3b2a1a]">{describeTile(p.selected)}</b> and
                fence it into the site?
              </>
            ) : (
              <>
                🧱 Clear{' '}
                <b className="text-[#3b2a1a]">
                  {describeGround(p.ground ?? 'dirt')}
                </b>
                , level it and pour a foundation pad here?
              </>
            )}
          </p>
          <div className="mt-3 grid grid-cols-[1fr_2fr] gap-2">
            <button
              className="btn3d btn-cream py-2.5 text-base font-bold"
              onClick={p.onCancel}
              disabled={p.busy}
            >
              Cancel
            </button>
            <button
              className={`btn3d ${demolish ? 'btn-red' : 'btn-blue'} shine py-2.5 text-lg font-bold uppercase tracking-wide text-outline-sm`}
              onClick={p.onConfirm}
              disabled={p.busy}
            >
              {p.busy
                ? demolish
                  ? 'Clearing…'
                  : 'Pouring…'
                : demolish
                  ? '💥 Demolish!'
                  : '🧱 Pour pad!'}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2.5 text-[13px] leading-snug text-[#5c4630]">{hint}</p>
      )}

      {p.error && (
        <p className="mt-2 rounded-xl bg-[#ffe1dc] px-3 py-2 text-sm font-semibold text-[#a1281b]">
          {p.error}
        </p>
      )}

      <button
        className="btn3d btn-green mt-3 w-full py-2.5 text-lg font-bold uppercase text-outline-sm"
        onClick={p.onDone}
      >
        ✓ Done
      </button>
    </div>
  );
};
