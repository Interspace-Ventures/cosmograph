---
name: Reusable scientist identity
description: Galactic is an open-source template for ANY scientist — never hardcode a name, pronoun, or relationship in the app.
---

The app must work for any researcher (a dad, a mom, a mentor, yourself), not
just the original subject (Dr. Mahendra S. Rao). It ships with no hardcoded
identity: every name/stat/domain the UI shows comes from the baked
`src/data/galaxyData.json` `author`/`stats`/`domains`/`papers`.

**Why:** The user explicitly wanted others to fork it and generate the gift for
their own parent. A stray hardcoded name or gendered pronoun ("Dr. Rao", "he
published", "Father's Day") silently breaks that for everyone else.

**How to apply:**
- UI copy stays neutral and genderless. Do not write "he/she/his/her", "Dr. X",
  "dad/mom", or a specific name in components — reference `galaxyData.author.name`
  if you must name the person, otherwise use neutral phrasing ("this body of
  work", "papers published in that domain").
- The generator (`scripts/fetch-galaxy.mjs`) is parameterized: resolve the author
  from `--name` (OpenAlex name search, top hit + alternatives logged to stderr)
  or `--id`/`--author`, or env `GALAXY_AUTHOR_NAME`/`GALAXY_AUTHOR_ID`. No author
  id is hardcoded. Run via `pnpm --filter @workspace/galaxy run fetch:galaxy`.
- Snapshot schema changes must stay backward-compatible with the committed
  galaxyData.json (e.g. `author.openAlexId` is optional) so the existing data
  isn't forced to regenerate.
- Do NOT regenerate galaxyData.json unless asked — it currently holds the
  original gift's data; regenerating would overwrite it.
