#!/usr/bin/env python3
"""Bake the /world GPU tier's assets from the built app, in headless Chrome.

  1. pyramid : a deep-zoom image pyramid of the whole world. Every level is
               rendered by the world's own SVG renderer at that level's zoom
               (#bake=pyramid), so each level looks exactly like v9 at that zoom
               (non-scaling strokes, planet tint, overview marks), then cut into
               256 px WebP tiles with alpha. Empty tiles are not written.
  2. flip    : a looping flipbook per machine. Each machine's real live module is
               mounted (#bake=flip) and screenshotted at rest, then while it runs
               its own test animation; frames are 96 x 64 px (rendered at 2x and
               downsampled), packed into WebP atlas pages.

Writes tiles/pages under public/world/{pyramid,flip}/ and their manifests to
src/world/data/{pyramid,flip}.json (baked into the world chunk).

Run after `vite build` (VITE_RELEASE_CHANNEL=internal so /world is routable):

  CHROME=/path/to/chrome python3 scripts/bake-world.py [--modules DIR] [--only pyramid|flip]

--modules points at all machine modules (*.js); they are copied into the served
dist for the bake only. Needs Python 3.10+, Pillow, websockets.
"""

import argparse
import asyncio
import base64
import hashlib
import io
import json
import math
import os
import shutil
import subprocess
import sys
import time

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from world_cdp import Chrome, Page  # noqa: E402

APP = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TILE = 256
VIEW = 2048  # px per screenshot: 8 x 8 tiles
S0 = 0.5  # finest level, px per world unit
CELL = (96, 64)
FRAMES = 6
FPS = 6
PAGE_COLS, PAGE_ROWS = 10, 16  # 960 x 1024 px pages, 160 cells

TRANSPARENT = "html,body,#root{background:transparent!important}"


def log(*a):
    print("[bake]", *a, flush=True)


def _prior(out_dir: str) -> float:
    """Wall seconds spent by earlier, interrupted runs of a resumed bake."""
    try:
        return float(open(os.path.join(out_dir, ".seconds")).read())
    except Exception:
        return 0.0


def _add_seconds(out_dir: str, sec: float):
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, ".seconds"), "w") as f:
        f.write(str(_prior(out_dir) + sec))


async def open_world(page: Page, url: str, w: int, h: int):
    await page.send("Page.enable")
    await page.send("Runtime.enable")
    await page.send("Emulation.setDeviceMetricsOverride", {"width": w, "height": h, "deviceScaleFactor": 1, "mobile": False})
    await page.send("Emulation.setDefaultBackgroundColorOverride", {"color": {"r": 0, "g": 0, "b": 0, "a": 0}})
    await page.send("Page.navigate", {"url": url})


async def transparent(page: Page):
    await page.eval(f"(()=>{{const s=document.createElement('style');s.textContent={json.dumps(TRANSPARENT)};document.head.appendChild(s)}})()")


async def bake_pyramid(page: Page, base: str, out_dir: str, data_dir: str, levels_only: int | None = None, resume: bool = False):
    t0 = time.time()
    await open_world(page, f"{base}/world#bake=pyramid", VIEW, VIEW)
    if not await page.wait_for("!!(window.__cgwWorld && window.__cgwWorld.bakeIdle)", 90):
        raise SystemExit("world did not mount (is the build internal-channel?)")
    await transparent(page)
    # warm the thumbnail atlas so pictures are decoded before any screenshot
    await page.eval(
        """(async()=>{const a=await fetch('/world/atlas/atlas.json').then(r=>r.ok?r.json():null).catch(()=>null);
        if(!a) return 0; await Promise.all(a.sheets.map(s=>new Promise(r=>{const i=new Image();i.onload=i.onerror=r;i.src='/world/atlas/'+s.file+'?v='+s.v;})));return a.sheets.length})()"""
    )
    fp = await page.eval("window.__cgwWorld.fingerprint()")
    bx0, by0, bx1, by1 = await page.eval("window.__cgwWorld.bounds()")
    ox, oy = math.floor(bx0), math.floor(by0)
    levels = []
    L = 0
    if os.path.isdir(out_dir) and not resume:
        shutil.rmtree(out_dir)
    total = 0
    count = 0
    digest = hashlib.sha256()
    while True:
        s = S0 / (2**L)
        cols = max(1, math.ceil((bx1 - ox) * s / TILE))
        rows = max(1, math.ceil((by1 - oy) * s / TILE))
        bits = bytearray((cols * rows + 7) // 8)
        os.makedirs(f"{out_dir}/L{L}", exist_ok=True)
        per = VIEW // TILE
        for ry in range(math.ceil(rows / per)):
            for rx in range(math.ceil(cols / per)):
                mark = f"{out_dir}/L{L}/.done_{rx}_{ry}"
                if resume and os.path.exists(mark):
                    continue
                cx = ox + (rx * VIEW + VIEW / 2) / s
                cy = oy + (ry * VIEW + VIEW / 2) / s
                await page.eval(f"window.__cgwWorld.setCam({cx},{cy},{s})")
                await asyncio.sleep(0.2)
                ok = 0
                t1 = time.time()
                while ok < 3 and time.time() - t1 < 40:
                    ok = ok + 1 if await page.eval("window.__cgwWorld.bakeIdle()") else 0
                    await asyncio.sleep(0.15)
                await page.eval("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
                await asyncio.sleep(0.25)
                img = Image.open(io.BytesIO(await page.screenshot(VIEW, VIEW))).convert("RGBA")
                for ty in range(per):
                    for tx in range(per):
                        c, r = rx * per + tx, ry * per + ty
                        if c >= cols or r >= rows:
                            continue
                        tile = img.crop((tx * TILE, ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE))
                        if tile.getchannel("A").getextrema()[1] < 8:
                            continue
                        buf = io.BytesIO()
                        tile.save(buf, "WEBP", quality=80, alpha_quality=85, method=5)
                        with open(f"{out_dir}/L{L}/{c}_{r}.webp", "wb") as f:
                            f.write(buf.getvalue())
                open(mark, "w").close()
        # tiles on disk are the source of truth (a resumed bake wrote some of them earlier)
        for r in range(rows):
            for c in range(cols):
                fn = f"{out_dir}/L{L}/{c}_{r}.webp"
                if not os.path.exists(fn):
                    continue
                b = open(fn, "rb").read()
                digest.update(b)
                total += len(b)
                count += 1
                i = r * cols + c
                bits[i >> 3] |= 1 << (i & 7)
        levels.append({"s": s, "cols": cols, "rows": rows, "has": base64.b64encode(bytes(bits)).decode()})
        log(f"pyramid L{L} s={s:g} {cols}x{rows} tiles, {sum(bin(x).count('1') for x in bits)} kept, {time.time() - t0:.0f} s")
        if (cols <= 1 and rows <= 1) or (levels_only and L + 1 >= levels_only):
            break
        L += 1
    man = {
        "schema": 1,
        "tile": TILE,
        "origin": [ox, oy],
        "extent": [bx0, by0, bx1, by1],
        "fingerprint": fp,
        "v": digest.hexdigest()[:12],
        "base": None,
        "levels": levels,
        "bytes": total,
        "tiles": count,
        "bakeSeconds": round(time.time() - t0 + _prior(out_dir), 1),
    }
    with open(f"{data_dir}/pyramid.json", "w") as f:
        json.dump(man, f, separators=(",", ":"))
    log(f"pyramid: {count} tiles, {total/1e6:.2f} MB, {len(levels)} levels, {man['bakeSeconds']} s")
    return man


async def bake_flip(page: Page, base: str, out_dir: str, data_dir: str, resume: bool = False):
    t0 = time.time()
    cols, rows = 10, 4  # 40 live machines per batch keeps each batch short on a CPU-only box
    cw, ch = CELL[0] * 2, CELL[1] * 2
    W, H = cols * cw, rows * ch
    await open_world(page, f"{base}/world#bake=flip", W, H)
    if not await page.wait_for("!!(window.__cgwBake && window.__cgwBake.ready)", 90):
        raise SystemExit("flip bake page did not mount")
    await transparent(page)
    slugs = await page.eval("window.__cgwBake.slugs()")
    frames: dict[str, list[Image.Image]] = {}
    per = cols * rows
    fdir = out_dir + ".frames"  # per-machine frame strips, so an interrupted bake resumes by batch
    os.makedirs(fdir, exist_ok=True)

    def have(slug):
        return os.path.exists(os.path.join(fdir, slug + ".png")) or os.path.exists(os.path.join(fdir, slug + ".none"))

    for start in range(0, len(slugs), per):
        if resume and all(have(s_) for s_ in slugs[start : start + per]):
            for s_ in slugs[start : start + per]:
                fn = os.path.join(fdir, s_ + ".png")
                if os.path.exists(fn):
                    strip = Image.open(fn).convert("RGBA")
                    frames[s_] = [strip.crop((k * CELL[0], 0, (k + 1) * CELL[0], CELL[1])) for k in range(FRAMES)]
            log(f"flip: batch {start // per + 1} cached")
            continue
        t1 = time.time()
        laid = await page.eval(f"window.__cgwBake.show({start},{per},{cols})", 180)
        log(f"flip: batch {start // per + 1} mounted in {time.time() - t1:.0f} s")
        await asyncio.sleep(0.6)
        shots = [Image.open(io.BytesIO(await page.screenshot(W, H))).convert("RGBA")]
        await page.eval("window.__cgwBake.start()")
        await asyncio.sleep(0.3)
        for _ in range(FRAMES - 1):
            await asyncio.sleep(0.35)
            shots.append(Image.open(io.BytesIO(await page.screenshot(W, H))).convert("RGBA"))
        for i, slug in enumerate(laid):
            if not slug:
                continue
            x, y = (i % cols) * cw, (i // cols) * ch
            frames[slug] = [s.crop((x, y, x + cw, y + ch)).resize(CELL, Image.LANCZOS) for s in shots]
            strip = Image.new("RGBA", (CELL[0] * FRAMES, CELL[1]))
            for k, fr in enumerate(frames[slug]):
                strip.paste(fr, (k * CELL[0], 0))
            strip.save(os.path.join(fdir, slug + ".png"))
        for s_ in slugs[start : start + per]:
            if s_ not in frames:
                open(os.path.join(fdir, s_ + ".none"), "w").close()
        log(f"flip: batch {start // per + 1}, {sum(1 for s in laid if s)} machines, {time.time() - t0:.0f} s")
    if os.path.isdir(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir)
    per_page = (PAGE_COLS * PAGE_ROWS) // FRAMES
    pages, slots = [], {}
    total = 0
    order = [s for s in slugs if s in frames]
    for p in range(math.ceil(len(order) / per_page)):
        img = Image.new("RGBA", (PAGE_COLS * CELL[0], PAGE_ROWS * CELL[1]), (0, 0, 0, 0))
        for j, slug in enumerate(order[p * per_page : (p + 1) * per_page]):
            c0 = j * FRAMES
            for f, fr in enumerate(frames[slug]):
                k = c0 + f
                img.paste(fr, ((k % PAGE_COLS) * CELL[0], (k // PAGE_COLS) * CELL[1]))
            slots[slug] = [p, c0]
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=78, alpha_quality=85, method=5)
        b = buf.getvalue()
        name = f"p{p}.webp"
        with open(f"{out_dir}/{name}", "wb") as f:
            f.write(b)
        total += len(b)
        pages.append({"file": name, "v": hashlib.sha256(b).hexdigest()[:12], "bytes": len(b)})
    man = {
        "schema": 1,
        "cell": list(CELL),
        "frames": FRAMES,
        "fps": FPS,
        "cols": PAGE_COLS,
        "rows": PAGE_ROWS,
        "page": [PAGE_COLS * CELL[0], PAGE_ROWS * CELL[1]],
        "pages": pages,
        "slots": slots,
        "base": None,
        "bytes": total,
        "bakeSeconds": round(time.time() - t0, 1),
    }
    with open(f"{data_dir}/flip.json", "w") as f:
        json.dump(man, f, separators=(",", ":"))
    log(f"flip: {len(slots)} machines, {len(pages)} pages, {total/1e6:.2f} MB, {man['bakeSeconds']} s")
    return man


def stage_modules(dist: str, mod_dir: str):
    """Copy every module into the served dist with a manifest (bake only)."""
    dst = os.path.join(dist, "world", "machines")
    os.makedirs(dst, exist_ok=True)
    mods = {}
    for f in sorted(os.listdir(mod_dir)):
        if not f.endswith(".js"):
            continue
        b = open(os.path.join(mod_dir, f), "rb").read()
        open(os.path.join(dst, f), "wb").write(b)
        mods[f[:-3]] = hashlib.sha256(b).hexdigest()[:12]
    json.dump({"schema": 1, "version": "bake", "base": None, "modules": mods}, open(os.path.join(dst, "manifest.json"), "w"))
    log(f"staged {len(mods)} modules")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", default=os.path.join(APP, "dist", "public"))
    ap.add_argument("--modules", default=None)
    ap.add_argument("--only", choices=["pyramid", "flip"], default=None)
    ap.add_argument("--levels", type=int, default=None, help="pyramid: stop after this many levels (testing)")
    ap.add_argument("--port", type=int, default=4199)
    ap.add_argument("--out", default=None, help="write tiles/pages here instead of public/world (e.g. a persistent cache)")
    ap.add_argument("--resume", action="store_true", help="keep finished pyramid chunks / flip batches from an interrupted run")
    a = ap.parse_args()
    if a.modules:
        stage_modules(a.dist, a.modules)
    srv = subprocess.Popen(["node", os.path.join(APP, "scripts", "serve-world.mjs"), a.dist, str(a.port)], stdout=subprocess.DEVNULL)
    time.sleep(0.6)
    chrome = None
    data = os.path.join(APP, "src", "world", "data")
    pub = a.out or os.path.join(APP, "public", "world")
    try:
        chrome = Chrome(9334, webgl=False)  # both bakes render the SVG world; no WebGL needed
        base = f"http://127.0.0.1:{a.port}"
        if a.only in (None, "flip"):
            page = await Page.open(chrome)
            await bake_flip(page, base, os.path.join(pub, "flip"), data, a.resume)
            await page.close()
        if a.only in (None, "pyramid"):
            page = await Page.open(chrome)
            t_run = time.time()
            try:
                await bake_pyramid(page, base, os.path.join(pub, "pyramid"), data, a.levels, a.resume)
            finally:
                if a.resume:
                    _add_seconds(os.path.join(pub, "pyramid"), time.time() - t_run)
            await page.close()
    finally:
        if chrome:
            chrome.close()
        srv.terminate()


if __name__ == "__main__":
    asyncio.run(main())
