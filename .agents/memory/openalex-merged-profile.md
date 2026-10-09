---
name: OpenAlex merged-profile disambiguation
description: An OpenAlex author profile can merge two same-named people; how the fetch script disentangles them.
---

# OpenAlex sometimes merges distinct same-named researchers into one author id

A single OpenAlex author id can actually represent **two different scientists**
that OpenAlex conflated because they share an exact display name. When this
happens the headline stats (works, citations, h-index, i10) are inflated by the
other person's papers, and that person's topics create bogus "suns".

**Rule:** disambiguate by **research cluster (institution + co-author)**, not by
publication date alone. A same-named person's career can overlap the subject's
active years, so a plain year cutoff won't separate them. The reliable signature
is: exclude the wrong person's institution, exclude their frequent co-author,
optionally add a `--min-year` only for a few stray earlier works.

**Front matter is separate, universal noise:** OpenAlex also catalogs journal
front matter as "works" (tables of contents, indexes, "Issue Information",
contributor lists), mostly from journals the subject edited. These have ~0
citations and get mis-topic-classified into bogus suns. The fetch script drops
them **always** (not gated on disambiguation) via `isFrontMatter()` = OpenAlex
type `paratext` OR a title regex. Safe for any author, not just merged profiles.

**Why:** when two people share an exact display name, name-form filtering can't
separate them; institution + co-author + min-year is the only signature that does.

**How to apply:** `scripts/fetch-galaxy.mjs` has reusable filters
`--exclude-institution`, `--exclude-coauthor` (repeatable), `--min-year`,
`--max-year` (+ `GALAXY_EXCLUDE_*` / `GALAXY_MIN_YEAR` env). When ANY filter is
active the headline author block (works, citations, h-index, i10, countsByYear,
institution) is **recomputed from kept works** because the OpenAlex author object
still reflects the merged profile. The exact regeneration command for the shipped
snapshot lives in `docs/architecture.md`. Never regenerate `galaxyData.json` without explicit
user consent.
