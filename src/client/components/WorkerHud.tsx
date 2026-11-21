import {
  PIECES,
  PIECE_KINDS,
  WALLS,
  WALL_MATERIALS,
  describePiece,
  type Pallet,
  type PieceKind,
  type PieceSpec,
  type WallMaterial,
} from '../../shared/structure';
import { pressJump } from '../game/controls';
import type { GhostState } from '../three/Structure';
import { Joystick } from './Joystick';

const SHORT: Record<PieceKind, string> = {
  foundation: 'Footing',
  column: 'Column',
  beam: 'Beam',
  slab: 'Slab',
  wall: 'Wall',
  stairs: 'Stairs',
  lift: 'Lift',
  lean: 'Lean',
  brace: 'Brace',
  arch: 'Arch',
  spire: 'Spire',
};

type Props = {
  kind: PieceKind;
  setKind: (k: PieceKind) => void;
  material: WallMaterial;
  setMaterial: (m: WallMaterial) => void;
  /** Steel left on this floor (null on floors 1–2, where it's carried by hand). */
  steelLeft: number | null;
  /** How the aimed spot relates to today's blueprint, if it's part of it. */
  planNote: string | null;
  /** How many of each piece the plan here still needs. */
  planLeft: Partial<Record<PieceKind, number>>;
  /** The spot in front of the worker, and whether it can be built on. */
  aim: {
    spec: PieceSpec;
    level: number;
    state: GhostState;
    reason: string | null;
  } | null;
  busy: boolean;
  onAct: () => void;
  /** Standing in an elevator shaft: which way it can go. */
  lift: { up: boolean; down: boolean };
  onLift: (dir: 1 | -1) => void;
  running: boolean;
  onRun: (on: boolean) => void;
  /** Standing at the crane's foot: offer to climb into the cab. */
  nearCrane: boolean;
  onEnterCrane: () => void;
  /** Pallets right next to the worker, which can be sent back down. */
  nearPallets: Pallet[];
  onReturn: (p: Pallet) => void;
};

/** On-foot controls: piece hotbar, joystick, build and jump buttons. */
export const WorkerHud = (p: Props) => {
  const a = p.aim;
  const label = !a
    ? '…'
    : a.state === 'remove'
      ? '🗑 Take down'
      : `${PIECES[p.kind].icon} Place`;
  return (
    <div className="flex flex-col gap-2">
      {/* what the worker is looking at */}
      <div className="flex justify-center">
        <div className="chip max-w-full truncate px-3 py-1 text-[12px] font-bold">
          Floor {(a?.level ?? 0) + 1}
          {a && (
            <>
              {' · '}
              {a.state === 'bad' && a.reason ? (
                <span className="text-[#a1281b]">{a.reason}</span>
              ) : a.state === 'remove' ? (
                <>Your {describePiece(a.spec).replace(/^an? /, '')}</>
              ) : (
                <>Build {describePiece(a.spec)}</>
              )}
            </>
          )}
          {p.planNote && (
            <span
              className={
                p.planNote.startsWith('✓') ? 'text-[#1f7a35]' : 'text-[#b86b00]'
              }
            >
              {' · '}
              {p.planNote}
            </span>
          )}
          {p.steelLeft !== null && (
            <span className={p.steelLeft > 0 ? '' : 'text-[#a1281b]'}>
              {' · '}
              {p.kind === 'beam' ? '➖' : '🏛️'} {p.steelLeft} left here
            </span>
          )}
        </div>
      </div>

      <div className="card grid grid-cols-6 gap-1 p-1.5">
        {PIECE_KINDS.map((k) => {
          const on = k === p.kind;
          return (
            <button
              key={k}
              className={`btn3d flex flex-col items-center py-1 text-[11px] font-bold leading-tight ${on ? 'btn-yellow' : 'btn-cream'}`}
              aria-pressed={on}
              onClick={() => p.setKind(k)}
            >
              <span className="text-lg leading-none">{PIECES[k].icon}</span>
              {SHORT[k]}
              {(p.planLeft[k] ?? 0) > 0 && (
                <span
                  className="absolute -right-1 -top-1.5 min-w-[18px] rounded-full border-2 border-[#3b2a1a] bg-[#4fa8ff] px-1 text-center text-[10px] font-bold leading-[14px] text-white"
                  title="Still needed by the plan"
                >
                  {p.planLeft[k]}
                </span>
              )}
            </button>
          );
        })}
        {p.kind === 'wall' && (
          <div className="col-span-6 grid grid-cols-4 gap-1.5">
            {WALL_MATERIALS.map((m) => {
              const on = m === p.material;
              return (
                <button
                  key={m}
                  className={`btn3d flex items-center justify-center gap-1 py-1 text-[11px] font-bold ${on ? 'btn-yellow' : 'btn-cream'}`}
                  aria-pressed={on}
                  onClick={() => p.setMaterial(m)}
                >
                  <span
                    className="inline-block h-3 w-3 rounded-sm border border-[#3b2a1a]"
                    style={{ backgroundColor: WALLS[m].color }}
                  />
                  {WALLS[m].name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-end justify-between">
        <Joystick />
        <div className="flex flex-col items-end gap-2">
          {p.nearPallets.map((q) => (
            <button
              key={`${q.kind}:${q.x},${q.z}`}
              className="btn3d btn-cream pop-in px-3 py-1.5 text-[12px] font-bold"
              disabled={p.busy}
              onClick={() => p.onReturn(q)}
            >
              ↩ Send back {q.left} {q.kind}s
            </button>
          ))}
          {(p.lift.up || p.lift.down) && (
            <div className="pop-in flex gap-1.5">
              <button
                className="btn3d btn-blue h-12 px-3 text-[15px] font-bold text-outline-sm"
                disabled={!p.lift.down}
                aria-label="Elevator down"
                onClick={() => p.onLift(-1)}
              >
                🛗 ▼
              </button>
              <button
                className="btn3d btn-blue h-12 px-3 text-[15px] font-bold text-outline-sm"
                disabled={!p.lift.up}
                aria-label="Elevator up"
                onClick={() => p.onLift(1)}
              >
                🛗 ▲
              </button>
            </div>
          )}
          {p.nearCrane && (
            <button
              className="btn3d btn-blue shine pop-in px-3 py-2 text-[13px] font-bold text-outline-sm"
              onClick={p.onEnterCrane}
            >
              🏗️ Enter crane
            </button>
          )}
          <div className="flex gap-2">
            <button
              className={`btn3d h-12 w-12 rounded-full text-lg font-bold ${p.running ? 'btn-yellow' : 'btn-cream'}`}
              aria-label="Run"
              aria-pressed={p.running}
              title="Run (or hold Shift)"
              onClick={() => p.onRun(!p.running)}
            >
              🏃
            </button>
            <button
              className="btn3d btn-cream h-12 w-12 rounded-full text-lg font-bold"
              aria-label="Jump"
              onClick={pressJump}
            >
              ⤒
            </button>
          </div>
          <button
            className={`btn3d shine min-w-[132px] px-4 py-3 text-lg font-bold uppercase text-outline-sm ${a?.state === 'remove' ? 'btn-red' : 'btn-green'}`}
            disabled={!a || a.state === 'bad' || p.busy}
            onClick={p.onAct}
          >
            {p.busy ? 'Working…' : label}
          </button>
        </div>
      </div>
    </div>
  );
};
