# Skyshift 3D: vision and plan

Captured 2026-11-19. Hackathon deadline: 2026-12-08 (about 19 days, solo, part-time).
This document replaces the "pick 1 of 3 daily options" design with a hands-on
3D construction game. The current 2D build stays playable until each 3D stage replaces it.

## The vision (from the designer)

- **3D city construction site.** The tower stands on a lot in a 3D city, not a flat sky scene.
- **Freeform building.** Players decide the design. Example: a 4-floor building that is
  H-shaped seen from above. The footprint and shape change with what builders choose.
  Players dig foundations, lay beams, place stone, brick and glass.
- **Materials have weight and strength.** Things fall if they are not held correctly.
  Glass in a beam frame shatters once it carries too much load. Stone and brick each
  have their own weight.
- **Workers you control.** Each player is a person on the site. With several players,
  one lays bricks, another prepares beams, another runs the crane.
  A solo player does every job: climbs the crane to lift materials up to the
  building, climbs down to prepare beams, and so on.
- **Crane.** Climb it and control it to pull materials up and place them.
- **Market and stockpile.** Order materials from the market; they are delivered and
  stacked on site, then used from the stack.

## Constraints that shape the plan

- **Platform:** Devvit Web posts run in an iframe on reddit.com, mostly on phones.
  3D must stay light (one small scene, low-poly, instancing) and load fast.
- **Realtime:** Devvit realtime is server → client broadcast only. Clients send actions
  over HTTP and the server broadcasts results. Good for live presence and seeing others'
  placements, too slow for twitch-style shared avatar control.
- **Physics:** a full rigid-body simulation is non-deterministic, heavy on mobile and
  cannot be validated by the server. Plan: **rule-based structural physics** (a support
  graph with weight and capacity per piece). It is deterministic, shared by client and
  server like today's rules engine, and animated with falling and shattering effects.
- **Scope:** the full vision is more than 19 part-time days. Build in stages that each
  leave a playable game, and cut from the end.

## Stages

Each stage ends playable in `npm run play` and on Reddit.

1. ✅ **3D city scene** (done 2026-11-19, `src/client/three/`). three.js via react-three-fiber. City block around the lot, orbit
   and zoom camera that works with touch, crane, current tower rendered in 3D.
   ✅ **Site expansion** (done 2026-11-19): the city is a 12 m tile grid (`src/shared/city.ts`).
   Players demolish buildings, roads and parks touching the site (unlimited, not a shift,
   capped at 30 tiles); cleared tiles become fenced site, left as rubble.
   ✅ **Buildable pads** (done 2026-11-20): players pick site tiles to level and pour a
   foundation pad on (unlimited, not a shift). Only pads will be buildable in Stage 2; the
   tower's center tile starts with one. `TowerState.pads`. Both kinds of site work go through
   `POST /api/site` with `work: 'demolish' | 'prepare'`.
2. **Freeform grid building.** A build grid over the lot (for example 8×8 cells × N
   levels). Piece types: foundation (dig), column, beam, floor slab, wall
   (brick / stone / glass / timber). Players shape the footprint (H, L, ring...).
   Server-authoritative placement, stored per post + day.
3. **Structural rules.** Each piece has a weight and a capacity. Load flows down through
   supports to the foundation. Unsupported pieces fall; overloaded pieces crack, and glass
   shatters. Previews show the risk before placing. Fall and shatter animations.
4. **Market and stockpile.** Order materials with a daily budget; deliveries stack on
   site; placing a piece uses stock. Teamwork: one player's order feeds everyone.
5. **Workers and crane.** Tap-to-move worker avatars. Materials must be lifted by the
   crane to upper levels; jobs (crane operator, beam prep, bricklayer). A solo player
   switches jobs. Other players' workers appear live via realtime presence.
6. **Day test and result card.** The end-of-day load test runs the structural rules
   (with a shake animation), then a shareable result card.
7. **Submission polish.** Splash with a live 3D preview, onboarding, mobile QA, write-up.

**Cut order if time runs short:** live presence → worker walking (keep job switching) →
crane step (direct placement) → market budget (free stock).

## Decisions (2026-11-19)

- **No play limit.** Players build as much as they like. Co-op comes from splitting
  jobs and from the scale of the daily brief, not from a per-day cap.
- **Shared site plus live view.** Everyone works on the same site whenever they visit;
  other players' workers and new pieces appear live through server broadcast.
  No real-time joint control.
- **New building each UTC day**, with a daily brief, an end-of-day load test and a
  result card.
