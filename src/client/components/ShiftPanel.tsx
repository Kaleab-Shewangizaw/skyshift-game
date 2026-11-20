import type { ReactNode } from 'react';
import type { Challenge } from '../../shared/challenge';
import {
  DECORATIONS,
  MATERIALS,
  type DecorId,
  type MaterialId,
} from '../../shared/content';
import {
  decorStyle,
  floorSturdiness,
  type Action,
  type Contribution,
  type CrewRequest,
  type Preview,
  type ShiftKind,
} from '../../shared/rules';
import { ASK_LABEL } from './labels';

export type PanelStep = 'idle' | 'choose' | 'build' | 'decorate' | 'preview';

type Props = {
  challenge: Challenge;
  step: PanelStep;
  setStep: (s: PanelStep) => void;
  draft: Action | null;
  setDraft: (a: Action | null) => void;
  preview: Preview | null;
  need: ShiftKind;
  request: CrewRequest | null;
  crewBonus: number;
  ask: ShiftKind;
  setAsk: (k: ShiftKind) => void;
  myShift: Contribution | null;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  endsIn: string;
};

const KINDS: {
  kind: ShiftKind;
  title: string;
  desc: string;
  icon: string;
  btn: string;
}[] = [
  {
    kind: 'build',
    title: 'Build',
    desc: 'Stack a floor',
    icon: '🏗️',
    btn: 'btn-orange',
  },
  {
    kind: 'reinforce',
    title: 'Brace',
    desc: 'Fix the wobbliest',
    icon: '🔩',
    btn: 'btn-blue',
  },
  {
    kind: 'decorate',
    title: 'Decorate',
    desc: 'Add some charm',
    icon: '🌸',
    btn: 'btn-pink',
  },
];

const DECOR_ICON: Record<DecorId, string> = {
  flowerbox: '🌷',
  flag: '🎏',
  lights: '💡',
  awning: '⛱️',
  birdhouse: '🐦',
  mural: '🎨',
  solar: '🔆',
  lantern: '🏮',
};

const NEED_TEXT: Record<ShiftKind, string> = {
  build: 'The tower wants to grow taller!',
  reinforce: 'Some floors are wobbling. Bracing helps most!',
  decorate: 'The tower could use some charm!',
};

export const ShiftPanel = (p: Props) => {
  if (p.myShift) {
    return (
      <div className="card sheet-in p-4 text-center">
        <div className="text-2xl font-bold text-[#3b2a1a]">
          Shift complete! 👷
        </div>
        <p className="mt-1 text-sm text-[#5c4630]">
          You {p.myShift.summary}.
          {p.myShift.teamwork && (
            <b className="text-[#1f8f3a]"> Teamwork bonus earned! 🤝</b>
          )}
        </p>
        <p className="mt-2 rounded-xl bg-[#ffe9a8] px-3 py-2 text-sm font-semibold text-[#5c4630]">
          📣 Share this post so a neighbor can answer your request!
        </p>
        <p className="mt-2 text-xs font-semibold text-[#7a6346]">
          🕛 Tower test in {p.endsIn} · new site tomorrow
        </p>
      </div>
    );
  }

  if (p.step === 'idle') {
    return (
      <div className="sheet-in">
        <button
          className="btn3d btn-yellow shine breathe w-full py-4 text-2xl font-bold uppercase tracking-wide"
          onClick={() => p.setStep('choose')}
        >
          Take your shift!
        </button>
        <p className="mt-3 text-center text-[13px] font-semibold text-white text-outline-sm">
          {p.request
            ? `u/${p.request.by} needs a hand: ${ASK_LABEL[p.request.kind].verb.toLowerCase()}`
            : NEED_TEXT[p.need]}
        </p>
      </div>
    );
  }

  if (p.step === 'choose') {
    return (
      <Sheet title="Pick your job" onBack={() => p.setStep('idle')}>
        <div className="stagger grid grid-cols-3 gap-2.5 pt-2">
          {KINDS.map((k) => {
            const requested = p.request?.kind === k.kind;
            const needed = !p.request && p.need === k.kind;
            return (
              <button
                key={k.kind}
                className={`btn3d ${k.btn} flex min-h-28 flex-col items-center justify-center gap-0.5 !overflow-visible px-1 py-2`}
                onClick={() => {
                  if (k.kind === 'reinforce') {
                    p.setDraft({ kind: 'reinforce' });
                    p.setStep('preview');
                  } else {
                    p.setStep(k.kind);
                  }
                }}
              >
                {(requested || needed) && (
                  <span className="wiggle absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-[#3b2a1a] bg-[#ffc93c] px-2 text-[10px] font-bold uppercase text-[#3b2a1a]">
                    {requested ? '🤝 Requested' : 'Needed'}
                  </span>
                )}
                <span
                  className="text-4xl drop-shadow-[0_2px_0_rgba(0,0,0,0.25)]"
                  aria-hidden
                >
                  {k.icon}
                </span>
                <span className="text-lg font-bold leading-tight text-outline-sm">
                  {k.title}
                </span>
                <span className="text-[11px] font-semibold leading-tight opacity-95">
                  {k.desc}
                </span>
              </button>
            );
          })}
        </div>
      </Sheet>
    );
  }

  if (p.step === 'build') {
    return (
      <Sheet title="Pick a material" onBack={() => p.setStep('choose')}>
        <div className="stagger grid grid-cols-3 gap-2.5">
          {p.challenge.materials.map((id) => {
            const m = MATERIALS[id];
            const sturdy = floorSturdiness(
              { material: id, braces: 0, decor: [], builtBy: '' },
              p.challenge,
              p.crewBonus
            );
            const mod = p.challenge.condition.materialMods[id];
            return (
              <button
                key={id}
                className="btn3d btn-cream flex flex-col items-center gap-1 px-1 pb-2 pt-2"
                onClick={() => {
                  p.setDraft({ kind: 'build', material: id });
                  p.setStep('preview');
                }}
              >
                <MaterialSwatch id={id} />
                <span className="text-base font-bold leading-none">
                  {m.name}
                </span>
                <span className="text-[10px] font-semibold leading-tight text-[#7a6346]">
                  {m.blurb}
                </span>
                <span className="mt-0.5 flex flex-wrap justify-center gap-1 text-[11px] font-bold">
                  <Pill tone="blue">+{m.height}m</Pill>
                  <Pill tone={mod ? (mod > 0 ? 'green' : 'red') : 'green'}>
                    🧱{sturdy}
                  </Pill>
                  <Pill tone="pink">✨{m.style}</Pill>
                </span>
              </button>
            );
          })}
        </div>
      </Sheet>
    );
  }

  if (p.step === 'decorate') {
    return (
      <Sheet title="Pick a decoration" onBack={() => p.setStep('choose')}>
        <div className="stagger grid grid-cols-3 gap-2.5 pt-1">
          {p.challenge.decorations.map((id) => {
            const d = DECORATIONS[id];
            const themed = d.tags.includes(p.challenge.theme.tag);
            return (
              <button
                key={id}
                className="btn3d btn-cream flex min-h-28 flex-col items-center justify-center gap-1 !overflow-visible px-1 py-2"
                onClick={() => {
                  p.setDraft({ kind: 'decorate', decor: id });
                  p.setStep('preview');
                }}
              >
                {themed && (
                  <span className="wiggle absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-[#3b2a1a] bg-[#ff6fae] px-2 text-[10px] font-bold uppercase text-white">
                    Theme match!
                  </span>
                )}
                <span className="text-4xl" aria-hidden>
                  {DECOR_ICON[id]}
                </span>
                <span className="text-sm font-bold leading-tight">
                  {d.name}
                </span>
                <Pill tone="pink">✨ +{decorStyle(id, p.challenge)}</Pill>
              </button>
            );
          })}
        </div>
      </Sheet>
    );
  }

  // preview / confirm
  const back = () => {
    const kind = p.draft?.kind;
    p.setDraft(null);
    p.setStep(kind === 'build' || kind === 'decorate' ? kind : 'choose');
  };
  const pv = p.preview;
  return (
    <Sheet title={pv?.ok ? pv.headline : 'Hmm…'} onBack={back}>
      {pv && !pv.ok && (
        <p className="rounded-xl bg-[#ffe1dc] px-3 py-2 text-sm font-semibold text-[#a1281b]">
          {pv.reason}
        </p>
      )}
      {pv?.ok && (
        <div className="space-y-2">
          {(pv.teamwork || pv.unlocks.length > 0) && (
            <div className="pop-in flex flex-wrap gap-1.5">
              {pv.teamwork && (
                <span className="rounded-full border-2 border-[#3b2a1a] bg-[#4cd964] px-2.5 py-0.5 text-xs font-bold text-white">
                  🤝 Answers u/{p.request?.by}'s request!
                </span>
              )}
              <span className="rounded-full border-2 border-[#3b2a1a] bg-[#ffc93c] px-2.5 py-0.5 text-xs font-bold">
                +{pv.spiritGain} crew spirit
              </span>
              {pv.unlocks.map((m) => (
                <span
                  key={m.id}
                  className="breathe rounded-full border-2 border-[#3b2a1a] bg-[#b18cff] px-2.5 py-0.5 text-xs font-bold text-white"
                >
                  Unlocks {m.icon} {m.name}!
                </span>
              ))}
            </div>
          )}
          {pv.notes.length > 0 && (
            <ul className="space-y-0.5 text-[13px] leading-snug text-[#5c4630]">
              {pv.notes.map((n) => (
                <li key={n}>💬 {n}</li>
              ))}
            </ul>
          )}
          <div>
            <div className="mb-1 text-[12px] font-bold text-[#5c4630]">
              Leave a note for the next builder:
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {KINDS.map((k) => {
                const on = p.ask === k.kind;
                return (
                  <button
                    key={k.kind}
                    aria-pressed={on}
                    onClick={() => p.setAsk(k.kind)}
                    className={`rounded-xl border-[2.5px] border-[#3b2a1a] px-1 py-1.5 text-[12px] font-bold leading-tight transition active:scale-95 ${
                      on
                        ? 'text-white shadow-[0_3px_0_#3b2a1a] -translate-y-0.5'
                        : 'bg-[#efe3cb] text-[#7a6346]'
                    }`}
                    style={
                      on ? { background: ASK_LABEL[k.kind].color } : undefined
                    }
                  >
                    {ASK_LABEL[k.kind].icon} {ASK_LABEL[k.kind].verb}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {p.error && (
        <p className="mt-2 rounded-xl bg-[#ffe1dc] px-3 py-2 text-sm font-semibold text-[#a1281b]">
          {p.error}
        </p>
      )}
      <button
        className="btn3d btn-green shine mt-3.5 w-full py-3 text-xl font-bold uppercase tracking-wide text-outline-sm"
        disabled={!pv?.ok || p.busy}
        onClick={p.onConfirm}
      >
        {p.busy ? 'Building…' : 'Place it! ✔'}
      </button>
    </Sheet>
  );
};

const Sheet = ({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) => (
  <div className="card sheet-in p-3.5">
    <div className="mb-3 flex items-center gap-2">
      <button
        className="btn3d btn-cream flex h-10 w-10 shrink-0 items-center justify-center !rounded-full text-lg font-bold"
        onClick={onBack}
        aria-label="Back"
      >
        ←
      </button>
      <h2 className="text-xl font-bold text-[#3b2a1a] first-letter:uppercase">
        {title}
      </h2>
    </div>
    {children}
  </div>
);

const PILL_TONES = {
  blue: 'bg-[#d7ebff] text-[#1d63b8]',
  green: 'bg-[#d9f7de] text-[#1f8f3a]',
  red: 'bg-[#ffe1dc] text-[#b8331f]',
  pink: 'bg-[#ffe0ef] text-[#b8336f]',
};

const Pill = ({
  tone,
  children,
}: {
  tone: keyof typeof PILL_TONES;
  children: ReactNode;
}) => (
  <span
    className={`rounded-full px-1.5 py-px text-[11px] font-bold ${PILL_TONES[tone]}`}
  >
    {children}
  </span>
);

/** A tiny floor drawing so materials read as building blocks, not text. */
const MaterialSwatch = ({ id }: { id: MaterialId }) => {
  const m = MATERIALS[id];
  const h = 12 + m.height * 5;
  return (
    <svg
      viewBox={`0 0 56 ${h + 4}`}
      className="w-14"
      style={{ height: h + 4 }}
      aria-hidden
    >
      <rect
        x={2}
        y={2}
        width={52}
        height={h}
        rx={3}
        fill={m.colors.wall}
        stroke="#3b2a1a"
        strokeWidth={2.5}
      />
      {id === 'glass'
        ? [0, 1, 2].map((k) => (
            <rect
              key={k}
              x={6 + k * 15.5}
              y={6}
              width={13}
              height={h - 8}
              fill={m.colors.window}
              stroke={m.colors.trim}
            />
          ))
        : [0, 1, 2].map((k) => (
            <rect
              key={k}
              x={8 + k * 15}
              y={2 + h / 2 - 5}
              width={10}
              height={10}
              rx={2}
              fill={m.colors.window}
              stroke={m.colors.trim}
              strokeWidth={1.5}
            />
          ))}
      {id === 'brick' && (
        <path
          d={`M2 ${h / 3} h52 M2 ${(2 * h) / 3 + 2} h52`}
          stroke={m.colors.trim}
          strokeWidth={1}
          opacity={0.5}
        />
      )}
    </svg>
  );
};
