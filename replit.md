# Galactic

An immersive 3D website (galactic.dad) that visualizes the lifetime scientific work of any researcher as an explorable galaxy — research domains as suns, papers as orbiting planets, co-authors as moons. Originally built as a Father's Day gift for Dr. Mahendra S. Rao, it is now a reusable, open-source template: point it at any scientist (a dad, a mom, a mentor, yourself) and regenerate the data snapshot. The app ships with **no hardcoded identity** — everything the UI shows comes from the generated snapshot. (Internal package/slug remains `galaxy`.)

## Make it for your own scientist

1. Regenerate the snapshot for the person you want (by name or OpenAlex author ID):
   - `pnpm --filter @workspace/galaxy run fetch:galaxy -- --name "Ada Lovelace" > artifacts/galaxy/src/data/galaxyData.json`
   - or `... -- --id A5111365293 > artifacts/galaxy/src/data/galaxyData.json`
   - Tip: name search prints the top OpenAlex matches to stderr; if it picks the wrong person, re-run with the correct `--id`.
2. That's it — restart the `galaxy` workflow. The title, stats, domains, papers, and co-authors all redraw from the new snapshot.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Optional env: `GITHUB_REPO` — `owner/repo` for the footer star count (default `heyinterspace/galactic`)

## Realtime presence (api-server)

- `api-server` hosts an ephemeral multiplayer presence layer: a WebSocket at `/api/presence` (`src/presence/server.ts`) streams each visitor's camera position so others see faint "wisps" and a live headcount ("N galacticons streaming now"). Nothing is persisted — anonymous, in-memory only.
- It also serves `/api/github/stars` (`src/routes/github.ts`), a 5-min TTL in-memory cache of the repo star count, so upstream GitHub is hit at most once per TTL regardless of traffic.
- **Abuse/DDoS guards** (tune in `src/presence/server.ts`): total + per-IP connection caps, handshake-rate limit, 256-byte `maxPayload`, per-socket token bucket, heartbeat reaping, coordinate clamping, and a 10 Hz shared-snapshot broadcast capped at 60 render peers. REST has a 120 req/min/IP limiter (`app.ts`); `trust proxy` is set to `1` for the single Replit proxy hop.
- **Deployment:** because presence needs a long-lived process, `api-server` must run as an always-on (Reserved VM) deployment, not a static/scale-to-zero one. The galaxy itself is still static and works without it.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/galaxy/` — the Galaxy web app (React + Vite + React Three Fiber). Served at `/`.
- `artifacts/galaxy/src/data/galaxyData.json` — the baked-in data snapshot (source of truth for the visualization).
- `artifacts/galaxy/src/data/galaxy.ts` — typed accessors over the snapshot.
- `artifacts/galaxy/scripts/fetch-galaxy.mjs` — one-time script that regenerates the snapshot from OpenAlex.

## Architecture decisions

- Data comes from **OpenAlex** (free, no API key), not Google Scholar (which has no public API).
- The full dataset is **fetched once at build time and baked into a static JSON file** — no backend, no database, no runtime calls for the core visualization. Keeps the gift fast and reliable.
- **Realtime presence + GitHub stars** are an *optional* enhancement served by the always-on `api-server`, not the static galaxy bundle. The galaxy degrades gracefully: if `/api/presence` is unreachable no wisps/headcount appear, and if `/api/github/stars` fails the footer button still links to the repo. The core galaxy never depends on the server being up.
- Research domains ("suns") are derived automatically from OpenAlex's topic hierarchy at the subfield level, with long-tail subfields collapsed into a "Cross-Disciplinary" sun (target ~6–12 suns).
- 3D rendering via React Three Fiber + drei + postprocessing.

## Product

- A single immersive 3D page: research domains are suns, papers are orbiting planets (size = citations, orbit distance = topic relevance), co-authors are moons.
- Two navigation modes: a spaceship fly-through and a god/planetarium orbit view with adjustable axis.
- Click planets/suns for paper and domain details; a stats layer summarizes the whole corpus.
- To regenerate the data snapshot for a different scientist, see "Make it for your own scientist" at the top of this file. The script takes `--name "Full Name"` or `--id <OpenAlexAuthorId>` (or `GALAXY_AUTHOR_NAME` / `GALAXY_AUTHOR_ID` env vars) and writes JSON to stdout.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- **Presence wisps live inside the tilt frame.** Peers send camera positions in galaxy-*local* space (the broadcaster un-rotates by `-galaxyTilt` about X before sending), and `PresenceWisps` re-applies `rotation-x={galaxyTilt}` so wisps line up with the orbiting planets for each viewer. Skip either half and wisps drift off the disk.
- **`api-server` must be always-on for presence.** Don't deploy it as static/scale-to-zero — the WebSocket needs a persistent process. The galaxy bundle stays static.
- **One remaining `pnpm audit` LOW is intentional:** esbuild `0.27.3` (Windows-only dev-server file read, GHSA-g7r4-m6w7-qqqr). It's a build tool not shipped in production and bumping to 0.28.x risks a Vite↔esbuild range mismatch. Leave it pinned.
- **Known doc gaps (not blockers):** repo has no `LICENSE` file despite being described as open-source, and `scripts/fetch-galaxy.mjs` still uses a placeholder OpenAlex `mailto`. Add a license and a real contact email before a public launch.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
