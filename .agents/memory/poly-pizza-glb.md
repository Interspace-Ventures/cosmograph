---
name: Poly Pizza GLB download
description: How to actually fetch a Poly Pizza model's GLB (the obvious URL pattern is a trap).
---

Poly Pizza model pages have id slugs like `https://poly.pizza/m/Jqfed124pQ`, but
the **page id is NOT the file id.** `https://static.poly.pizza/<page-id>.glb`
returns a ~263-byte S3 `AccessDenied` XML, not a model.

**How to get the real GLB:** fetch the model page HTML and scrape the CDN URL —
it's a UUID, e.g. `https://static.poly.pizza/<uuid>.glb` (the page also embeds a
`...glb.br` brotli variant and a `.jpg` poster with the same uuid). Verify the
download by checking the first 4 bytes are the ASCII magic `glTF`.

**Why:** saved a wasted retry loop when adding the CC0 Quaternius spaceship
(`artifacts/cosmograph/public/models/ship.glb`). License is CC0 — credited in
`docs/architecture.md` Credits as good practice, not required.
