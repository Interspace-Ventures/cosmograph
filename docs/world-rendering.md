# World rendering: deep zoom on the GPU

The internal `/world` view (release flag `isometric-world`, internal channel only) turns a
researcher's work into an archipelago: one island per research domain, one tile per paper,
and a live "machine" for every paper that has one. The approved v9 design is SVG. That is
fine at 341 machines; at 20,000 it is a slideshow. This page explains how the view now draws
any number of machines at interactive frame rates without changing a pixel of the design.

The short version: **bake what does not move, stream what is on screen, run only what you
are looking at.** Three levels of detail, each drawn by the cheapest thing that can draw it.

```
 zoom ─────────────────────────────────────────────────────────────────────────►
 far (overview)              mid (an island)                near (a few tiles)
 ┌─────────────────────┐     ┌─────────────────────┐        ┌─────────────────────┐
 │ deep-zoom pyramid   │     │ pyramid ground      │        │ pyramid ground      │
 │ 7 levels, WebP      │     │ + flipbook sprites  │        │ + rest-pose rasters │
 │ deck.gl TileLayer   │     │ deck.gl IconLayer   │        │ + 1 live SVG module │
 └─────────────────────┘     └─────────────────────┘        └─────────────────────┘
```

## The GPU tier is deck.gl

Since 3.40.1 the canvas under the world is a lazy-loaded deck.gl 9.4 `Deck` with an
`OrthographicView` (y down) driven by the world view's own camera; deck's controller is off
because the world view owns gestures. All of it lives in `src/world/gpu/deckTier.ts`. Only
`/world` with a baked pyramid downloads the chunk (969 KB minified, 271 KB gzipped).

| Zoom | Drawn by | deck.gl layer |
|---|---|---|
| far (overview) | baked deep-zoom pyramid | `TileLayer` + `BitmapLayer` (one per copy of the layout on screen); a world of copies seen whole switches to one instanced `IconLayer` per coarse tile, one instance per copy |
| mid (an island) | pyramid + flipbook sprites | `IconLayer` per flipbook page; mask-mode `IconLayer` "erasers" paint each playing machine's rest silhouette in ground colour first so motion never ghosts over the baked copy |
| near (a few tiles) | pyramid + one-time rasters of the closest machines' rest drawings | `BitmapLayer` per machine, rasterised only while the camera holds still |
| live (tapped) | the machine's own SVG module on the DOM layer | none (DOM) |
| auras | v9 island aura (pool, beam, core, iso ring, pulse), screen-blended | custom `AuraLayer` (~100 lines of GLSL) |
| picking | GPU picking on a transparent per-machine hit layer | `SolidPolygonLayer`, picking buffer only |

## Far: a deep-zoom image pyramid

Everything that is static at a distance (islands, bowls, paper tiles, machines at rest,
stars, overview marks) is pre-rendered into a tiled image pyramid, the same technique map
viewers use.

| | |
|---|---|
| Levels | 7, halving in scale from 0.5 px per world unit down to 1/128 |
| Tiles | 1,264 tiles of 256 px, WebP with alpha; empty tiles are not stored |
| Size | 2.88 MB for the whole world, every level |
| Bake | 205 s, headless Chrome, one pass |

deck.gl's `TileLayer` does the streaming the raw-WebGL tier used to hand-roll: on-demand
fetch with a request cap (6 desktop, 4 phone) and abort, viewport culling, a tile cache, and
`best-available` refinement (a missing tile is drawn from a loaded parent or children, so the
ground is never blank, only briefly soft). Fetch and decode are shared across the copies'
TileLayers, so each tile is fetched and decoded once.

## Mid: flipbook sprites

At island zoom, machines need to look alive but nobody can read their internals yet. Each
machine's animation is baked into a short flipbook:

| | |
|---|---|
| Machines | 341 |
| Frames | 6 per machine, 96 x 64 px cells |
| Pages | 14 texture pages (10 x 16 cells, WebP with alpha) |
| Size | 2.28 MB total; a view fetches only the pages it shows |
| Bake | 95 s |

Sprites are one `IconLayer` per flipbook page; the frame is picked in `getIcon` with an
update trigger on a quarter-frame clock, so the instance buffer is rebuilt at most a few times
a second rather than every frame. Layers are reused across frames: a camera move only updates
deck's view state.

## Near: live modules, capped

Close up, a machine is the real thing: its ES module mounts its own SVG and runs its own
script. Those are expensive, so they are rationed:

- **Nothing up front.** No module is downloaded until its machine is close enough to matter.
- **Loader cap.** Requests go through a priority queue (nearest first) with a concurrency cap
  of 4 on desktop and 2 on phone-class devices.
- **LRU by bytes.** Module sources live in a cache with a byte budget (24 MB desktop, 6 MB
  phone). A machine is instantiated from source with its own timers, so evicting or closing
  it stops its animation and frees its memory, which a plain dynamic `import()` never could.
- **Running cap.** Only a few machines run at once; when the cap is hit the oldest stops,
  never the one the user enlarged.
- **Manifest first.** Only modules listed in the shipped manifest are ever requested, and a
  machine without one says "render pending" and shows its picture instead of failing a
  request. (Review hooks such as `&run=<key>` wait for the manifest for the same reason.)

## Picking without the DOM

With the ground and sprites on a canvas there are no DOM nodes to receive clicks. deck.gl's
GPU picking answers taps from a transparent body box per machine on screen, drawn only into
the picking buffer, back to front so the frontmost body wins. The `MachineGrid` uniform
spatial index still answers "what is on screen" for the sprite pass, the hit layer and the
module loader.

## Adaptive quality

Frame time is measured every frame as an exponential average over about half a second. When
it stays slow the world sheds cost in steps, cheapest-to-lose first, and earns it back after a
few seconds of fast frames:

| Level | What it keeps |
|---|---|
| 3 full | flipbooks play, auras pulse, canvas up to 2x device px |
| 2 calm | flipbooks hold their rest frame, auras still, canvas 1.5x max |
| 1 lean | no sprites (the pyramid shows machines at rest), canvas 1x, ground one level coarser, one live machine at a time |
| 0 minimal | as lean, canvas at 0.75x |

`prefers-reduced-motion` pins motion off at every level, and `#q=0..3` pins a level for review.

## Library assessment

The first GPU tier was hand-rolled raw WebGL2 (pyramid streaming, a texture-array LRU,
instanced flipbooks, grid picking). It worked, but every generic piece was ours to maintain,
so the tier was re-evaluated against off-the-shelf libraries.

| Option | Covers | Missing for this view | Verdict |
|---|---|---|---|
| **deck.gl 9.4** (+ luma.gl) | tiled pyramid (`TileLayer`: fetch cap, abort, culling, parent/child fallback, cache), instanced sprites from an atlas (`IconLayer`), GPU picking, non-geographic `OrthographicView`, a custom-layer API for shaders | gestures (we own them anyway); large chunk (969 KB min / 271 KB gz, lazy) | **Picked** |
| PixiJS v8 + pixi-viewport | fast batched sprites, text, filters, blend modes; viewport gives camera + gestures | no deep-zoom tile pyramid (tile streaming, LRU and fallback would stay hand-rolled); picking is CPU hit-testing over the scene graph; viewport gestures would fight the world view's own | Not picked: would only replace the sprite pass |
| OpenSeadragon | best-in-class deep-zoom viewer (DZI pyramids, fallback, gestures) | overlays are DOM/canvas, not 20k animated instanced sprites; a second renderer and a second camera to keep in sync | Not picked: ground only |
| libvips (`vips dzsave`) | build time, not runtime: cuts a DZI/Google-style pyramid from one large raster in seconds | needs one full-resolution render of the world first; our bake screenshots the app per tile | Recommended for the bake of real large worlds (render once, `dzsave` the levels); not adopted in this PR |

**Why deck.gl.** It is the only option that covers the three generic jobs at once (tile
pyramid, instanced sprites, picking) on one canvas with one camera. Its camera is a plain
view state we set from the world's own camera, so the SVG tier, the gestures and the module
runtime are unchanged. The cost is bundle size, paid only by `/world`.

**Still hand-rolled, and why.**
- *Island auras*: a custom `AuraLayer`. The v9 aura (pool, beam, core, iso ring, pulse,
  screen blend) is design-specific; no stock layer draws it.
- *Flipbook erasers*: mask-mode IconLayers that blank the baked rest pose under a playing
  sprite. Needed because the pyramid bakes machines at rest.
- *The world-of-copies overview*: one instanced IconLayer per coarse tile, because N
  TileLayers (one per stress copy) each with their own sub-layers is what deck does poorly.
- *Live modules, loader queue, byte LRU, running cap*: these run the machines' own scripts on
  the DOM; no renderer library does that.
- *Adaptive quality* (`gpu/quality.ts`): policy, not rendering.
- *The bake* (`scripts/bake-world.py`): renders the app itself so baked pixels match the SVG.

## The bake pipeline

The baker renders the app itself, so baked pixels are exactly what the SVG view draws:

1. `pnpm --filter @workspace/cosmograph build:world` builds with `VITE_RELEASE_CHANNEL=internal`
   (a plain build routes `/world` to the galaxy home; the harness detects that and says so).
2. `scripts/bake-world.py --modules <all 341 modules>` serves the build, opens
   `/world#bake=pyramid` in headless Chrome on a transparent root, steps the camera over every
   tile of every level, waits for `bakeIdle()` and screenshots each tile. `#bake=flip` does the
   same for six phases of every machine.
3. Tiles and pages are written under `public/world/{pyramid,flip}/`, with their manifests in
   `src/world/data/{pyramid,flip}.json` (compiled into the world chunk). A manifest records the
   world fingerprint it was baked from, its byte totals and its bake time.

Stress worlds (`#stress=N`) tile copies of the real archipelago, so they reuse the same tiles:
a 20,000-machine stress world streams no more ground than the 341-machine world.

**A real 20,000-machine world** would need its own pyramid. Bake size and time scale linearly
with world area, so from the 341-machine bake: about 170 MB of tiles and about 3.3 hours of bake
for 20k machines (59x the area). Clients still download only what is on screen, so first load
does not grow with it; the cost is storage and bake time, which argues for baking per
researcher in the background rather than at build time.

## The numbers

Measured with `scripts/stress-world.py` in headless Chrome with **no GPU**: WebGL runs on
SwiftShader, a CPU rasteriser, on a shared 2-core sandbox. Treat every frame rate here as a
CPU-rendered floor, not device performance. Desktop is 1440 x 900; phone is 390 x 844 at DPR 3
with touch and the CPU throttled 4x. fps is measured during scripted pans at overview, mid
(island) and close zoom. Raw runs: `docs/world-stress-results.jsonl`.

fps, overview / mid / close. SVG is the v9 DOM renderer; raw WebGL is the hand-rolled WebGL2
tier (3.40.0); deck.gl is this tier at `847b470`.

| World | Profile | SVG | raw WebGL | deck.gl | Heap (raw WebGL → deck.gl) |
|---|---|---|---|---|---|
| 341 | desktop | n/m | 11.5 / 19.3 / 0.7 | 8 / 22.3 / 16.7 | 22 → 32 MB |
| 5k | desktop | n/m | 13.2 / 37.1 / 0.8 | 11.2 / 26.7 / 25.1 | 21 → 40 MB |
| 20k | desktop | 0.4 / 0.3 / 0.5 | 5.8 / 15.1 / 0.7 | 8.8 / 19.5 / 23.8 | 58 → 46 MB (SVG 127 MB) |
| 341 | phone | n/m | 15.3 / 39.7 / 0.6 | 11.6 / 24.5 / 14.7 | 20 → 31 MB |
| 5k | phone | n/m | 0.6 / 25.7 / 1.0 | 1 / 18.2 / 20 | 19 → 33 MB |
| 20k | phone | not ready | not ready | not ready | |

n/m: not measured in this series. Close-up went from about 1 fps to 15–25 fps (the SVG close-ups
re-rasterising every frame were replaced by one-time bitmaps). **Remaining gaps:** overview
fps (8–11 desktop, about 1 on phone 5k) and phone 20k, which never reaches ready within the
harness timeout. Later runs, if any, are appended to the jsonl and summarised in PR #20.

## Running it

```bash
pnpm --filter @workspace/cosmograph build:world
# copy all module .js files into dist/public/world/machines and write its manifest.json
CHROME=/path/to/chrome python3 artifacts/cosmograph/scripts/stress-world.py \
  --renderers gpu,svg --sizes 341,5000,20000 --profiles desktop,phone
```
