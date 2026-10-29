# World rendering: deep zoom on the GPU

The internal `/world` view (release flag `isometric-world`, internal channel only) turns a
researcher's work into an archipelago: one island per research domain, one tile per paper,
and a live "machine" for every paper that has one. The approved v9 design is SVG, which cannot
pan a whole world smoothly (about 1 fps at 341 machines on the test floor below). This page
explains how the view draws real worlds at interactive frame rates without changing a pixel
of the design.

## Scale target: 2,000 machines

Real worlds run from 341 machines (the default researcher) to about 2,000 for the most
prolific researchers, and zoomed out the whole world is on screen at once. So **2,000 is the
design ceiling**, and the stress matrix is 341 / 1,000 / 2,000. An earlier series stressed
5,000 and 20,000; that ceiling was our own invention, and it was not allowed to drive the
library choice, so the assessment below was re-done at 2,000 (3.40.2). The 5k / 20k rows stay
in `docs/world-stress-results.jsonl` as history only.

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

### Re-done at the 2,000-machine ceiling (3.40.2)

Criteria: quality, size, maintenance, license and fit, with libraries by default and only the
genuinely novel hand-rolled. Evidence: the harness at 341 / 1k / 2k on desktop and phone, CPU
profiles of the slow cases, a Canvas2D micro-benchmark and a tree-shaken PixiJS build.

**What the profiles said first.** At 2,000 machines the slow cases were not the renderer.
A phone overview of a 2,000-machine world spent **78% of its main thread in forced layout**:
the label pass wrote label styles and then read `window.innerWidth` for every world-to-screen
conversion, which re-laid out the page once per island per frame. 3.40.2 reads the viewport
size once per resize; phone 2k overview went from 2.1 to 24.7 fps, with no renderer change.
What remains is fill rate in the GPU process (SwiftShader rasterising textured, blended quads;
the main thread is 25-77% idle in mid and overview profiles). Fill rate is the same pixels for
any WebGL library, which frames the comparison below.

| Option | Size (gzip) | License, maintenance | What we would hand-roll | fps evidence | Verdict |
|---|---|---|---|---|---|
| **deck.gl 9.4** (current) | 272 KB lazy chunk, `/world` only | MIT, vis.gl / OpenJS, monthly releases | auras, erasers, the copies overview (as today) | table below: phone 15+ everywhere at 2k | **Kept** |
| PixiJS 8.22 (+ pixi-viewport 6) | ~176 KB for all chunks a tree-shaken import of the classes we would use emits (sprites, mesh/shader, textures, particles; the WebGL path loads a subset); viewport +11 KB, not needed since the view owns gestures | MIT, very active | tile pyramid streaming (fetch cap, abort, culling, parent/child fallback, cache: what deck's `TileLayer` gives us), picking (CPU hit tests; fine at 2k), auras as a custom shader (same as now) | same WebGL fill-rate floor; no reason to expect more fps | Not picked: saves ~100-140 KB on a lazy chunk but brings back the tile streaming we deleted when moving to deck, and deletes no code of ours. No prototype: it could not plausibly win on simplicity |
| Canvas2D with the existing atlases (one texture per atlas page) | 0 KB | platform | everything: tile streaming, sprite culling and batching, picking, auras as gradients, quality ladder | micro-benchmark (40 ground tiles + N atlas sprites + 16 bounded screen-blended auras, no app logic): desktop 10.3 fps at 341 / 7.3 at 2k; phone 1.1 / 1.0 | Not picked: below deck's full-app numbers before any app work, and the most hand-rolled code. No prototype |
| SVG (v9 DOM renderer, the fallback) | 0 KB | ours | n/a | harness: desktop 341 0.9 / 1.0 / 1.0, desktop 2k 0.2 / 0.8 / 0.7 | Fallback only (no WebGL2) |

**Is the 7-level pyramid still needed at 2k?** Yes. The ground (islands, bowls, paper tiles)
has to be a raster: drawn as DOM it is about 1 fps even at 341 machines on the test floor.
"Atlas sprites plus one overview bitmap" covers the machines (the thumbnail atlas and
flipbooks) and the far view, but not the ground at island or close zoom: a single bitmap of the
whole world at a size a phone can hold (about 2,048 px wide, ~0.1 px per world unit) is 2x too
soft at desktop island zoom (0.2 px per unit) and 6x at close zoom (0.62), and the pyramid's
two finest levels exist exactly for those zooms. Its four coarsest levels together are 208 KB
and are, in effect, the overview bitmap already, and deck's `TileLayer` does the streaming, so
collapsing them would delete no code of ours. What does change at the real ceiling is the bake:
a real 2,000-machine world is about 6x the area of the 341 world, so about 17 MB of tiles and
about 20 minutes of bake (from the 2.88 MB / 205 s bake), still streamed per view. That argues
for a background per-researcher bake (and `vips dzsave` from one full render), not for a
different renderer.

**Pick: deck.gl stays, and so does the pyramid.** No migration; nothing deleted. The only code
change from the re-assessment is the viewport fix above (`src/world/WorldView.tsx`).

**Still hand-rolled after the re-check:** the island aura layer (design-specific GLSL), the
flipbook erasers, the world-of-copies overview, the live-module runtime (loader queue, byte
LRU, running cap), the adaptive-quality policy, label placement, and the bake. Each is listed
below with its reason; none has a library equivalent that fits.

### Original assessment (at a 20,000-machine target)

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

**A real 2,000-machine world** (the ceiling) would need its own pyramid. Bake size and time
scale linearly with world area, so from the 341-machine bake: about 17 MB of tiles and about
20 minutes of bake (6x the area). Clients still download only what is on screen, so first load
does not grow with it; the cost is storage and bake time, which argues for baking per
researcher in the background rather than at build time.

## The numbers

Measured with `scripts/stress-world.py` in headless Chrome with **no GPU**: WebGL runs on
SwiftShader, a CPU rasteriser, on a shared 2-core sandbox. Treat every frame rate here as a
CPU-rendered floor, not device performance. Desktop is 1440 x 900; phone is 390 x 844 at DPR 3
with touch and the CPU throttled 4x. fps is measured during scripted pans at overview, mid
(island) and close zoom. Raw runs: `docs/world-stress-results.jsonl`.

The overview is measured after an unmeasured 2 s warm-up pan (shader compiles, first tile
decodes and the adaptive-quality step-down are not steady state; earlier first-pan readings
were warm-up artifacts). Mid and close are measured 2.5 s after the camera jumps there, so they
still include some tile and flipbook streaming.

### At the real ceiling (3.40.2)

fps, overview / mid / close, deck.gl tier. "Before" is `51124de` (3.40.1 code, new harness);
"after" is `8192c5c` (3.40.2: viewport read once per resize). Targets: desktop 30+, phone 15+,
**on this SwiftShader floor**.

| World | Profile | Before (`51124de`) | After (`8192c5c`) | Heap after | Meets target? |
|---|---|---|---|---|---|
| 341 | desktop | 19.8 / 25.3 / 25.9 | 16.0 / 25.1 / 25.5 | 25 MB | no (fill-bound, see below) |
| 1,000 | desktop | 18.3 / 29.4 / 24.2 | 18.7 / 22.2 / 26.6 | 30 MB | no |
| 2,000 | desktop | 12.2 / 17.8 / 10.8 | 17.4 / 31.3 / 26.4 | 28 MB | mid only |
| 341 | phone | 17.6 / 33.2 / 38.0 | 26.8 / 31.3 / 31.2 | 24 MB | yes |
| 1,000 | phone | 4.3 / 13.2 / 19.1 | 28.2 / 33.4 / 32.6 | 27 MB | yes |
| 2,000 | phone | 2.1 / 6.5 / 17.4 | 24.7 / 15.2 / 37.8 | 29 MB | yes |

Run-to-run noise on this shared sandbox is several fps (desktop 341 overview read 19.8, 13.9
and 16.0 on identical rendering code). First load is about 1.0 MB on every size (stress worlds
reuse the 341 world's tiles); ready in 0.8 s desktop and 1.6 s phone at 2k.

**Phone** now clears 15 fps at every zoom and size. **Desktop** does not reach 30 on this floor
in most cells, and the profiles say why: its main thread is mostly idle, and the frame waits on
SwiftShader filling a 1440 x 900 canvas (about 0.73 MP even at the lowest quality scale,
against 0.33 MP on the phone profile at quality 1, which is why the phone reads faster). No
renderer library changes how many pixels a CPU rasteriser has to fill; on a real GPU this
canvas is not fill-bound. Dropping the desktop canvas below 0.75x to win a software benchmark
would cost real users crispness, so it was not done.

### History: the 20,000-machine series (3.40.0-3.40.1)

fps, overview / mid / close. SVG is the v9 DOM renderer; raw WebGL is the hand-rolled WebGL2
tier (3.40.0); deck.gl is this tier at `847b470`. Overview here was measured on the first pan
(no warm-up).

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
harness timeout. Later runs are appended to the jsonl.

#### Overview profile (20k desktop, `cf37bf5`)

A CPU profile of the 20k overview pan (desktop, after warm-up) showed the **main thread ~90% busy
in island-label placement**, not in deck.gl: each of up to 28 labels scored 80 candidate spots
against every overview mark on screen (thousands in a 59-copy world) and forced two layouts per
label per frame. `cf37bf5` scores each label only against obstacles inside its own candidate
area (identical result) and caches label sizes per state. Main-thread JS during the pan fell to
~30% (36% idle).

That did not move the harness number (20k desktop overview 6.3 fps at `cf37bf5` vs 8.8 at
`847b470`), because the frame is now bound outside the main thread. Isolation runs after
warm-up (`__cgwWorld.deck()` + `layerFilter`): base ~10 fps; no auras ~10; nothing drawn by
deck and the SVG hidden ~14. So on SwiftShader the overview sits close to the sandbox's own
floor, and the harness's overview figure is mostly warm-up (it is measured first, while JIT and
adaptive quality are still stepping down: the first pan reads 1.6–4.8 fps, later pans 9–11).
Phone 5k overview stays ~1 fps (quality still at level 2 when measured). Phone 20k does not
reach ready in 30–42 s (probe) or 240 s (harness); a follow-up page eval did not return, which
points to a long synchronous start-up rather than a crash (not confirmed).

(Superseded: the harness now warms up before the overview, and the 2k-ceiling profiles above
found the remaining main-thread cost, forced layout from viewport reads, fixed in 3.40.2.)

## Running it

```bash
pnpm --filter @workspace/cosmograph build:world
# copy all module .js files into dist/public/world/machines and write its manifest.json
CHROME=/path/to/chrome python3 artifacts/cosmograph/scripts/stress-world.py \
  --renderers gpu,svg --sizes 341,1000,2000 --profiles desktop,phone --sha $(git rev-parse --short HEAD)
```
