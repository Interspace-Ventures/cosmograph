---
name: Brand — Cosmograph
description: The app's brand identity and the naming rules that survive the Galactic→Cosmograph rebrand.
---

# Brand: Cosmograph

The app brand is **Cosmograph**; the production domain is **cosmograph.space**. It was formerly "Galactic" / galactic.dad — do not reintroduce the old name in any live UI surface.

- **Keep the astronomy *concept* words** — "galaxy", "galactic plane", "galactic core", `GalaxySystem`. These describe the 3D visualization metaphor, not the brand. Only the product *name* changed.
- **Presence term:** visitors are "cosmonauts" (was "galacticons", then briefly "cosmographers"), e.g. "N cosmonauts streaming now". Historical changelog lines that say "cosmographers" are left as dated records.
- **GitHub repo stays `heyinterspace/galactic`** (in `site.ts` + `GITHUB_REPO`). The actual repo was not renamed, so changing it would break the footer star count and sponsors link. Leave it until the user renames the repo.
- **Slug rename DONE (`galaxy`→`cosmograph`):** package `@workspace/cosmograph`, dir `artifacts/cosmograph`, artifact title "Cosmograph". BUT the artifact **`id` stays `artifacts/galaxy`** — it is immutable (`verifyAndReplaceArtifactToml` rejects id changes) and an internal handle users never see. Concept names kept on purpose: `fetch:galaxy` script, `src/data/galaxyData.json`, `galaxy.ts`, `GalaxySystem`.
- **Renaming an artifact directory gotcha:** `mv artifacts/<old> artifacts/<new>` makes the platform auto-deregister the artifact; re-register by editing the moved `.replit-artifact/artifact.toml` (KEEP its `id`, change title + the `@workspace/<slug>` filters + `publicDir`) via `verifyAndReplaceArtifactToml`, then `pnpm install` to refresh the lockfile. **Then kill the old dev server process** — the original vite keeps running on the service port (here 23665), is invisible to `lsof -ti` as your user, and blocks the renamed workflow with "Port already in use". Find it with `ps aux | grep vite` and `kill -9` the pnpm+vite+esbuild tree.

**Why:** user requested a full rebrand ("every part… no shortcuts") but the concept word, the real repo, and the internal slug are infrastructure/metaphor, not brand — changing them blindly breaks things.
**How to apply:** when adding UI copy or metadata use "Cosmograph"/"cosmograph.space"; never write "Galactic" except the one historical 3.0.0 changelog line that announces the rename.
