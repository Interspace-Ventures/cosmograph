---
name: Galaxy visual language reconciliation
description: How the "Structured Liquidity" one-accent rule coexists with the photoreal 3D scene in the Galaxy app
---

## Structured Liquidity vs the 3D scene
The Galaxy app uses the **Structured Liquidity** design language (sharp 90° corners, 2px black borders, flat 7px offset shadows, single accent `#a388ee`, fonts Archivo/Outfit/Space Mono) — but it applies **only to the 2D UI chrome** (overlay panels, the bottom CommandBar, search, intro).

**Why:** SL mandates "exactly one accent," but a science-data visualization needs many distinguishable domains. Forcing one hue onto the 3D scene would destroy the data encoding and the realism the user asked for.

**How to apply:** Keep the 3D world photoreal — real planet/star/moon textures (in `public/textures/`, referenced via `${import.meta.env.BASE_URL}textures/...`) and natural per-domain *stellar* colors (temperature palette in `lib/colors.ts`). Do NOT recolor planets/suns to the UI accent. Apply SL strictly to HTML/2D overlay components.

## God-mode camera must not fight OrbitControls
In god/orbit mode, do NOT lerp `camera.position` toward a target every frame — that continuously overrides OrbitControls and makes scroll-to-zoom and pan feel broken/"wonky". **Why:** a previous version always pulled the camera back to a target (HOME when nothing selected), so the user's wheel-zoom was undone each frame.
**How to apply:** run the fly-to lerp only briefly (~1.3s) right after a selection changes, with `controls.enabled=false` during it; then re-enable controls and only gently lerp `controls.target` (the pivot) to keep a selected object centered — never the camera position. Let the wheel/drag own distance and angle.

## Domain balance: split oversized subfields by topic
One subfield (Molecular Biology) held 287/498 papers and visually dwarfed the galaxy. Clustering is by subfield, but any subfield over a threshold is split into per-topic suns (large topics break out; the remainder keeps the subfield name). **Why:** the user wanted a balanced galaxy, not one system that looks like the whole thing. The split logic lives in BOTH `scripts/fetch-galaxy.mjs` (source of truth) and was applied offline to the baked `galaxyData.json` from existing paper fields (every paper carries `topic`/`subfield`/`field`). Keep the two in sync if you change thresholds.

## Photoreal bodies use only stock three/R3F materials (no GLSL)
The "NASA-grade" sun/planet realism is built entirely from stock `meshStandardMaterial`/`meshBasicMaterial`/`sprite` — never custom shaders. **Why:** the screenshot sandbox has no GPU, so shader-compile failures can't be caught; stock materials are safe to ship blind. Earth is the showpiece (day map + linear normal map + drifting cloud sphere + additive back-side atmosphere rim). Rocky planets fake relief by reusing their sRGB colour map as `bumpMap` (small `bumpScale`); gas giants stay smooth (lower roughness, no bump). Suns = emissive core + counter-rotating additive churn shell + 2 back-side corona shells + a billboarded canvas radial-gradient glow sprite (module-level lazy singleton, `typeof document` guarded). Keep planet spheres at 32×32 (detail comes from normal/bump maps, not geometry) for hundreds-of-planets perf; suns can be 48×48 (only 6–12).

## Cloud PNG: use map alpha, NOT alphaMap
For the Earth cloud layer, set the cloud PNG as `map` with `transparent` and rely on the texture's own alpha channel. Do NOT also set it as `alphaMap`. **Why:** three.js `alphaMap` samples the **green** channel; a white-cloud PNG has green≈1 everywhere, so an `alphaMap` makes the whole cloud sphere opaque and wraps Earth in a solid white shell.

## Orbits must read as orbits, not a belt
Planet placement is per-paper deterministic (seeded from paper id): distinct elliptical + inclined orbits with visible orbit-path rings, spaced with increasing radius. **Why:** earlier linear/clustered placement looked like an asteroid belt; the user explicitly wanted real planetary systems.

## Suns are clustered by research field, not on spiral arms (distance = relatedness)
Sun (domain) placement groups domains by their broad `field` into clusters so proximity reads as scientific relatedness ("word cloud of solar systems"), replacing the old decorative 3-arm spiral where distance meant nothing. **Why:** the user asked what governs inter-system distance and wanted it meaningful without overlap. **How to apply:** packing is by each system's FULL orbital footprint (`domainSpan` = sun radius + outermost planet orbit + margin), NOT just sun radius — big domains' planets orbit ~270 units out, so spacing by sun size alone overlaps systems. Largest cluster anchors the core; others ring around it; within a cluster the largest system is centered with the rest ringed around. Layout is module-load deterministic. Verify changes numerically (min pairwise center distance minus summed footprints ≥ 0 = no overlap) since there's no GPU to eyeball it. Total extent (~1996) matches the prior galaxy scale, so `HOME_POS`/orbit `maxDistance` in `CameraControls.tsx` and skybox radius in `Scene.tsx` still frame it — re-tune those only if you change `GAP_IN`/`GAP_CL` or footprint math enough to shift extent.
