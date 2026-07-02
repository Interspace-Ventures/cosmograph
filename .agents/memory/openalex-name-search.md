---
name: OpenAlex name-only author search
description: Why author search must use display_name.search, not the general search param
---

**Rule:** When searching OpenAlex for a person by name, use `filter=display_name.search:<q>` — never the general `?search=` param. Sanitize `,` and `:` out of the query first (they are OpenAlex filter syntax).

**Why:** The general `search=` matches affiliations and alternate fields too, so "Albert Einstein" ranked a researcher at the *Albert Einstein Institute* above Einstein himself. Name-only search returns results that look like what the visitor typed.

**How to apply:** Any people-search UI or script hitting `api.openalex.org/authors` should filter on `display_name.search`. The general `search=` is fine only when affiliation matches are actually wanted.
