# Dark Council Tactic

1v1 tactical combat game for Vibe Jam 2026. PixiJS v8 client + Node `ws` server, TypeScript strict, server-authoritative.

Design doc: [`SPEC.md`](./SPEC.md) (engineering source of truth). Art brief: [`ART_SPEC.md`](./ART_SPEC.md).

## Requirements

- Node.js 20+ (dev machine currently on 24)
- npm (no yarn, no pnpm, no bun — see SPEC §5)

## Setup

```bash
npm install
```

First time only: install Playwright browsers for smoke tests.

```bash
npx playwright install chromium
```

## Run

```bash
npm run dev           # client on :3000 + server on :8080 in parallel
npm run dev:client    # vite only
npm run dev:server    # tsx watch on the server only
```

Open http://localhost:3000 in two tabs. Open DevTools — you should see `hello from server` in the console.

## CI gates (must pass before merge)

```bash
npm run typecheck     # tsc --noEmit, strict settings
npm run test:unit     # vitest, pure logic in src/shared + src/server
npm run test:smoke    # playwright, boots real server and walks the loop
```

## Lint / format

```bash
npm run lint          # eslint src/ tests/
npm run format        # prettier write
```

## Build

```bash
npm run build         # tsc -p tsconfig.server.json && vite build
npm run start         # node dist/server/server/index.js  — serves SPA + WS on :8080
```

## Deploy

One Node process serves both the Vite-built SPA and the WS upgrade on the same port, so any container host works.

```bash
docker build -t dct .
docker run -p 8080:8080 dct
# → http://localhost:8080
```

Environment variables:
- `PORT` — bind port (default `8080`)
- `DCT_TOURNAMENT_SIZE` — match count per tournament (default `8`)
- `DCT_BOT_FILL_WAIT_MS` — lobby wait before bot backfill (default `15000`)
- `DCT_TURN_TIMER_MS` — seconds per turn (default `30000`)
- `DCT_FORCE_ARENA` — pin one arena for testing (default: random)
- `DCT_SERVE_STATIC` — set to `0` to skip the SPA static handler (dev uses this; Vite serves on :3000)

## Branching

`kai/m<N>-<slug>` per small feature, PR to `main`, no direct commits, no force-push, no `--no-verify`. See SPEC §25 for the full workflow rules.
