import { PALLET_SIZE, type PalletSpec } from '../../shared/structure';
import { setHoist } from '../game/controls';
import type { CraneLoad } from '../game/crane';
import { Joystick } from './Joystick';

type Props = {
  load: CraneLoad | null;
  choice: CraneLoad;
  setChoice: (c: CraneLoad) => void;
  atStack: boolean;
  /** Where the hanging pallet would land, or why it can't. */
  drop: { spec: PalletSpec | null; reason: string | null } | null;
  busy: boolean;
  onPickUp: () => void;
  onRelease: () => void;
  onPutBack: () => void;
  onExit: () => void;
};

const LOADS: { id: CraneLoad; label: string }[] = [
  { id: 'beam', label: `➖ ${PALLET_SIZE.beam} beams` },
  { id: 'column', label: `🏛️ ${PALLET_SIZE.column} columns` },
];

/** Hold to move the hook; let go to stop. */
const HoistButton = ({ dir, label }: { dir: 1 | -1; label: string }) => (
  <button
    className="btn3d btn-cream h-14 w-14 touch-none select-none rounded-2xl text-xl font-bold"
    aria-label={dir > 0 ? 'Raise hook' : 'Lower hook'}
    onPointerDown={(e) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setHoist(dir);
    }}
    onPointerUp={() => setHoist(0)}
    onPointerCancel={() => setHoist(0)}
    onContextMenu={(e) => e.preventDefault()}
  >
    {label}
  </button>
);

/** Crane cab controls: joystick slews and runs the trolley, ▲▼ hoist. */
export const CraneHud = (p: Props) => {
  let status: string;
  let tone = '';
  if (!p.load) {
    status = p.atStack
      ? 'The hook is over the steel. Pick up a pallet!'
      : 'Swing the hook over the steel stack beside the crane.';
  } else if (p.drop?.spec && !p.drop.reason) {
    status = `Drop the ${p.load}s on floor ${p.drop.spec.level + 1}.`;
  } else {
    status = p.drop?.reason ?? 'Swing the pallet over a floor slab.';
    tone = 'text-[#a1281b]';
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-center">
        <div
          className={`chip max-w-full px-3 py-1 text-center text-[12px] font-bold ${tone}`}
        >
          🏗️ {status}
        </div>
      </div>

      <div className="card flex items-center gap-1.5 p-1.5">
        {p.load ? (
          <>
            <button
              className="btn3d btn-cream px-3 py-2 text-[12px] font-bold"
              disabled={p.busy}
              onClick={p.onPutBack}
            >
              ↩ Put back
            </button>
            <button
              className="btn3d btn-green shine flex-1 py-2 text-base font-bold uppercase text-outline-sm"
              disabled={p.busy || !p.drop?.spec || !!p.drop.reason}
              onClick={p.onRelease}
            >
              {p.busy ? 'Lowering…' : '🪝 Drop'}
            </button>
          </>
        ) : (
          <>
            {LOADS.map((l) => (
              <button
                key={l.id}
                className={`btn3d px-2.5 py-2 text-[12px] font-bold ${l.id === p.choice ? 'btn-yellow' : 'btn-cream'}`}
                aria-pressed={l.id === p.choice}
                onClick={() => p.setChoice(l.id)}
              >
                {l.label}
              </button>
            ))}
            <button
              className="btn3d btn-blue flex-1 py-2 text-base font-bold uppercase text-outline-sm"
              disabled={!p.atStack}
              onClick={p.onPickUp}
            >
              🪝 Pick up
            </button>
          </>
        )}
      </div>

      <div className="flex items-end justify-between">
        <Joystick />
        <div className="flex flex-col items-end gap-2">
          <button
            className="btn3d btn-red px-3 py-1.5 text-[12px] font-bold"
            onClick={p.onExit}
          >
            ⬇ Exit crane
          </button>
          <div className="flex gap-2">
            <HoistButton dir={-1} label="▼" />
            <HoistButton dir={1} label="▲" />
          </div>
        </div>
      </div>
    </div>
  );
};
