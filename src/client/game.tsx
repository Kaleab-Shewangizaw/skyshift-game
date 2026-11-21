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
import { dailyBlueprint, planAt, progressOf } from '../shared/blueprints';
import {
  blockKey,
  currentLevel,
  plotAt,
  removeFromPlot,
  tilesNeeded,
  type Block,
} from '../shared/plots';
import { roundEndsAt } from '../shared/challenge';
import {
  MAX_SITE_TILES,
  SITE_REACH,
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
import type { Contribution, ContributionKind, SiteWork } from '../shared/rules';
import {
  HAND_LEVELS,
  canDeliver,
  canPlace,
  canRemove,
  cellTile,
  describePiece,
  deliveryTarget,
  steelOf,
  slotKey,
  steelOnFloor,
  type Pallet,
  type PieceKind,
  type PieceSpec,
  type WallMaterial,
} from '../shared/structure';
import { PlanCard } from './components/PlanCard';
import { PlotCard } from './components/PlotCard';
import { SitePanel } from './components/SitePanel';
import { WorkerHud } from './components/WorkerHud';
import { CraneHud } from './components/CraneHud';
import { requestTeleport, useKeyboard } from './game/controls';
import {
  attachLoad,
  dropLoad,
  flyToLastDrop,
  flyToStack,
  hasLastDrop,
  type CraneLoad,
} from './game/crane';
import {
  createLocalService,
  createServerService,
  type GameService,
  type GameView,
  type LocalService,
} from './game/service';
import type { CraneAim } from './three/CraneOperator';
import type { GhostState } from './three/Structure';

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

type SiteFx = { work: SiteWork; x: number; z: number; key: number };

/** The spot in front of the worker: where it is (own plot or today's build) and whether it can be built. */
type Aim = {
  spec: PieceSpec;
  level: number;
  where: 'plot' | 'daily';
  state: GhostState;
  reason: string | null;
};

// The 3D scene (three.js) loads after the HUD so the first paint stays fast.
const City3D = lazy(() =>
  import('./three/City3D').then((m) => ({ default: m.City3D }))
);

const HAS_WEBGL = (() => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
})();

/** Measures how much of the screen the HUD covers, so the 3D camera frames the gap. */
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

/** How often to pull in other players' work while the post is open. */
const REFRESH_MS = 20_000;

export const App = () => {
  const backend = useMemo(() => makeBackend(), []);
  const service = backend.service;
  const [view, setView] = useState<GameView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { root, gap, insets } = useGapInsets();
  const me = view?.username ?? 'you';

  // ---- On foot: the worker builds the piece in front of them ----
  const [kind, setKind] = useState<PieceKind>('foundation');
  const [material, setMaterial] = useState<WallMaterial>('brick');
  const [target, setTarget] = useState<{
    spec: PieceSpec;
    level: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const onAim = useCallback(
    (spec: PieceSpec, level: number) => setTarget({ spec, level }),
    []
  );

  const pieces = view?.tower.pieces;
  const pads = view?.tower.pads;
  const pallets = view?.tower.pallets;
  // ---- Plots: everyone's land in this post's city ----
  const plots = useMemo(() => view?.plots ?? [], [view]);
  const myPlot = plots.find((p) => p.owner === me) ?? null;
  const coins = view?.coins ?? 0;
  const myLevel = myPlot ? currentLevel(myPlot) : null;
  const plotPlan = useMemo(
    () => (myPlot && myLevel ? myLevel.blueprint(myPlot.block) : null),
    [myPlot, myLevel]
  );
  const plotProgress = useMemo(
    () => (myPlot && plotPlan ? progressOf(plotPlan, myPlot.pieces) : null),
    [myPlot, plotPlan]
  );

  // Where the worker aims decides the rules: their own plot, someone else's, or today's build.
  const aim = useMemo((): Aim | null => {
    if (!target || !pieces || !pads || !pallets) return null;
    const key = slotKey(target.spec);
    const owner = plotAt(plots, target.spec);
    if (owner && owner !== myPlot)
      return {
        ...target,
        where: 'plot',
        state: 'bad',
        reason: `That's u/${owner.owner}'s plot.`,
      };
    if (owner && myPlot) {
      const there = myPlot.pieces.some((p) => slotKey(p) === key);
      const c = there
        ? removeFromPlot(myPlot, key)
        : canPlace(myPlot.pieces, myPlot.tiles, target.spec, null);
      const state: GhostState = !c.ok ? 'bad' : there ? 'remove' : 'ok';
      return {
        ...target,
        where: 'plot',
        state,
        reason: c.ok ? null : c.reason,
      };
    }
    const there = pieces.some((p) => slotKey(p) === key);
    // Aiming at an existing piece offers to take it down; otherwise to place one.
    const c = there
      ? canRemove(pieces, key, me, pallets)
      : canPlace(pieces, pads, target.spec, pallets);
    const state: GhostState = !c.ok ? 'bad' : there ? 'remove' : 'ok';
    return { ...target, where: 'daily', state, reason: c.ok ? null : c.reason };
  }, [target, pieces, pads, pallets, me, plots, myPlot]);

  // ---- Today's community blueprint ----
  const dateKey = view?.dateKey;
  const daily = useMemo(
    () => (dateKey ? dailyBlueprint(dateKey) : null),
    [dateKey]
  );
  const progress = useMemo(
    () => (daily && pieces ? progressOf(daily, pieces) : null),
    [daily, pieces]
  );
  const [cheer, setCheer] = useState<string | null>(null);
  // Does the spot the worker aims at match the plan?
  const planNote = useMemo(() => {
    const bp = aim?.where === 'plot' ? plotPlan : daily;
    if (!bp || !aim || aim.state === 'remove') return null;
    const want = planAt(bp, aim.spec);
    if (!want) return null;
    return want.material === aim.spec.material && want.dir === aim.spec.dir
      ? '✓ on the plan'
      : `the plan wants ${describePiece(want).replace(/ on floor \d+$/, '')} here`;
  }, [daily, plotPlan, aim]);

  // The world the 3D scene shows: today's site plus every player's plot.
  // Memoized: the scene rebuilds its colliders and meshes when these change.
  const world = useMemo(() => {
    if (!view) return null;
    const t = view.tower;
    const plotTiles = plots.flatMap((p) => p.tiles);
    return {
      ...t,
      site: [...t.site, ...plotTiles],
      pads: [...t.pads, ...plotTiles],
      pieces: [...t.pieces, ...plots.flatMap((p) => p.pieces)],
    };
  }, [view, plots]);
  const plan = useMemo(
    () => [
      ...(progress?.missing ?? []),
      ...(myPlot && plotProgress && tilesNeeded(myPlot).length === 0
        ? plotProgress.missing
        : []),
    ],
    [progress, myPlot, plotProgress]
  );

  // Steel left on the worker's floor, once floors need crane deliveries.
  const steel = steelOf(kind);
  const steelLeft =
    target && pallets && steel && target.level >= HAND_LEVELS
      ? steelOnFloor(pallets, steel, target.level)
      : null;

  const act = async () => {
    if (!aim || aim.state === 'bad') return;
    setBusy(true);
    try {
      if (aim.where === 'plot') {
        const r = await service.plot(
          aim.state === 'remove'
            ? { op: 'remove', slot: slotKey(aim.spec) }
            : { op: 'place', piece: aim.spec }
        );
        setView(r.view);
        if (!r.ok) setNotice(r.reason);
        else if (r.finished)
          setCheer(
            `🏆 ${r.finished} finished! +🪙 ${r.bonus}. It's rented out now.`
          );
        return;
      }
      const r = await service.build(
        aim.state === 'remove'
          ? { op: 'remove', slot: slotKey(aim.spec) }
          : { op: 'place', piece: aim.spec }
      );
      setView(r.view);
      if (!r.ok) setNotice(r.reason);
      else if (daily && progress && progress.done < progress.total) {
        const after = progressOf(daily, r.view.tower.pieces);
        if (after.done === after.total)
          setCheer(`🎉 ${daily.name} is finished! Great work, crew.`);
      }
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : 'The crew dropped it. Try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  // ---- In the crane: bring pallets of steel up to the floors ----
  const [inCrane, setInCrane] = useState(false);
  const [nearCrane, setNearCrane] = useState(false);
  const [craneAim, setCraneAim] = useState<CraneAim | null>(null);
  const [craneChoice, setCraneChoice] = useState<CraneLoad>('beams');
  // Mirrors the crane's load so the HUD re-renders when it changes.
  const [hookLoad, setHookLoad] = useState<CraneLoad | null>(null);

  // Where the hanging pallet would land: the highest slab under it.
  const drop = useMemo(() => {
    if (!hookLoad || !craneAim || !pieces || !pallets) return null;
    const { x, y, z } = craneAim.hook;
    const spot = deliveryTarget(pieces, x, y - 2, z);
    if (!spot)
      return { spec: null, reason: 'Swing the pallet over a floor slab.' };
    const spec = { ...spot, load: hookLoad };
    const c = canDeliver(pieces, pallets, spec);
    return { spec, reason: c.ok ? null : c.reason };
  }, [hookLoad, craneAim, pieces, pallets]);

  const pickUp = () => {
    attachLoad(craneChoice);
    setHookLoad(craneChoice);
  };
  const putBack = () => {
    dropLoad(false);
    setHookLoad(null);
  };
  const release = async () => {
    if (!drop?.spec || drop.reason) return;
    setBusy(true);
    try {
      const r = await service.build({ op: 'deliver', drop: drop.spec });
      setView(r.view);
      if (r.ok) {
        dropLoad(true);
        setHookLoad(null);
        // Head straight back for the next load.
        flyToStack();
      } else setNotice(r.reason);
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : 'The load slipped. Try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  // ---- Leftover steel: a worker beside a pallet can send it back down ----
  const [cell, setCell] = useState<{
    x: number;
    z: number;
    level: number;
  } | null>(null);
  const onCell = useCallback(
    (x: number, z: number, level: number) => setCell({ x, z, level }),
    []
  );
  const nearPallets = useMemo(
    () =>
      cell && pallets
        ? pallets.filter(
            (q) =>
              q.level === cell.level &&
              Math.abs(q.x - cell.x) <= 1 &&
              Math.abs(q.z - cell.z) <= 1
          )
        : [],
    [cell, pallets]
  );
  const sendBack = async (q: Pallet) => {
    setBusy(true);
    try {
      const r = await service.build({
        op: 'return',
        pallet: { kind: q.kind, x: q.x, z: q.z, level: q.level },
      });
      setView(r.view);
      if (!r.ok) setNotice(r.reason);
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : 'The pallet would not budge. Try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  // ---- Your plot: claim it, travel to it, buy land ----
  const [plotBusy, setPlotBusy] = useState(false);
  const goToPlot = (b: Block) =>
    // Land on the plot's corner cell, beside where the first building goes.
    requestTeleport(48 * b.bx - 16.5, 48 * b.bz - 16.5);
  const plotOp = async (
    op: { op: 'claim' } | { op: 'buy' },
    after?: (v: GameView) => void
  ) => {
    setPlotBusy(true);
    try {
      const r = await service.plot(op);
      setView(r.view);
      if (!r.ok) setNotice(r.reason);
      else after?.(r.view);
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : 'The city office is closed. Try again.'
      );
    } finally {
      setPlotBusy(false);
    }
  };
  const claimPlot = () =>
    plotOp({ op: 'claim' }, (v) => {
      const mine = v.plots.find((p) => p.owner === (v.username ?? 'you'));
      if (mine) {
        goToPlot(mine.block);
        setCheer(
          `🏠 Welcome to your plot on block ${blockKey(mine.block)}! Start with the brick cottage.`
        );
      }
    });
  const buyLand = () =>
    plotOp({ op: 'buy' }, () =>
      setCheer('🧾 Land bought and the pads are poured. Build away!')
    );

  useEffect(() => {
    if (!cheer) return;
    const t = setTimeout(() => setCheer(null), 6000);
    return () => clearTimeout(t);
  }, [cheer]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  // ---- Site work: demolish neighbors to grow the site, or pour pads ----
  const [siteMode, setSiteMode] = useState(false);
  const [tool, setTool] = useState<SiteWork>('demolish');
  const [picked, setPicked] = useState<{ x: number; z: number } | null>(null);
  const [fx, setFx] = useState<SiteFx | null>(null);
  const [siteBusy, setSiteBusy] = useState(false);
  const [siteError, setSiteError] = useState<string | null>(null);
  const site = view?.tower.site;
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

  useKeyboard(!siteMode);

  // ---- Loading and refreshing ----
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

  // Quietly refresh so other builders' work appears. Skipped while an action
  // is in flight or the tab is hidden; a failed refresh keeps the last view.
  useEffect(() => {
    const t = setInterval(() => {
      if (busy || siteBusy || document.visibilityState !== 'visible') return;
      service.load().then(setView, () => {});
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [service, busy, siteBusy]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

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

  if (!HAS_WEBGL) {
    return (
      <Centered>
        <div className="text-6xl">🖥️</div>
        <p className="mt-2 text-xl font-bold text-white text-outline-sm">
          Skyshift needs 3D graphics (WebGL), and this browser doesn&apos;t have
          it turned on.
        </p>
      </Centered>
    );
  }

  const { challenge, tower } = view;
  const endsIn = formatLeft(roundEndsAt(view.dateKey) - now);
  const latest = tower.recent[0];

  // Standing on your own block shows your plot's card; anywhere else, today's build.
  const onMyPlot =
    !!myPlot &&
    !!cell &&
    blockOf(cell.x) === myPlot.block.bx &&
    blockOf(cell.z) === myPlot.block.bz;

  return (
    <div
      ref={root}
      className="relative h-full overflow-hidden"
      style={{ background: challenge.theme.sky[1] }}
    >
      <div className="absolute inset-0 z-0">
        <Suspense fallback={null}>
          <City3D
            tower={world ?? tower}
            challenge={challenge}
            insetTop={insets.top}
            insetBottom={insets.bottom}
            kind={kind}
            material={material}
            onAim={onAim}
            plan={plan}
            build={
              siteMode
                ? null
                : inCrane
                  ? {
                      level: drop?.spec?.level ?? 0,
                      ghost: null,
                      drop: drop?.spec
                        ? { spec: drop.spec, ok: !drop.reason }
                        : null,
                    }
                  : aim && {
                      level: aim.level,
                      ghost: { spec: aim.spec, state: aim.state },
                    }
            }
            inCrane={inCrane}
            onCraneAim={setCraneAim}
            onNearCrane={setNearCrane}
            onCell={onCell}
            siteMode={siteMode}
            tool={tool}
            candidates={candidates}
            selected={selectedTile}
            fx={fx}
            onPickTile={pickTile}
          />
        </Suspense>
      </div>
      <div className="pointer-events-none relative z-10 mx-auto flex h-full max-w-[480px] flex-col gap-2 px-3 pb-3 pt-2.5">
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
          <div className="pointer-events-auto flex items-center gap-1.5">
            <button
              className="btn3d btn-red px-3 py-1 text-[12px] font-bold"
              onClick={() => {
                // Site work edits today's build: hop there first if the worker is away.
                const away =
                  !cell ||
                  Math.max(
                    Math.abs(cellTile(cell.x)),
                    Math.abs(cellTile(cell.z))
                  ) > SITE_REACH;
                if (away) requestTeleport(0, 3);
                setSiteMode(true);
                setSiteError(null);
              }}
            >
              🏗️ Site work
            </button>
            <span
              className="chip px-2 py-0.5 text-[12px] font-bold"
              title="Coins"
            >
              🪙 {coins}
            </span>
            <button
              className="btn3d btn-yellow px-2.5 py-1 text-[12px] font-bold"
              disabled={plotBusy}
              onClick={myPlot ? () => goToPlot(myPlot.block) : claimPlot}
            >
              {myPlot ? '🏠 My plot' : '🏠 Get a plot'}
            </button>
            <button
              className="btn3d btn-cream px-2.5 py-1 text-[12px] font-bold"
              onClick={() => requestTeleport(0, 3)}
            >
              📋 Today
            </button>
            {LOCAL_DEMO && backend.kind === 'local' && (
              <>
                <button
                  className="btn3d btn-cream ml-auto px-2 py-0.5 text-[11px] font-bold"
                  title="Dev tool: copy everything built here as blueprint pieces"
                  onClick={() => {
                    const text = blueprintJson(tower.pieces);
                    navigator.clipboard.writeText(text).then(
                      () =>
                        setCheer(
                          `📋 Copied ${tower.pieces.length} pieces as a blueprint`
                        ),
                      () => setNotice('Copy failed: clipboard not available.')
                    );
                  }}
                >
                  📋 copy blueprint
                </button>
                <button
                  className="btn3d btn-cream px-2 py-0.5 text-[11px] font-bold"
                  onClick={() => setView(backend.service.reset())}
                >
                  reset day
                </button>
              </>
            )}
          </div>
        )}

        {!siteMode && onMyPlot && myPlot ? (
          <div className="pointer-events-auto">
            <PlotCard
              plot={myPlot}
              progress={plotProgress}
              coins={coins}
              busy={plotBusy}
              onBuy={buyLand}
            />
          </div>
        ) : (
          !siteMode &&
          daily &&
          progress && (
            <div className="pointer-events-auto">
              <PlanCard blueprint={daily} progress={progress} />
            </div>
          )
        )}

        {/* The open gap: touches here go through to the 3D camera. */}
        <div ref={gap} className="relative min-h-[150px] flex-1">
          {latest && <Ticker c={latest} now={now} />}
          {cheer && (
            <div className="pop-in absolute inset-x-0 top-10 z-10 flex justify-center">
              <p className="rounded-xl border-2 border-[#1f7a35] bg-[#dcffe4] px-3 py-2 text-[14px] font-bold text-[#1f7a35] shadow">
                {cheer}
              </p>
            </div>
          )}
          {notice && (
            <div className="pop-in absolute inset-x-0 bottom-1 z-10 flex justify-center">
              <p className="rounded-xl bg-[#ffe1dc] px-3 py-2 text-[13px] font-semibold text-[#a1281b] shadow">
                {notice}
              </p>
            </div>
          )}
        </div>

        {siteMode ? (
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
        ) : (
          <div className="pointer-events-auto">
            {inCrane ? (
              <CraneHud
                load={hookLoad}
                choice={craneChoice}
                setChoice={setCraneChoice}
                atStack={craneAim?.atStack ?? false}
                drop={drop}
                busy={busy}
                onPickUp={pickUp}
                onRelease={release}
                onPutBack={putBack}
                onToStack={flyToStack}
                onToLastDrop={hasLastDrop() ? flyToLastDrop : null}
                onExit={() => setInCrane(false)}
              />
            ) : (
              <WorkerHud
                kind={kind}
                setKind={setKind}
                material={material}
                setMaterial={setMaterial}
                steelLeft={steelLeft}
                planNote={planNote}
                aim={aim}
                busy={busy}
                onAct={act}
                nearCrane={nearCrane}
                nearPallets={nearPallets}
                onReturn={sendBack}
                onEnterCrane={() => setInCrane(true)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Dev tool: the site's pieces as blueprint data, shifted so the build starts
 * at cell (0, 0), in the order they were placed (which is a buildable order).
 */
const blueprintJson = (pieces: readonly PieceSpec[]): string => {
  const x0 = Math.min(...pieces.map((p) => p.x), 0);
  const z0 = Math.min(...pieces.map((p) => p.z), 0);
  return JSON.stringify(
    pieces.map(({ kind, x, z, level, dir, material }) => ({
      kind,
      x: x - x0,
      z: z - z0,
      level,
      dir,
      material,
    }))
  );
};

const KIND_ICON: Record<ContributionKind, string> = {
  build: '🏗️',
  reinforce: '🔩',
  decorate: '🌸',
  demolish: '💥',
  prepare: '🧱',
  place: '🏗️',
  remove: '🗑',
  deliver: '🏗️',
  return: '↩',
};

/** The latest piece of work on the site, as a speech bubble. */
const Ticker = ({ c, now }: { c: Contribution; now: number }) => (
  <div
    key={`${c.user}-${c.at}`}
    className="pop-in absolute left-0 top-0 z-10 max-w-[85%]"
  >
    <div className="chip truncate px-3 py-1 text-[11px] font-semibold">
      {KIND_ICON[c.kind]} <b>u/{c.user}</b> {c.summary}{' '}
      <span className="text-[#9a8466]">· {ago(c.at, now)}</span>
    </div>
  </div>
);

/** City block of a grid cell index (blocks are 4 tiles = 16 cells apart). */
const blockOf = (c: number) => Math.round(cellTile(c) / 4);

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
