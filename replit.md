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
- To regenerate the data snapshot for a different scientist, see "Make it for your own scientist" at the top of this file. The script takes `--name "Full Name"` or `--id <OpenAlexAuthorId>` (or `GALAXY_AUTHOR_NAME` / `GALAXY_AUTHOR_ID` env vars) and writes JSON to stdout.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
