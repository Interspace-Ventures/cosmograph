---
name: Galaxy visual language reconciliation
description: How the "Structured Liquidity" one-accent rule coexists with the photoreal 3D scene in the Galaxy app
---

## Structured Liquidity vs the 3D scene
The Galaxy app uses the **Structured Liquidity** design language (sharp 90° corners, 2px black borders, flat 7px offset shadows, single accent `#a388ee`, fonts Archivo/Outfit/Space Mono) — but it applies **only to the 2D UI chrome** (overlay panels, the bottom CommandBar, search, intro).

**Why:** SL mandates "exactly one accent," but a science-data visualization needs many distinguishable domains. Forcing one hue onto the 3D scene would destroy the data encoding and the realism the user asked for.

**How to apply:** Keep the 3D world photoreal — real planet/star/moon textures (in `public/textures/`, referenced via `${import.meta.env.BASE_URL}textures/...`) and natural per-domain *stellar* colors (temperature palette in `lib/colors.ts`). Do NOT recolor planets/suns to the UI accent. Apply SL strictly to HTML/2D overlay components.

## Orbits must read as orbits, not a belt
Planet placement is per-paper deterministic (seeded from paper id): distinct elliptical + inclined orbits with visible orbit-path rings, spaced with increasing radius. **Why:** earlier linear/clustered placement looked like an asteroid belt; the user explicitly wanted real planetary systems. Suns are scattered on 3 logarithmic spiral arms (not collinear). Camera/fog scale is tuned to this larger galaxy — if you change distribution radii, re-tune `HOME_POS`/orbit `maxDistance` in `CameraControls.tsx` and the skybox sphere radius in `Scene.tsx`.
