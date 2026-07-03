---
name: Galaxy perf budget
description: Rendering-cost decisions for the ~376-planet scene — merged orbit lines, tessellation caps, adaptive DPR. Don't regress these.
---

**Rule:** Keep the galaxy's per-frame cost bounded: orbit rings are ONE merged `lineSegments` per solar system (`OrbitLines` in GalaxySystem, `raycast={() => null}`), never one line object per planet; planet/cloud/rim spheres cap at 20×20 segments, moons 16×16; render DPR is adaptive (PerformanceMonitor, 1 ↔ min(1.5, deviceDPR), `flipflops={3}` settles at 1); canvas `antialias:false` with AA done by `EffectComposer multisampling={4}`.

**Why:** With ~376 papers the old per-planet LineLoops meant ~376 extra draw calls AND ~376 line raycast targets on every mousemove — the user reported "slow to move around". Per-planet 32×32 spheres were ~410k vertices for mostly-tiny dots. Canvas MSAA was wasted because the composer blits over it.

**How to apply:** When adding new per-paper visuals, budget one draw call per domain (merge geometry), disable raycast on anything non-interactive, and keep tessellation proportional to on-screen size. Orbit-ring math must match the planet group rotation `[incl, node, 0]` — the merged lines bake it via `applyEuler`; if orbit params gain a new rotation axis, update both. Keep `preserveDrawingBuffer:true` (Share snapshot) and the 12 decay=0 pointLights (terminators).
