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

**How to apply:** if a huge-corpus scientist stutters, the lever is a graceful cap (render top-N papers by citations; the rest still count in stats/domains) — but that changes the "every paper is a planet" semantic, so confirm with the user before adding.
