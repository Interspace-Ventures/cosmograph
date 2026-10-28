"""Minimal Chrome DevTools Protocol client for the world baker and stress harness.

Launches headless Chrome (CHROME env var, or chrome/chromium on PATH) with WebGL
via SwiftShader (no GPU needed), opens one page, and offers send/evaluate.
Needs Python 3.10+ and `websockets`.
"""

import asyncio
import base64
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.request

import websockets


def chrome_bin() -> str:
    for c in (os.environ.get("CHROME"), shutil.which("chrome-headless-shell"), shutil.which("chromium"), shutil.which("google-chrome")):
        if c:
            return c
    raise SystemExit("set CHROME=/path/to/chrome (headless shell is fine)")


class Chrome:
    def __init__(self, port: int = 9333, extra: list[str] | None = None):
        self.port = port
        self.dir = tempfile.mkdtemp(prefix="cgw-chrome-")
        args = [
            chrome_bin(),
            "--headless=new",
            f"--remote-debugging-port={port}",
            f"--user-data-dir={self.dir}",
            "--no-first-run",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--hide-scrollbars",
            "--mute-audio",
            # WebGL2 without a GPU: ANGLE on SwiftShader (CPU rasteriser)
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            "--ignore-gpu-blocklist",
            "--enable-precise-memory-info",
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
            *(extra or []),
            "about:blank",
        ]
        self.proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        # localhost only: never through an HTTP(S)_PROXY from the environment
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        for _ in range(100):
            try:
                with opener.open(f"http://127.0.0.1:{port}/json/list", timeout=1) as r:
                    pages = [p for p in json.load(r) if p.get("type") == "page"]
                if pages:
                    self.ws_url = pages[0]["webSocketDebuggerUrl"]
                    return
            except Exception:
                pass
            time.sleep(0.2)
        raise RuntimeError("chrome did not start")

    def close(self):
        self.proc.terminate()
        try:
            self.proc.wait(5)
        except Exception:
            self.proc.kill()
        shutil.rmtree(self.dir, ignore_errors=True)


class Page:
    def __init__(self, ws):
        self.ws = ws
        self.n = 0
        self.pending: dict[int, asyncio.Future] = {}
        self.listeners = []
        self.reader = asyncio.ensure_future(self._read())

    @classmethod
    async def open(cls, chrome: Chrome):
        try:
            ws = await websockets.connect(chrome.ws_url, max_size=1 << 28, proxy=None)
        except TypeError:  # websockets < 15 has no proxy support to turn off
            ws = await websockets.connect(chrome.ws_url, max_size=1 << 28)
        return cls(ws)

    async def _read(self):
        async for msg in self.ws:
            d = json.loads(msg)
            if "id" in d and d["id"] in self.pending:
                f = self.pending.pop(d["id"])
                if "error" in d:
                    f.set_exception(RuntimeError(json.dumps(d["error"])))
                else:
                    f.set_result(d.get("result", {}))
            elif "method" in d:
                for fn in self.listeners:
                    fn(d)

    async def send(self, method: str, params: dict | None = None, timeout: float = 120):
        self.n += 1
        f = asyncio.get_event_loop().create_future()
        self.pending[self.n] = f
        await self.ws.send(json.dumps({"id": self.n, "method": method, "params": params or {}}))
        return await asyncio.wait_for(f, timeout)

    async def eval(self, expr: str, timeout: float = 120):
        r = await self.send(
            "Runtime.evaluate",
            {"expression": expr, "awaitPromise": True, "returnByValue": True},
            timeout,
        )
        if "exceptionDetails" in r:
            raise RuntimeError(json.dumps(r["exceptionDetails"])[:800])
        return r.get("result", {}).get("value")

    async def wait_for(self, expr: str, timeout: float = 60, every: float = 0.15):
        t0 = time.time()
        while time.time() - t0 < timeout:
            try:
                if await self.eval(expr, 10):
                    return True
            except Exception:
                pass
            await asyncio.sleep(every)
        return False

    async def screenshot(self, w: int, h: int, fmt: str = "png") -> bytes:
        r = await self.send(
            "Page.captureScreenshot",
            {"format": fmt, "clip": {"x": 0, "y": 0, "width": w, "height": h, "scale": 1}},
        )
        return base64.b64decode(r["data"])

    async def close(self):
        self.reader.cancel()
        await self.ws.close()
