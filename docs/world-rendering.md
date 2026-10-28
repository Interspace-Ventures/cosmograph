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
 │ 7 levels, WebP      │     │ + flipbook sprites  │        │ + live SVG modules  │
 │ 1 draw call         │     │ 1 draw call         │        │ capped, LRU-evicted │
 └─────────────────────┘     └─────────────────────┘        └─────────────────────┘
```

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

Tiles stream on demand, nearest the centre of the screen first, through a small concurrent
queue. A tile that has not arrived yet is drawn from its nearest loaded ancestor (a sub-rect
of a coarser tile), so the ground is never blank, only briefly soft. Decoded tiles live in a
single `TEXTURE_2D_ARRAY` with an LRU, so GPU memory is fixed however large the world gets.

The pyramid is drawn as one instanced draw call: the camera is three uniforms (centre x, y
and zoom) and a pan re-uploads only the short list of visible tiles.

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

Sprites are one quad per visible machine in a second instanced pass. The frame is chosen in
the vertex shader from time plus a per-instance phase, so animating 20,000 machines costs the
CPU nothing. Island auras are a third pass: one quad per island, gradient and pulse computed
in the shader and screen-blended to match the design's `mix-blend-mode: screen`.

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

With the ground and sprites on a canvas there are no DOM nodes to receive clicks. Machines
are indexed in a uniform spatial grid over their footprints (`MachineGrid`); a tap converts
the screen point to world coordinates and asks the grid, which is O(1) per tap regardless of
world size. The same grid answers "what is on screen" for the sprite pass and the loader.

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

## Why raw WebGL2 and not Pixi

The whole renderer is three instanced passes and a few KB of shaders and buffers. PixiJS v8
would add about 200 KB minified (about 60 KB gzipped) and regl about 80 KB (27 KB gzipped) for
features this view never uses: a scene graph, text, filters. Owning the shaders also lets the
flipbook frame selection and aura pulse run entirely on the GPU, and keeps the texture-array
LRU under our control. If the view ever needs text or filters on the canvas, that trade
should be revisited.

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

STRESS_TABLE

## Running it

```bash
pnpm --filter @workspace/cosmograph build:world
# copy all module .js files into dist/public/world/machines and write its manifest.json
CHROME=/path/to/chrome python3 artifacts/cosmograph/scripts/stress-world.py \
  --renderers gpu,svg --sizes 341,5000,20000 --profiles desktop,phone
```
