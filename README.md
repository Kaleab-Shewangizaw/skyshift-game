# Skyshift

A cozy, asynchronous community building game for Reddit interactive posts (Devvit Web).
Everyone in a post builds one small skyscraper together each day. Each player takes
one **shift**: Build a floor, Reinforce a weak floor, or Decorate. At the end of the
UTC day the tower is tested and the community gets a result card.

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

## Rules (v1)

- **Height**: sum of floor heights (material dependent, 2–4 m).
- **Stability**: every floor has a *sturdiness* (material + condition modifier + braces)
  and a *need* = `1 + floor(floorsAbove / 3)` (+ wind on the upper half on windy days).
  Stability = Σ min(sturdiness, need) / Σ need. Weak floors show a crack and a ⚠ marker.
- **Reinforce** braces the floor with the smallest margin (max 3 braces per floor).
- **Style**: material style + decorations (+3 if the decoration matches the day's theme)
  + 2 per extra distinct material.
- **Result**: one star each for meeting the height, stability, and style targets.
- **Crew (cooperation)**: when you confirm a shift you leave a request for the next
  builder (build / brace / decorate). Answering the open request is a *teamwork* shift
  and extends the crew chain; ignoring it just resets the chain. Every shift adds Crew
  Spirit (+1, +1 for teamwork, +1 more while the chain is 3+). Spirit milestones unlock
  tower-wide perks for the day: 🧺 picnic at 5 (+4 style), 🛟 scaffolding at 12 (+1
  sturdiness on every floor), 🗼 golden spire at 22 (+6 m, +4 style).

## Decisions

- **Day boundary is UTC midnight** (`utcDateKey`, `roundEndsAt` in `src/shared/challenge.ts`).
  Every player shares one round regardless of timezone. The server's clock decides
  which day an action belongs to.
- **Challenge seed = date only.** All Skyshift posts on a given day share the same site,
  condition, materials, and targets. **Tower state is keyed by post + date.**
- **Variety**: themes (8) and conditions (6) are drawn from a seeded shuffle per cycle,
  so each appears once per cycle and nothing repeats on consecutive days.
- **One shift per user per day.**
- Rules are pure functions in `src/shared/rules.ts`. The client uses them to preview and
  explain an action before confirming; the server will use the same functions as the
  authority.

## Server state (stage 2)

- `GET /api/state`: today's tower for this post plus the viewer's own shift.
- `POST /api/shift` `{ dateKey, action }`: the server takes the day from its own clock,
  the user from `context.userId`, and the post from `context.postId`. The action shape is
  validated (`src/shared/validate.ts`) and applied with the shared rules engine.
- `POST /api/site` `{ dateKey, work, x, z }`: unlimited site work, not a shift. `demolish`
  clears a city tile touching the site (the site grows, up to 30 tiles); `prepare` levels a
  site tile into a buildable foundation pad. Only the tower key is watched.
- Redis: `tower:{postId}:{dateKey}` (JSON) and `shifts:{postId}:{dateKey}` (hash userId → shift),
  both expiring after 14 days. Writes use WATCH → read → `applyAction` → MULTI/EXEC with
  retries; the shift record is written in the same transaction, so one shift per user per day
  holds even under parallel requests.
- **Offline UI dev**: `VITE_LOCAL_DEMO=1 npm run build` swaps in the localStorage service and
  the "Local demo" bar (neighbor shift / reset). Normal builds never include it.
