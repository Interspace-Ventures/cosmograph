# Contributing to Cosmograph

Thanks for your interest in making Cosmograph better! Whether you're fixing a bug, adding a feature, or generating a galaxy for your own scientist, this guide will get you set up.

By participating in this project you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug** — open an issue with the *Bug report* template.
- **Suggest a feature** — open an issue with the *Feature request* template.
- **Send a pull request** — fix a bug, improve docs, or build a feature.

> Issues filed here (including bug/feature reports sent from the app's "Ask" chat) are automatically mirrored into our Linear board, so they will be triaged even if you don't hear back on GitHub right away.

## Prerequisites

- [Node.js](https://nodejs.org) 24+
- [pnpm](https://pnpm.io) (this is a pnpm-workspaces monorepo — `npm`/`yarn` are intentionally blocked)

## Local setup

```bash
pnpm install
```

The project is a monorepo. The pieces you'll most likely touch:

- `artifacts/galaxy/` — the 3D web app (React + Vite + React Three Fiber)
- `artifacts/galaxy/src/data/galaxyData.json` — the baked data snapshot the visualization reads
- `artifacts/galaxy/scripts/fetch-galaxy.mjs` — the script that regenerates that snapshot from OpenAlex
- `artifacts/api-server/` — the optional realtime presence + GitHub-stars server

### Generating a snapshot for a different scientist

```bash
# by name (prints top OpenAlex matches to stderr so you can confirm)
pnpm --filter @workspace/galaxy run fetch:galaxy -- --name "Ada Lovelace" \
  > artifacts/galaxy/src/data/galaxyData.json

# by exact OpenAlex author ID (recommended for common names)
pnpm --filter @workspace/galaxy run fetch:galaxy -- --id A5111365293 \
  > artifacts/galaxy/src/data/galaxyData.json
```

Set a contact email for OpenAlex's "polite pool" with `--mailto you@yourdomain.com` (or the `GALAXY_MAILTO` env var).

### Disambiguating a merged profile

OpenAlex sometimes lumps two distinct researchers who share a name under one author ID. When that happens, drop the wrong person's works with these repeatable filters — the script then recomputes every headline stat (works, citations, h-index, i10, counts-by-year, institution) from only the kept works:

- `--exclude-institution <OpenAlexInstId>` — drop works affiliated with this institution
- `--exclude-coauthor <OpenAlexAuthorId>` — drop works co-authored with this person
- `--min-year <YYYY>` / `--max-year <YYYY>` — drop works outside this year range

Disambiguate by **research cluster** (institution + co-author), not by year alone — the two people often publish across overlapping decades. Env equivalents: `GALAXY_EXCLUDE_INSTITUTIONS`, `GALAXY_EXCLUDE_COAUTHORS` (comma-separated), `GALAXY_MIN_YEAR`, `GALAXY_MAX_YEAR`.

## Before you open a pull request

Run the full typecheck across all packages:

```bash
pnpm run typecheck
```

Then please:

1. Keep the change focused — one logical change per PR.
2. Match the existing code style (TypeScript, Prettier).
3. Update docs if behavior changes.
4. Fill out the PR template, linking the issue it resolves (e.g. `Closes #123`).

## Commit & branch naming

Use clear, present-tense commit messages (e.g. `Fix wisp drift in tilted view`). If your branch corresponds to a tracked issue, including the issue number in the branch name helps our Linear board link the work back automatically.

## Questions

Open a [discussion or issue](https://github.com/heyinterspace/cosmograph/issues), or email **hello@cosmograph.space**.
