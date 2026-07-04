---
name: Planet render scaling
description: What scales (and what doesn't) with paper count in the galaxy render.
---

# Planet render scaling

For a heavily-cited scientist the risk axis is **paper count**, not citation count (fetch pagination is uncapped; a 150K-citation corpus can be 1,000–2,000 papers).

**Bounded / fine:**
- Orbit animation is a **single central `useFrame`** in `GalaxySystem` doing one O(n) pass over `planetRefs` — no per-planet frame callback. JS cost is negligible even at 2,000 planets.
- Orbit lines batched to one `LineSegments` per domain. Suns scale by domain count. Co-author **moons capped at 40** and only render for the selected planet.
- Ship materials/geometries cached across the fleet.

**The real wall — draw calls:** every paper is a **unique `<mesh>` + material** (needed for per-planet tilt/incl/node, dim/highlight emissive+opacity, and Earth/Saturn special cases), so draw calls scale **1:1 with paper count**. No instancing, no geometric LOD, no planet cap. Frustum culling (helps fly mode) + adaptive DPR (helps fill-rate, not draw-call count) are the only safety nets; god/overview mode is the worst case.

**Why not instance:** per-planet emissiveIntensity/opacity (used by the filter + Ask light-up path) and the Earth-clouds/Saturn-rings special meshes make InstancedMesh a shader-level rewrite with visual risk — not a "pass"-sized change.

**Graceful cap (shipped):** `computePapersByDomain` (galaxy.ts) caps rendered planets at `MAX_RENDERED_PLANETS` (1200) — over that, only the globally most-cited papers get planets (id tie-break for determinism). It's the one choke point feeding both layout and render. Stats (`galaxyData.stats`) and sun size (`domain.paperCount`) are untouched, so the long tail still counts in stats/domains. `renderedPaperIds` (recomputed in `applyDataset`) gates `searchGalaxy` so search can't select an unrendered paper. Filters/Ask still iterate the full corpus, so matched-but-unrendered papers just don't light up (accepted degradation). It's a true no-op below the threshold — the shipped ~364-paper default is unchanged.

**Why 1200 / why cited-rank:** guaranteed-smooth on weak GPUs while keeping the scientifically important (most-cited) work visible. The tunable knob is the single `MAX_RENDERED_PLANETS` const.

**Presence concurrency is NOT a scaling risk** — a real 100-client load test passed clean (peers[] hard-capped at 60 server-side); see presence-load-testing.md.
