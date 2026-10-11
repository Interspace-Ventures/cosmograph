# Cube galaxy art-direction spike

A standalone three.js prototype of the cuboidal galaxy the owner chose to
replace the photoreal scene. It is the visual reference for porting the new
look into the real React Three Fiber app (see
[`../../launch-plan.md`](../../launch-plan.md) for the rules it encodes).

- `build_cube_v3.py` generates `cube-v3.html` from the baked dataset
  (`artifacts/cosmograph/src/data/galaxyData.json`) and `changelog.json`
  (exported from `artifacts/cosmograph/src/data/changelog.ts`).
- `cube-v3.html` is self-contained apart from three.js (unpkg CDN), Google
  Fonts, and the repo's starfield texture, so serve it from the repo root:

```bash
python3 docs/spikes/cube-galaxy/build_cube_v3.py
python3 -m http.server 5091   # from the repo root
open http://127.0.0.1:5091/docs/spikes/cube-galaxy/cube-v3.html
```

Screenshots: `cube-v3-galaxy.jpg`, `cube-v3-system.jpg`, `cube-v3-pricing.jpg`,
`cube-v3-changelog.jpg`.

What it demonstrates: voxel planets sized 1³ to 9³ by citations, tilted Kepler
orbit lanes that are collision-free by construction, per-field surface
patterns, independent tumbling and Rampart-style rolls, bloom-lit cube suns,
distance fog, a lightspeed jump between systems, full orbit camera, and the
restored dock and drawers with greyed "SOON" features. Measured about 60 fps
with all 364 papers.

Known spike-only shortcuts: the pricing and "Gift" panels are static copy; the
"cosmonauts streaming" stat is hard-coded to 2; dense systems still crowd
labels at the core; phones need a simplified/guided mode.
