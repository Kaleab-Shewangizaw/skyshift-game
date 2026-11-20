import { describePiece, type PieceSpec } from '../../shared/structure';
import { setHoist } from '../game/controls';
import type { CraneLoad } from '../game/crane';
import type { GhostState } from '../three/Structure';
import { Joystick } from './Joystick';

type Props = {
  load: CraneLoad | null;
  choice: CraneLoad;
  setChoice: (c: CraneLoad) => void;
  atStack: boolean;
  /** Where the hanging piece would land, and whether it may. */
  aim: { spec: PieceSpec; state: GhostState; reason: string | null } | null;
  busy: boolean;
  onPickUp: () => void;
  onRelease: () => void;
  onPutBack: () => void;
  onExit: () => void;
};

const LOADS: { id: CraneLoad; label: string }[] = [
  { id: 'beam', label: '➖ Beam' },
  { id: 'column', label: '🏛️ Column' },
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
      ? 'The hook is over the steel. Pick a piece up!'
      : 'Swing the hook over the steel stack next to the crane and lower it.';
  } else if (!p.aim) {
    status = 'Swing the load over the building.';
  } else if (p.aim.state === 'ok') {
    status = `Release to set ${describePiece(p.aim.spec)}.`;
  } else {
    status = p.aim.reason ?? "It can't go there.";
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
              disabled={p.busy || p.aim?.state !== 'ok'}
              onClick={p.onRelease}
            >
              {p.busy ? 'Setting…' : '🪝 Release'}
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
