---
name: Cosmonaut presence ships
description: How peer + self avatars render in the multiplayer presence layer, and the non-obvious design choices behind them.
---

Presence peers and the viewer's own avatar are both small low-poly ships (replacing the old glow "wisps"). Ship model nose points local +Z so callers orient via `quaternion.setFromUnitVectors(FORWARD, dir)`.

**Self-ship in orbit is a small constant-apparent-size sprite, NOT a big chase craft.**
**Why:** the user explicitly wanted it to read like a distant cosmonaut sprite — "your view is like a satellite looking at the entire galaxy," so your own ship should look small/out-there, not a translucent craft filling the lower frame.
**How to apply:** place it at a *fixed camera-space offset* (so apparent size is zoom-independent), keep its scale small, give it a glow so it matches peer sprites. Only show it in `cameraMode === "god"` (orbit) — in fly mode you're inside the cockpit so it's hidden.

**Graceful entry gate:** peers (and the "More cosmonauts arriving" toast) are held back ~9s after a session starts (`REVEAL_DELAY_MS` in `presence.ts`), so a new arrival can orient before others fade in. Timer is scheduled once per session in `start()` (reconnects don't reset it) and cleared in `stop()`.
**Why:** seeing peers pop in instantly on arrival is disorienting.

Both peers and self-ship are gated out of capture/screenshot paths via `!captureTopDown`, and presence is scoped to the canonical default galaxy (`datasetVersion === 0`).

**Per-cosmonaut ship variety is derived client-side from a seed — the presence wire protocol is NOT touched.**
**Why:** peer ids are already stable and unique, so hashing each into a look (hull tint, glow, accent, scale) makes every cosmonaut distinct with zero extra bytes broadcast; adding a config field to the protocol would be needless cost/complexity.
**How to apply:** peers seed from their presence id; the viewer's own ship seeds from a per-browser persisted value so "your ship" stays consistent across visits. When account-saved/customizable ships land, the saved config overrides the local seed for self, and only THEN does broadcasting a look over the wire become worth it (so others see your chosen ship).

**Self-ship in orbit is "essentially transparent" (opacity ~0.16) AND has a localStorage-persisted show/hide toggle** (`showSelfShip`), surfaced in the Sidebar Navigate group only while in orbit mode. The user wanted it barely-there with the option to hide it entirely.
