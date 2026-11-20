import './index.css';

import {
  StrictMode,
  Suspense,
  lazy,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import { roundEndsAt } from '../shared/challenge';
import {
  MAX_SITE_TILES,
  canDemolish,
  canPrepare,
  demolishCandidates,
  groundAt,
  padTiles,
  prepareCandidates,
  siteTiles,
  tileAt,
  type Tile,
} from '../shared/city';
import {
  communityNeed,
  crewSturdiness,
  previewAction,
  scores,
  type Action,
  type Contribution,
  type ContributionKind,
  type Scores,
  type ShiftKind,
  type SiteWork,
} from '../shared/rules';
import { Celebration, type CelebrationEvent } from './components/Celebration';
import { CrewBar } from './components/CrewBar';
import { ShiftPanel, type PanelStep } from './components/ShiftPanel';
import { SitePanel } from './components/SitePanel';
import { StatMeters } from './components/StatMeters';
import { TowerScene } from './components/TowerScene';
import {
  createLocalService,
  createServerService,
  type GameService,
  type GameView,
  type LocalService,
} from './game/service';

const formatLeft = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
};

const ago = (at: number, now: number) => {
  const m = Math.floor((now - at) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
};

type Backend =
  | { kind: 'server'; service: GameService }
  | { kind: 'local'; service: LocalService };

// Replaced at build time, so normal builds drop the local service and demo bar.
const LOCAL_DEMO = import.meta.env.VITE_LOCAL_DEMO === '1';

const makeBackend = (): Backend =>
  LOCAL_DEMO
    ? { kind: 'local', service: createLocalService() }
    : { kind: 'server', service: createServerService() };

// The 3D scene (three.js) loads after the HUD so the first paint stays fast.
type SiteFx = { work: SiteWork; x: number; z: number; key: number };

const City3D = lazy(() =>
  import('./three/City3D').then((m) => ({ default: m.City3D }))
);

/** Very old devices without WebGL keep the 2D scene. */
const HAS_WEBGL = (() => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
})();

/** Measures how much of the screen the HUD and panels cover, so the 3D camera frames the gap. */
const useGapInsets = () => {
  const root = useRef<HTMLDivElement>(null);
  const gap = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState({ top: 0, bottom: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      if (!root.current || !gap.current) return;
      const r = root.current.getBoundingClientRect();
      const g = gap.current.getBoundingClientRect();
      const next = {
        top: Math.round(g.top - r.top),
        bottom: Math.round(r.bottom - g.bottom),
      };
      setInsets((prev) =>
        prev.top === next.top && prev.bottom === next.bottom ? prev : next
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (root.current) ro.observe(root.current);
    if (gap.current) ro.observe(gap.current);
    return () => ro.disconnect();
  });
  return { root, gap, insets };
};

/** How often to pull in other players' shifts while the post is open. */
const REFRESH_MS = 20_000;

export const App = () => {
  const backend = useMemo(() => makeBackend(), []);
  const service = backend.service;
  const [view, setView] = useState<GameView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<PanelStep>('idle');
  const [draft, setDraft] = useState<Action | null>(null);
  const [askChoice, setAskChoice] = useState<ShiftKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState<{
    index: number;
    built: boolean;
    key: number;
  } | null>(null);
  const [party, setParty] = useState<CelebrationEvent | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { root, gap, insets } = useGapInsets();

  // Site mode: demolish neighbors to grow the site, or pour buildable pads on it.
  const [siteMode, setSiteMode] = useState(false);
  const [tool, setTool] = useState<SiteWork>('demolish');
  const [picked, setPicked] = useState<{ x: number; z: number } | null>(null);
  const [fx, setFx] = useState<SiteFx | null>(null);
  const [siteBusy, setSiteBusy] = useState(false);
  const [siteError, setSiteError] = useState<string | null>(null);
  const site = view?.tower.site;
  const pads = view?.tower.pads;
  const candidates = useMemo(() => {
    if (!site || !pads) return [];
    return tool === 'demolish'
      ? demolishCandidates(site)
      : prepareCandidates(site, pads);
  }, [site, pads, tool]);
  const selectedTile: Tile | null =
    picked && site ? tileAt(site, picked.x, picked.z) : null;

  const pickTile = (x: number, z: number) => {
    if (!site || !pads || siteBusy) return;
    const check =
      tool === 'demolish'
        ? canDemolish(site, x, z)
        : canPrepare(site, pads, x, z);
    setSiteError(check.ok ? null : check.reason);
    setPicked(check.ok ? { x, z } : null);
  };

  const chooseTool = (t: SiteWork) => {
    setTool(t);
    setPicked(null);
    setSiteError(null);
  };

  const doSiteWork = async () => {
    if (!picked) return;
    setSiteBusy(true);
    setSiteError(null);
    try {
      const r = await service.siteWork(tool, picked.x, picked.z);
      setView(r.view);
      if (r.ok) setFx({ work: tool, ...picked, key: Date.now() });
      else setSiteError(r.reason);
      setPicked(null);
    } catch (e) {
      setSiteError(
        e instanceof Error ? e.message : 'The site crew got stuck. Try again.'
      );
    } finally {
      setSiteBusy(false);
    }
  };

  const leaveSiteMode = () => {
    setSiteMode(false);
    setPicked(null);
    setSiteError(null);
  };

  const load = useCallback(() => {
    service.load().then(
      (v) => {
        setLoadError(null);
        setView(v);
      },
      (e: unknown) =>
        setLoadError(
          e instanceof Error ? e.message : 'Could not load the site.'
        )
    );
  }, [service]);

  useEffect(load, [load]);

  // Quietly refresh so neighbors' floors appear. Skipped while a shift is in
  // flight or the tab is hidden; a failed refresh keeps the last good view.
  useEffect(() => {
    const t = setInterval(() => {
      if (busy || document.visibilityState !== 'visible') return;
      service.load().then(setView, () => {});
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [service, busy]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!party) return;
    const t = setTimeout(
      () => setParty(null),
      party.unlocks.length > 0 ? 3400 : 2700
    );
    return () => clearTimeout(t);
  }, [party]);

  const me = view?.username ?? 'you';
  const preview = useMemo(
    () =>
      view && draft
        ? previewAction(view.tower, draft, view.challenge, me)
        : null,
    [view, draft, me]
  );
  // Suggest the request that fits the tower *after* this shift; the player can change it.
  const suggestedAsk: ShiftKind =
    preview?.ok && view ? communityNeed(preview.next, view.challenge) : 'build';
  const ask = askChoice ?? suggestedAsk;

  const changeStep = (s: PanelStep) => {
    setError(null);
    if (s !== 'preview') {
      setDraft(null);
      setAskChoice(null);
    }
    setStep(s);
  };

  const confirm = async () => {
    if (!draft || !view || !preview?.ok) return;
    setBusy(true);
    setError(null);
    try {
      const before = scores(view.tower, view.challenge);
      const spiritBefore = view.tower.spirit;
      const r = await service.takeShift(draft, ask);
      if (r.view) setView(r.view);
      if (!r.ok) {
        setError(r.reason);
        return;
      }
      const t = r.view.tower;
      const after = scores(t, r.view.challenge);
      setChanged({
        index: r.floorIndex,
        built: draft.kind === 'build',
        key: Date.now(),
      });
      setParty({
        key: Date.now(),
        gains: describeGains(before, after, t.spirit - spiritBefore),
        teamwork: r.view.myShift?.teamwork ?? preview.teamwork,
        chain: t.chain,
        unlocks: preview.unlocks.filter((m) => t.spirit >= m.at),
      });
      setDraft(null);
      setAskChoice(null);
      setStep('idle');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'The crane jammed. Check your connection and try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <Centered>
        <div className="text-6xl">🚧</div>
        <p className="mt-2 text-2xl font-bold text-white text-outline-sm">
          The site gate is stuck!
        </p>
        <p className="mt-1 text-sm font-semibold text-white/90">{loadError}</p>
        <button
          className="btn3d btn-yellow mt-5 px-8 py-3 text-lg font-bold"
          onClick={load}
        >
          Try again
        </button>
      </Centered>
    );
  }

  if (!view) {
    return (
      <Centered>
        <div className="crane-load text-6xl" aria-hidden>
          🏗️
        </div>
        <p className="mt-3 text-xl font-bold text-white text-outline-sm">
          Opening the site…
        </p>
      </Centered>
    );
  }

  const { challenge, tower } = view;
  const current = scores(tower, challenge);
  const shownTower = preview?.ok ? preview.next : tower;
  const focus = preview?.ok ? preview.floorIndex : (changed?.index ?? null);
  const endsIn = formatLeft(roundEndsAt(view.dateKey) - now);
  const showCrew = step === 'idle' || !!view.myShift;
  const latest = tower.recent[0];

  const ghost = !!preview?.ok && draft?.kind === 'build';
  const justBuilt = !preview && changed?.built ? changed.index : null;

  return (
    <div
      ref={root}
      className="relative h-full overflow-hidden"
      style={{ background: challenge.theme.sky[1] }}
    >
      {HAS_WEBGL && (
        <div className="absolute inset-0 z-0">
          <Suspense fallback={null}>
            <City3D
              tower={shownTower}
              challenge={challenge}
              focusIndex={focus}
              ghost={ghost}
              justBuilt={justBuilt}
              insetTop={insets.top}
              insetBottom={insets.bottom}
              siteMode={siteMode}
              tool={tool}
              candidates={candidates}
              selected={selectedTile}
              fx={fx}
              onPickTile={pickTile}
            />
          </Suspense>
        </div>
      )}
      <div className="pointer-events-none relative z-10 mx-auto flex h-full max-w-[480px] flex-col gap-2.5 px-3 pb-3 pt-2.5">
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white text-outline-sm">
              Skyshift · Day build
            </div>
            <h1 className="truncate text-[26px] font-bold leading-none text-white text-outline">
              {challenge.theme.name}
            </h1>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span
              className="chip px-2.5 py-0.5 text-xs font-bold"
              title={challenge.condition.description}
            >
              {challenge.condition.icon} {challenge.condition.name}
            </span>
            <span className="chip px-2.5 py-0.5 text-xs font-bold">
              ⏱ {endsIn}
            </span>
          </div>
        </header>

        {!siteMode && (
          <StatMeters
            hasFloors={(preview?.ok ? preview.next : tower).floors.length > 0}
            scores={current}
            challenge={challenge}
            preview={preview?.ok ? preview.after : null}
          />
        )}

        {/* The open gap: touches here go through to the 3D camera. */}
        <div ref={gap} className="relative min-h-[170px] flex-1">
          {!HAS_WEBGL && (
            <TowerScene
              key={changed?.key ?? 0}
              tower={shownTower}
              challenge={challenge}
              focusIndex={focus}
              ghost={ghost}
              justBuilt={justBuilt}
            />
          )}
          {latest && step === 'idle' && <Ticker c={latest} now={now} />}
          {!siteMode && step === 'idle' && HAS_WEBGL && (
            // .btn3d sets position: relative, so the wrapper does the positioning.
            <div className="pointer-events-auto absolute bottom-1 left-0 z-10">
              <button
                className="btn3d btn-red px-3 py-1.5 text-[13px] font-bold"
                onClick={() => {
                  setSiteMode(true);
                  setSiteError(null);
                }}
              >
                🏗️ Site work
              </button>
            </div>
          )}
          <div className="chip absolute bottom-1 right-0 z-10 px-2.5 py-0.5 text-[11px] font-bold">
            🏢 {tower.floors.length} floors · 👷 {tower.shiftCount} shifts
          </div>
        </div>

        {siteMode && (
          <div className="pointer-events-auto">
            <SitePanel
              tool={tool}
              setTool={chooseTool}
              siteSize={siteTiles(tower.site).length}
              maxSize={MAX_SITE_TILES}
              padCount={padTiles(tower.pads).length}
              candidates={candidates.length}
              selected={selectedTile}
              ground={picked ? groundAt(tower.site, picked.x, picked.z) : null}
              busy={siteBusy}
              error={siteError}
              onConfirm={doSiteWork}
              onCancel={() => setPicked(null)}
              onDone={leaveSiteMode}
            />
          </div>
        )}

        {!siteMode && showCrew && (
          <div className="pointer-events-auto">
            <CrewBar tower={tower} />
          </div>
        )}

        <div className={siteMode ? 'hidden' : 'pointer-events-auto'}>
          <ShiftPanel
            challenge={challenge}
            step={step}
            setStep={changeStep}
            draft={draft}
            setDraft={setDraft}
            preview={preview}
            need={communityNeed(tower, challenge)}
            request={tower.request}
            crewBonus={crewSturdiness(tower)}
            ask={ask}
            setAsk={setAskChoice}
            myShift={view.myShift}
            busy={busy}
            error={error}
            onConfirm={confirm}
            endsIn={endsIn}
          />
        </div>

        {LOCAL_DEMO && backend.kind === 'local' && (
          <div className="pointer-events-auto flex items-center justify-center gap-2 text-[11px]">
            <span className="font-bold text-white text-outline-sm">
              Local demo
            </span>
            <button
              className="btn3d btn-cream px-3 py-1 text-xs font-bold"
              onClick={() => setView(backend.service.simulateNeighbor())}
            >
              + neighbor shift
            </button>
            <button
              className="btn3d btn-cream px-3 py-1 text-xs font-bold"
              onClick={() => {
                setChanged(null);
                changeStep('idle');
                setView(backend.service.reset());
              }}
            >
              reset day
            </button>
          </div>
        )}
      </div>
      {party && <Celebration key={party.key} event={party} />}
    </div>
  );
};

const describeGains = (
  before: Scores,
  after: Scores,
  spirit: number
): CelebrationEvent['gains'] => {
  const g: CelebrationEvent['gains'] = [];
  const dh = after.height - before.height;
  const ds = after.stability - before.stability;
  const dy = after.style - before.style;
  if (dh) g.push({ label: `${dh > 0 ? '+' : ''}${dh} m`, color: '#4fa8ff' });
  if (ds)
    g.push({
      label: `${ds > 0 ? '+' : ''}${ds}% sturdy`,
      color: ds > 0 ? '#4cd964' : '#ff5b5b',
    });
  if (dy) g.push({ label: `+${dy} style`, color: '#ff6fae' });
  if (spirit) g.push({ label: `+${spirit} spirit`, color: '#ffc93c' });
  return g;
};

const KIND_ICON: Record<ContributionKind, string> = {
  build: '🏗️',
  reinforce: '🔩',
  decorate: '🌸',
  demolish: '💥',
  prepare: '🧱',
};

/** The latest shift, as a speech bubble over the scene. */
const Ticker = ({ c, now }: { c: Contribution; now: number }) => (
  <div
    key={`${c.user}-${c.at}`}
    className="pop-in absolute left-0 top-1 z-10 max-w-[78%]"
  >
    <div className="chip truncate px-3 py-1 text-[11px] font-semibold">
      {KIND_ICON[c.kind]} <b>u/{c.user}</b> {c.summary}
      {c.teamwork && <span className="text-[#1f8f3a]"> 🤝</span>}{' '}
      <span className="text-[#9a8466]">· {ago(c.at, now)}</span>
    </div>
  </div>
);

const Centered = ({ children }: { children: ReactNode }) => (
  <div className="flex h-full flex-col items-center justify-center bg-gradient-to-b from-[#6c8cff] to-[#b18cff] p-6 text-center">
    {children}
  </div>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
