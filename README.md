# Cosmograph / Galactic 🌌

**A scientist's life's work, rendered as a galaxy you can fly through.**

[Cosmograph](https://cosmograph.space) (also known as **Galactic**) turns any researcher's complete body of work into an explorable 3D universe: research domains become **suns**, papers become **planets** orbiting them (size = citations, orbit distance = topic relevance), and frequent co-authors become **moons**. Fly the spaceship through the disk or pull back into a god's-eye planetarium view, click any world for its details, and watch the whole corpus light up at once.

It started as a Father's Day gift for stem-cell scientist **Dr. Mahendra S. Rao** — and is now an open-source template you can point at *any* scientist: a parent, a mentor, a hero, or yourself.

> The shipped snapshot (Dr. Rao) spans **364 papers**, **28,860 citations**, **1,191 co-authors**, and **12 research domains** across **30 years** (1994–2024) — roughly 1.4 million words of published science, drawn as one navigable galaxy.

🔭 **Live demo:** [https://cosmograph.space](https://cosmograph.space) (or [https://galactic.dad](https://galactic.dad))

🎬 **Watch the launch trailer:** [cosmograph.space/trailer](https://cosmograph.space/trailer/) — a 30-second flight through the galaxy before you dive in yourself. (There's also a **Watch the trailer** button on the site's title screen, right below **Ad Astra**.)

<video src="https://raw.githubusercontent.com/heyinterspace/cosmograph/main/docs/trailer.mp4" controls muted loop playsinline width="100%">
  Your browser does not support the video tag — <a href="https://cosmograph.space/trailer/">watch the trailer here</a>.
</video>

> The trailer above is a rendered capture of the standalone `/trailer/` video artifact (`artifacts/trailer/`). To regenerate it after changing the trailer, re-capture the running `/trailer/` route to MP4 and overwrite [`docs/trailer.mp4`](docs/trailer.mp4).

---

## Highlights

- 🌌 **A real galaxy, not a chart.** Photoreal suns, orbiting planets, and moons rendered with React Three Fiber, drei, and postprocessing — each domain gets its own stellar color and every orbit reads like a planetary system.
- 🚀 **Two ways to explore.** A first-person spaceship fly-through with momentum, and a god/planetarium orbit view with an adjustable axis.
- 🔭 **Everything is clickable.** Open any planet for paper details, any sun for a domain breakdown, and a stats layer that summarizes the entire body of work.
- 🛰️ **Live presence (optional).** Faint "wisps" mark other visitors exploring the same galaxy, with a live "*N cosmonauts streaming now*" headcount — anonymous and in-memory, nothing is persisted.
- 🧬 **No hardcoded identity.** The title, stats, domains, papers, and co-authors all come from a generated data snapshot. Regenerate it for a different scientist and the whole universe redraws.
- ⚡ **Fast and reliable by design.** The full dataset is fetched once at build time and baked into a static JSON file — no backend or database is needed for the core visualization.

## How it works

Cosmograph pulls a researcher's complete publication record from **[OpenAlex](https://openalex.org)** (free, open, no API key — Google Scholar has no public API). A one-time script crunches that record into a single static snapshot:

- Research **domains** ("suns") are derived from OpenAlex's topic hierarchy at the subfield level, with long-tail subfields folded into a "Cross-Disciplinary" sun (target ~6–12 suns).
- Each **paper** ("planet") is sized by citation count and placed at an orbit distance reflecting its relevance to the domain.
- Headline **stats** (papers, citations, h-index, i10, counts-by-year, top institution) are computed from the kept works.

The galaxy itself is a fully static bundle. Realtime presence and the GitHub star count are an *optional* enhancement served by a small always-on API server — the galaxy degrades gracefully if it's unreachable.

## Quick start

Requires [pnpm](https://pnpm.io) and Node.js 24+.

```bash
pnpm install

# Run the galaxy web app (served at /)
pnpm --filter @workspace/cosmograph run dev

# (Optional) run the presence + GitHub-stars API server
pnpm --filter @workspace/api-server run dev
```

Useful repo-wide commands:

```bash
pnpm run typecheck     # full typecheck across all packages
pnpm run build         # typecheck + build everything
```

## Make it for your own scientist

The app ships with **no hardcoded identity** — everything the UI shows comes from `artifacts/cosmograph/src/data/galaxyData.json`. To feature someone else, regenerate that snapshot:

```bash
# By name (prints the top OpenAlex matches to stderr so you can sanity-check)
pnpm --filter @workspace/cosmograph run fetch:galaxy -- --name "Ada Lovelace" \
  > artifacts/cosmograph/src/data/galaxyData.json

# Or by exact OpenAlex author ID (more precise)
pnpm --filter @workspace/cosmograph run fetch:galaxy -- --id A5111365293 \
  > artifacts/cosmograph/src/data/galaxyData.json
```

Then restart the galaxy — the title, stats, domains, papers, and co-authors all redraw from the new snapshot.

### Disambiguation

OpenAlex occasionally lumps two distinct scientists who share a name under one author ID. The fetch script can drop the wrong person's works and **recompute every headline stat** from only the kept works:

| Flag | Effect |
| --- | --- |
| `--exclude-institution <OpenAlexInstId>` | Drop works affiliated with this institution (repeatable) |
| `--exclude-coauthor <OpenAlexAuthorId>` | Drop works co-authored with this person (repeatable) |
| `--min-year <YYYY>` / `--max-year <YYYY>` | Drop works outside this publication-year range |

Disambiguate by **research cluster** (institution + co-author), not by year alone. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for a detailed walkthrough.

## Project structure

This is a [pnpm](https://pnpm.io) monorepo.

```text
artifacts/
  cosmograph/        # The galaxy web app (React + Vite + React Three Fiber), served at /
    src/data/        #   galaxyData.json — the baked-in snapshot (source of truth)
    scripts/         #   fetch-galaxy.mjs — regenerates the snapshot from OpenAlex
  api-server/        # Express API: realtime presence (WebSocket) + GitHub-stars cache
  trailer/           # ~45s launch trailer (motion-graphics video artifact), previewed at /trailer/
lib/
  api-spec/          # OpenAPI spec — the source of truth for the API contract
  api-client-react/  # Generated React Query hooks (Orval)
  api-zod/           # Generated Zod schemas
  db/                # PostgreSQL schema + Drizzle ORM
```

## Tech stack

- **Frontend:** React, Vite, React Three Fiber + drei + postprocessing, Framer Motion, Tailwind
- **Backend:** Express 5 (Node.js 24, TypeScript 5.9)
- **Data:** PostgreSQL + Drizzle ORM; OpenAlex for publication data
- **Contracts & validation:** OpenAPI → Orval codegen, Zod (`zod/v4`)
- **Build:** Vite (web), esbuild (server)

## 🤝 Contributing

Contributions are welcome — bug reports, feature ideas, and pull requests alike. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) for local setup, the disambiguation guide, and our development workflow. Please also review our [Code of Conduct](CODE_OF_CONDUCT.md).

Found something exploitable? See [`SECURITY.md`](SECURITY.md) for how to report it privately.

## 📜 License

MIT © [Interspace Venture](https://interspace.ventures). Publication data from [OpenAlex](https://openalex.org).
