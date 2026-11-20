# Skyshift

A small open-world construction game for Reddit interactive posts (Devvit Web).
Everyone in a post works on one shared building site each UTC day. You play a
construction worker in third person: walk the site, dig footings, put up columns,
beams, floor slabs and walls (brick, stone, glass, timber), and climb what you build.
Climb into the tower crane to lift steel into place. The bulldozer is next (see
`docs/VISION-3D.md`).

## Controls

- **Walk**: on-screen joystick, or WASD / arrow keys. **Jump**: ⤒ button or Space.
- **Look around**: drag the screen; pinch or scroll to zoom.
- **Build**: pick a piece in the hotbar; the ghost in front of the worker shows where it
  goes (green = fits, red = not allowed, with the reason). Press **Place**. Aim at your own
  piece and the button becomes **Take down**.
- **Climb**: walk into a column to climb it; step off onto a slab at the top.
- **Crane**: walk to the foot of the crane and tap **Enter crane**. The joystick (or WASD)
  turns the jib and runs the hook in and out; hold ▲ ▼ (or R / F) to raise and lower it.
  Choose Beam or Column, lower the hook onto the steel stack beside the crane, **Pick up**,
  swing it over the building and **Release** when the ghost turns green.
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

- The site has a 3 m grid (4×4 cells per 12 m tile) and 3 m storeys. Only poured pads
  are buildable; the center tile starts with one.
- **By hand**: footings, ground-floor columns, slabs and walls. **By crane only**: steel
  beams, and columns above the ground floor.
- **Footing** (ground floor only) → **Column** on a corner next to a footing, or on a
  column below → **Beam** with a column at one end → **Slab** with beams on two sides →
  **Wall** on the ground, or on a beam or slab below.
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
- The server takes the day from its own clock, the user from `context.userId` and the post
  from `context.postId`. Bodies are validated in `src/shared/validate.ts` and applied with
  the shared rules.
- Redis: `tower:{postId}:{dateKey}` (JSON), expiring after 14 days. Writes use
  WATCH → read → apply → MULTI/EXEC with retries.
- **Offline UI dev**: `npm run play` (or `VITE_LOCAL_DEMO=1`) swaps in the localStorage
  service and a "reset day" button. Normal builds never include it.
