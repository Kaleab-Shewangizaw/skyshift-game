# Skyshift

A small open-world construction game for Reddit interactive posts (Devvit Web).
Everyone in a post works on one shared building site each UTC day. You play a
construction worker in third person: walk the site, dig footings, put up columns,
beams, floor slabs and walls (brick, stone, glass, timber), and climb what you build.
Climb into the tower crane to lift steel into place. The bulldozer is next (see
`docs/VISION-3D.md`).

## Today's build

Every UTC day the post gets one **blueprint** (a cottage, a glass pavilion, a two-storey
house, a braced watchtower...), picked by date from `src/shared/blueprints.ts`. The pieces
still to build glow as a see-through blue plan, the card at the top shows progress, and the
info line tells you when the spot you aim at is "✓ on the plan" (or which material the plan
wants). The day's site starts with pads already poured under the blueprint. In local play
mode, **📋 copy blueprint** copies whatever is built as blueprint data, for authoring levels.

## Your plot (progression)

Tap **🏠 Get a plot** to claim a city block (3 × 3 tiles; 24 per post, nearest first) in
the post's shared city. You start with one tile and work through levels, each a blueprint
on your land: brick cottage → glass pavilion → stone house → braced watchtower → iron
lattice tower (Eiffel-style). Finishing a level pays a bonus and the building is rented
out: it earns coins every hour, even while you're away. Each piece you add to today's
blueprint pays 🪙 3. Bigger levels need more land: **Buy a tile** on your plot card.
**🏠 My plot** and **📋 Today** jump between your plot and today's build. Everyone sees
everyone's plots. Rules: `src/shared/plots.ts` (a test plays the whole campaign).

## Playing together

- **Helping:** on anyone's plot you can add pieces from *their* plan (the blue outline):
  🪙 3 per piece for you, and if you place the last piece the owner still gets the level
  bonus. You can take back your own pieces; nobody can change the owner's build.
- **Live:** other players' workers (blue vests, name tags) walk around in real time, and
  every change anyone makes shows up within a couple of seconds (Devvit realtime: the
  server relays `POST /api/presence` and announces changes on the post's channel).
- **Skyline:** every finished daily build becomes a monument on a stone plinth in a ring
  around the city (the 8 most recent).

## Controls

- **Walk**: on-screen joystick, or WASD / arrow keys. **Jump**: ⤒ button or Space.
- **Look around**: drag the screen; pinch or scroll to zoom.
- **Build**: pick a piece in the hotbar; the ghost in front of the worker shows where it
  goes (green = fits, red = not allowed, with the reason). Press **Place**. Aim at your own
  piece and the button becomes **Take down**.
- **Stairs**: place 🪜 Stairs in a cell (they climb the way you face) and walk up to the
  next floor. Leave the cell above open as the stairwell. Climbing columns still works too.
- **Crane**: walk to the foot of the crane and tap **Enter crane**. The joystick (or WASD)
  turns the jib and runs the hook in and out; hold ▲ ▼ (or R / F) to raise and lower it.
  Choose a load (24 beams, 16 columns, or a mix of 16 beams + 8 columns), swing the hook
  over the steel stack beside the crane (or tap **🧭 To stack**), **Pick up**, swing it over
  the building (or **🎯 Last drop**) and **Drop** it: it lands on the highest floor slab
  under the hook, and the crane heads back to the stack by itself.
  Too much steel up there? Walk up beside the pallet and tap **↩ Send back**.
- **Site work** (top left): demolish neighboring tiles to grow the site, and pour
  foundation pads where you want to build.

## Stack

Scaffolded from the official `reddit/devvit-template-react` (Devvit 0.15.4):
React 19 + Tailwind 4 + Vite (client), Hono on the Devvit Node server, Redis via
`@devvit/web/server`.

```
src/shared/   rules engine, daily challenge, content (used by client AND server)
src/client/   splash.html (inline feed view), game.html (expanded game)
src/server/   Hono app: /api/* for the client, /internal/* for menu/triggers
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | `devvit playtest`: builds and runs on a test subreddit (needs `npm run login`) |
| `npm run play` | Standalone browser mode at http://localhost:5173/game.html: the real game with hot reload, localStorage backend and Local demo bar, no Reddit needed |
| `npm run build` | Vite build of client + server into `dist/` |
| `npm run test:unit` | Node test runner over `src/**/*.test.ts` (rules + challenge) |
| `npm run test:types` | `tsc --build` |
| `npm run lint` | ESLint |
| `npm run deploy` | type-check, lint, `devvit upload` |

## Building rules

- The site has a 3 m grid (4×4 cells per 12 m tile) and 4 m storeys. Only poured pads
  are buildable; the center tile starts with one.
- **Steel**: on floors 1 and 2 the worker carries beams and columns by hand. From floor 3
  up, each beam or column uses one from a crane-delivered pallet on that floor; the HUD shows
  how many are left.
- **Footing** (ground floor only) → **Column** on a corner next to a footing, or on any
  slab, beam, wall or column below → **Beam** on a column or wall, or bolted end to end
  onto another beam (a line of beams must touch a column or wall somewhere) → **Slab** with two supported sides (beams, walls or neighboring slabs; the group must rest on a beam or wall somewhere) →
  **Wall** on the ground, or on a beam or slab below.
- **Landmark pieces**: 📐 **Leaning column** (tilts one cell, diagonals too, over one floor;
  stack them for tapering legs), ❎ **Cross brace** and 🌉 **Arch** (on an edge, between
  uprights at both ends), 🗼 **Spire** (two storeys tall, on a corner). Up to 48 floors.
- You can take down your own pieces when nothing rests on them. Building is unlimited.
- Rules are pure functions in `src/shared/structure.ts`, shared by client and server.
  Weights and capacities are defined there already for the structural rules (stage 3).

## Decisions

- **Day boundary is UTC midnight** (`utcDateKey`, `roundEndsAt` in `src/shared/challenge.ts`).
  Every player shares one round regardless of timezone. The server's clock decides
  which day an action belongs to.
- **Challenge seed = date only.** All Skyshift posts on a given day share the same site,
  condition, materials, and targets. **Tower state is keyed by post + date.**
- **Variety**: themes (8) and conditions (6) are drawn from a seeded shuffle per cycle,
  so each appears once per cycle and nothing repeats on consecutive days.
- **No play limit.** Site work and building are unlimited.

## Server state

- `GET /api/state`: today's site for this post (`TowerState`: site, pads, pieces, feed).
- `POST /api/site` `{ dateKey, work, x, z }`: `demolish` clears a city tile touching the
  site (the site grows, up to 30 tiles); `prepare` levels a site tile into a buildable pad.
- `POST /api/build` `{ dateKey, op: 'place', piece }` or `{ dateKey, op: 'remove', slot }`.
- `POST /api/plot` `{ op: 'claim' | 'buy' }`, `{ op: 'place', piece }`, `{ op: 'remove', slot }`.
- `POST /api/presence` `{ x, y, z, h, crane }`: relayed to the post's realtime channel.
- Redis `skyline:{postId}` (hash dateKey → finished daily build).
- Redis (no expiry, the city persists): `plots:{postId}` (hash userId → plot JSON) and
  `coins:{postId}` (hash userId → coins). Rent is paid out on `GET /api/state`.
- The server takes the day from its own clock, the user from `context.userId` and the post
  from `context.postId`. Bodies are validated in `src/shared/validate.ts` and applied with
  the shared rules.
- Redis: `tower:{postId}:{dateKey}` (JSON), expiring after 14 days. Writes use
  WATCH → read → apply → MULTI/EXEC with retries.
- **Offline UI dev**: `npm run play` (or `VITE_LOCAL_DEMO=1`) swaps in the localStorage
  service and a "reset day" button. Normal builds never include it.
