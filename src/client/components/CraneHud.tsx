import {
  CRANE_LOADS,
  CRANE_LOAD_IDS,
  type CraneLoadId,
  type DropSpec,
} from '../../shared/structure';
import { setHoist } from '../game/controls';
import { Joystick } from './Joystick';

type Props = {
  load: CraneLoadId | null;
  choice: CraneLoadId;
  setChoice: (c: CraneLoadId) => void;
  atStack: boolean;
  /** Where the hanging load would land, or why it can't. */
  drop: { spec: DropSpec | null; reason: string | null } | null;
  busy: boolean;
  onPickUp: () => void;
  onRelease: () => void;
  onPutBack: () => void;
  onToStack: () => void;
  /** null until something has been dropped. */
  onToLastDrop: (() => void) | null;
  onExit: () => void;
};

/** "24 beams", "16 columns", "16 beams + 8 columns". */
const describeLoad = (id: CraneLoadId): string => {
  const { beam, column } = CRANE_LOADS[id];
  return [beam ? `${beam} beams` : '', column ? `${column} columns` : '']
    .filter(Boolean)
    .join(' + ');
};

const ICON: Record<CraneLoadId, string> = {
  beams: '➖',
  columns: '🏛️',
  mixed: '📦',
};

const SHORT: Record<CraneLoadId, string> = {
  beams: `${CRANE_LOADS.beams.beam} beams`,
  columns: `${CRANE_LOADS.columns.column} cols`,
  mixed: 'Mixed',
};

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

/**
 * Crane cab controls: joystick slews and runs the trolley, ▲▼ hoist.
 * 🧭 and 🎯 fly the hook to the stack or back to the last drop on their own;
 * touching any control takes over again.
 */
export const CraneHud = (p: Props) => {
  let status: string;
  let tone = '';
  if (!p.load) {
    status = p.atStack
      ? `Over the stack. Pick up ${describeLoad(p.choice)}!`
      : 'Head to the steel stack (🧭 flies you there).';
  } else if (p.drop?.spec && !p.drop.reason) {
    status = `Drop ${describeLoad(p.load)} on floor ${p.drop.spec.level + 1}.`;
  } else {
    status = p.drop?.reason ?? 'Swing the load over a floor slab.';
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

      <div className="card flex flex-col gap-1.5 p-1.5">
        {p.load ? (
          <div className="flex items-center gap-1.5">
            <button
              className="btn3d btn-cream px-3 py-2 text-[12px] font-bold"
              disabled={p.busy}
              onClick={p.onPutBack}
            >
              ↩ Put back
            </button>
            {p.onToLastDrop && (
              <button
                className="btn3d btn-yellow px-3 py-2 text-[12px] font-bold"
                onClick={p.onToLastDrop}
              >
                🎯 Last drop
              </button>
            )}
            <button
              className="btn3d btn-green shine flex-1 py-2 text-base font-bold uppercase text-outline-sm"
              disabled={p.busy || !p.drop?.spec || !!p.drop.reason}
              onClick={p.onRelease}
            >
              {p.busy ? 'Lowering…' : '🪝 Drop'}
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-1.5">
              {CRANE_LOAD_IDS.map((id) => (
                <button
                  key={id}
                  className={`btn3d py-1.5 text-[12px] font-bold ${id === p.choice ? 'btn-yellow' : 'btn-cream'}`}
                  aria-pressed={id === p.choice}
                  title={describeLoad(id)}
                  onClick={() => p.setChoice(id)}
                >
                  {ICON[id]} {SHORT[id]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              {!p.atStack && (
                <button
                  className="btn3d btn-yellow px-3 py-2 text-[12px] font-bold"
                  onClick={p.onToStack}
                >
                  🧭 To stack
                </button>
              )}
              <button
                className="btn3d btn-blue flex-1 py-2 text-base font-bold uppercase text-outline-sm"
                disabled={!p.atStack}
                onClick={p.onPickUp}
              >
                🪝 Pick up
              </button>
            </div>
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
