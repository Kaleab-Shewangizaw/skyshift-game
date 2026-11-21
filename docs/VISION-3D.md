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

### Update 2026-11-20: play as a worker

- **A character you control, third person** (like a small GTA): walk the site, build by
  hand, climb what you build. The camera follows behind the worker.
- **Three ways to work:**
  1. **On foot (engineer / bricklayer):** footings, walls (brick, stone, glass, timber),
     floor slabs, bolting beams, glazing. Anything done by hand.
  2. **Crane operator:** walk to the crane, climb in, slew the jib, move the trolley,
     lower the hook, pick up beams and heavy pieces and set them in place up high.
  3. ~~Bulldozer driver~~: dropped 2026-11-21 (switching vehicles wastes players' time);
     demolishing stays in the Site work menu.
- **Ambition:** players should be able to build famous-landmark-style structures (an
  Eiffel-like lattice tower, a Burj-like supertall...), not only boxes. That needs, later:
  many more storeys, diagonal braces / lattice members, setbacks and tapering, and a
  spire / antenna piece. The grid model (cells, corners, edges per storey) is chosen so
  these can be added as new piece kinds.
- **The old floor-stacking shift game is retired** (decided 2026-11-20). Daily scoring
  comes back as the end-of-day load test.

### Update 2026-11-21: blueprints, levels and a shared city

- **Landmarks need new pieces, not a new grid:** leaning columns (one storey up, one cell
  in), diagonal braces, arches, spires, and a much higher floor limit. Enough to build an
  Eiffel-like lattice tower or a Burj-like stepped supertall on the existing grid.
- **Blueprints:** every goal is a ghost blueprint made of our pieces; players fill it in
  and see a progress %. A dev-only "save as blueprint" tool is used to author them in-game.
- **Two layers (decided by the designer):**
  1. **Daily community challenge (the headline, what a new player sees first):** one
     blueprint per UTC day for the whole post, generated from the level system with a
     date seed, built together, reset daily. Every finished daily build joins the shared
     city skyline.
  2. **Progression (long-term layer):** in the post's **shared city**, each player owns
     plots with their own level, coins and blueprint. Levels run from a small house up
     to landmarks (Eiffel-style around level 12, Burj-style later). Finished buildings earn
     rent from NPC tenants; rent buys land and more cranes. Anyone can help on anyone's
     plot (and share the rent).

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
2. ✅ **Freeform grid building** (rules done 2026-11-20, `src/shared/structure.ts`):
   3 m grid on the pads, 3 m storeys; footing, column, beam, slab, wall (4 materials);
   support rules; remove your own pieces. `POST /api/build`.
   ✅ **Worker on foot** (done 2026-11-20, `src/client/three/Player.tsx`, `physics.ts`):
   third-person worker, joystick / WASD, jump, collisions, climb columns, build the piece
   in front of you with a live ghost.
3. ✅ **Crane operator** (done 2026-11-20, `game/crane.ts`, `three/CraneOperator.tsx`,
   `components/CraneHud.tsx`): enter at the mast; joystick slews and runs the trolley, ▲▼
   hoist; pick a beam or column off the steel stack and release it into the nearest slot.
   Reworked 2026-11-20 (designer's idea): the crane does logistics, the worker builds.
   Floors 1–2: steel by hand. Floor 3+: the crane drops a load (24 beams, 16 columns, or
   16 + 8 mixed; 2026-11-21) onto the highest slab under the hook, with 🧭/🎯 autopilot to
   the stack and back to the last drop; each beam or column on that floor uses one
   (`TowerState.pallets`, `POST /api/build` op `deliver`). Faster crane, generous pick-up.
   ✅ **Stairs** piece: fills a cell, climbs the way the worker faces, needs an open
   stairwell above; physics are 7 step blocks.
4. ~~Bulldozer~~ (dropped 2026-11-21).
5. **Structural rules.** Weight and capacity per piece; load flows down through supports.
   Unsupported pieces fall, overloaded ones crack, glass shatters. Fall/shatter animations.
6. ✅ **Landmark pieces** (done 2026-11-21): leaning columns (8 directions), cross braces,
   arches, spires; 48 storeys and 2,500 pieces. Lean/brace/arch use pallet steel above
   floor 2.
   ✅ **Blueprints + daily challenge** (done 2026-11-21, `src/shared/blueprints.ts`):
   generator blueprints (cottage, pavilion, house, watchtower), date-seeded daily pick,
   see-through plan, progress card, completion cheer, pads pre-poured, dev copy tool;
   a test builds every blueprint under the rules. Still to do: finished dailies joining
   the skyline (with plots, step 3).
   ✅ **Plots, levels and rent** (done 2026-11-21, `src/shared/plots.ts`, `server/core/plots.ts`):
   one block per player (24 per post), 5 levels from cottage to an Eiffel-style lattice
   tower, completion bonus + hourly rent, land bought tile by tile, 🪙 3 per daily-plan
   piece, travel buttons. Plots carry steel by hand at any height (a plot crane is later).
7. **Market and stockpile, live presence** (other workers appear via realtime).
8. **Day test and result card**, then **submission polish** (splash, onboarding, mobile QA).

**Cut order if time runs short:** live presence → market budget (free stock) →
landmark pieces beyond braces.

## Decisions (2026-11-19)

- **No play limit.** Players build as much as they like. Co-op comes from splitting
  jobs and from the scale of the daily brief, not from a per-day cap.
- **Shared site plus live view.** Everyone works on the same site whenever they visit;
  other players' workers and new pieces appear live through server broadcast.
  No real-time joint control.
- **New building each UTC day**, with a daily brief, an end-of-day load test and a
  result card.
