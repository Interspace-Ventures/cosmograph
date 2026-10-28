#!/usr/bin/env python3
"""Stress harness for /world: first load, ready time, fps while panning, memory.

  CHROME=/path/to/chrome python3 scripts/stress-world.py [--sizes 341,5000,20000]
      [--profiles desktop,phone] [--renderers gpu,svg] [--dist dist/public]

Per run: a fresh page and cache; navigate to /world#overview[&stress=N][&svg];
first-load bytes (encoded, over the wire) until ready + 2 s; DCL and ready time;
then three scripted 3.5 s pans with +-15% zoom breathing (overview = whole world,
mid = z .2 desktop / .09 phone, close = z .62 / .3, on the first island with
machines), each after a 2.5 s settle; fps = rAF frames / time in the page.
Phone = 390 x 844, DPR 3, touch, CPU throttled 4x through CDP.

The test Chrome has no GPU: WebGL runs on SwiftShader (CPU), so every number is
a CPU-rendered floor, not device performance.
"""

import argparse
import asyncio
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from world_cdp import Chrome, Page  # noqa: E402

APP = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

PAN = """(async (secs) => {
  const w = window.__cgwWorld; const c0 = w.cam();
  const W = innerWidth, H = innerHeight; let frames = 0; const t0 = performance.now();
  await new Promise((res) => { const step = (t) => { frames++; const u = (t - t0) / 1000;
    w.setCam(c0.x + Math.sin(u * 1.3) * W * 0.22 / c0.z, c0.y + Math.cos(u * 1.1) * H * 0.18 / c0.z, c0.z * (1 + 0.15 * Math.sin(u * 2)));
    if (t - t0 < secs * 1000) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
  const fps = frames / ((performance.now() - t0) / 1000);
  w.setCam(c0.x, c0.y, c0.z);
  return Math.round(fps * 10) / 10; })"""


async def run(chrome: Chrome, base: str, n: int, profile: str, renderer: str):
    page = await Page.open(chrome)
    reqs: dict[str, dict] = {}
    t_nav = [0.0]

    def on(d):
        m, p = d["method"], d["params"]
        if m == "Network.responseReceived":
            reqs.setdefault(p["requestId"], {})["url"] = p["response"]["url"]
        elif m == "Network.loadingFinished":
            reqs.setdefault(p["requestId"], {})["bytes"] = p.get("encodedDataLength", 0)
            reqs[p["requestId"]]["t"] = time.time() - t_nav[0]

    page.listeners.append(on)
    for dom in ("Network", "Page", "Runtime"):
        await page.send(f"{dom}.enable")
    await page.send("Network.setCacheDisabled", {"cacheDisabled": True})
    await page.send("Network.clearBrowserCache")
    phone = profile == "phone"
    await page.send(
        "Emulation.setDeviceMetricsOverride",
        {"width": 390 if phone else 1440, "height": 844 if phone else 900, "deviceScaleFactor": 3 if phone else 1, "mobile": phone},
    )
    await page.send("Emulation.setTouchEmulationEnabled", {"enabled": phone})
    await page.send("Emulation.setCPUThrottlingRate", {"rate": 4 if phone else 1})
    hash_ = "overview" + (f"&stress={n}" if n != 341 else "") + ("&svg" if renderer == "svg" else "")
    t_nav[0] = time.time()
    await page.send("Page.navigate", {"url": f"{base}/world#{hash_}"})
    ok = await page.wait_world(240, 0.05)
    ready = time.time() - t_nav[0]
    if not ok:
        await page.close()
        return {"n": n, "profile": profile, "renderer": renderer, "error": "not ready"}
    dcl = await page.eval("performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd")
    # ground ready: the GPU tier's first view fully streamed
    if renderer == "gpu":
        await page.wait_for("(()=>{const g=window.__cgwWorld.stats().gpu;return !g||(g.tilesDrawn>0&&g.tilesFetched>0&&window.__cgwWorld.stats().gpu.tileBytes>0)})()", 60, 0.05)
    ground = time.time() - t_nav[0]
    await asyncio.sleep(2)
    first = sum(r.get("bytes", 0) for r in reqs.values())
    tile_first = sum(r.get("bytes", 0) for r in reqs.values() if "/world/pyramid/" in r.get("url", ""))
    st0 = await page.eval("JSON.stringify(window.__cgwWorld.stats())")
    out = {
        "n": n,
        "profile": profile,
        "renderer": json.loads(st0).get("renderer", "svg"),
        "machines": json.loads(st0)["machines"],
        "firstKB": round(first / 1024),
        "firstTileKB": round(tile_first / 1024),
        "dclMs": round(dcl),
        "readyS": round(ready, 2),
        "groundS": round(ground, 2),
    }
    dv = await page.eval("JSON.stringify(window.__cgwWorld.domainView(0))")
    dv = json.loads(dv) if dv else None
    for mode, z in (("overview", None), ("mid", 0.09 if phone else 0.2), ("close", 0.3 if phone else 0.62)):
        if mode == "overview":
            await page.eval("window.__cgwWorld.fit()")
        else:
            await page.eval(f"window.__cgwWorld.setCam({dv['x']},{dv['y']},{z})")
        await asyncio.sleep(2.5)
        out[f"fps_{mode}"] = await page.eval(f"({PAN})(3.5)", 60)
        st = json.loads(await page.eval("JSON.stringify(window.__cgwWorld.stats())"))
        g = st.get("gpu") or {}
        out[f"q_{mode}"] = g.get("quality")
        out[f"sprites_{mode}"] = g.get("sprites")
    st = json.loads(await page.eval("JSON.stringify(window.__cgwWorld.stats())"))
    g = st.get("gpu") or {}
    out.update(
        {
            "heapMB": st.get("heapMB"),
            "maxLoadedModules": st.get("maxLoadedModules"),
            "gpuTexMB": g.get("gpuTexMB"),
            "tileKB": round(g.get("tileBytes", 0) / 1024) if g else None,
            "tilesFetched": g.get("tilesFetched"),
            "flipKB": round(g.get("flipBytes", 0) / 1024) if g else None,
            "flipPages": g.get("flipPagesFetched"),
            "totalKB": round(sum(r.get("bytes", 0) for r in reqs.values()) / 1024),
        }
    )
    await page.send("Emulation.setCPUThrottlingRate", {"rate": 1})
    await page.send("Page.navigate", {"url": "about:blank"})
    await page.close()
    return out


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", default=os.path.join(APP, "dist", "public"))
    ap.add_argument("--sizes", default="341,5000,20000")
    ap.add_argument("--profiles", default="desktop,phone")
    ap.add_argument("--renderers", default="gpu")
    ap.add_argument("--port", type=int, default=4198)
    ap.add_argument("--out", default="stress-results.jsonl")
    a = ap.parse_args()
    srv = subprocess.Popen(["node", os.path.join(APP, "scripts", "serve-world.mjs"), a.dist, str(a.port)], stdout=subprocess.DEVNULL)
    time.sleep(0.6)
    try:
        for r in a.renderers.split(","):
            for prof in a.profiles.split(","):
                for n in [int(x) for x in a.sizes.split(",")]:
                    chrome = Chrome(9336)
                    try:
                        res = await run(chrome, f"http://127.0.0.1:{a.port}", n, prof, r)
                    except Exception as e:  # keep going: one bad run should not lose the table
                        res = {"n": n, "profile": prof, "renderer": r, "error": str(e)[:300]}
                    finally:
                        chrome.close()
                    print(json.dumps(res), flush=True)
                    with open(a.out, "a") as f:
                        f.write(json.dumps(res) + "\n")
    finally:
        srv.terminate()


if __name__ == "__main__":
    asyncio.run(main())
