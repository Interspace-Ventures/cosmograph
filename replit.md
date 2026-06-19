# Galaxy

An immersive 3D website that visualizes the lifetime scientific work of Dr. Mahendra S. Rao as an explorable galaxy — research domains as suns, papers as orbiting planets, co-authors as moons. Built as a Father's Day gift.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

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
- The full dataset is **fetched once at build time and baked into a static JSON file** — no backend, no database, no runtime API calls. Keeps the gift fast and reliable.
- Research domains ("suns") are derived automatically from OpenAlex's topic hierarchy at the subfield level, with long-tail subfields collapsed into a "Cross-Disciplinary" sun (target ~6–12 suns).
- 3D rendering via React Three Fiber + drei + postprocessing.

## Product

- A single immersive 3D page: research domains are suns, papers are orbiting planets (size = citations, orbit distance = topic relevance), co-authors are moons.
- Two navigation modes: a spaceship fly-through and a god/planetarium orbit view with adjustable axis.
- Click planets/suns for paper and domain details; a stats layer summarizes the whole corpus.
- To regenerate the data snapshot: `node artifacts/galaxy/scripts/fetch-galaxy.mjs > artifacts/galaxy/src/data/galaxyData.json`

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
