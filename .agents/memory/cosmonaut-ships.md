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

**Per-cosmonaut ship look is a seed; the seed IS now broadcast over presence so others see your exact ship.**
**Why:** once accounts can save a ship, peers must see the *chosen* craft, not an id-derived one — so the seed travels on the wire (optional `s` on the pose msg + in the server tick snapshot). It's a short alphanumeric token (cheap). Peers still fall back to id-derived look when no seed is present (old clients / anon before first send).
**How to apply:** self seed lives in the store (`shipSeed`, init from per-browser `getSelfSeed()`); `PresenceBroadcaster.sendPose(...,shipSeed)` sends it; the api-server clamps it (alphanumeric ≤16) before rebroadcast — mirror that clamp anywhere a seed crosses a trust boundary (also `lib/ship.ts` sanitizeSeed for REST). `PeerShip` reads `peer.seed` into state and re-skins live when it changes.

**Account-saved ship: seed persisted to `users.ship_seed` via `GET/PUT /me/ship` (requireAuth).**
**Why:** a member's chosen ship should follow them across devices and be the one others see. Only the seed is stored — the look is always re-derived by `shipLookFromSeed`.
**How to apply:** `ShipBridge` (mounted by App next to EntitlementBridge) fetches the saved seed on sign-in and adopts it as the active seed **once per sign-in** (a `hydratedRef`), NOT on every React Query refetch — otherwise a background refetch clobbers a seed the user is mid-shuffle on. `savedShipSeed` is still updated every refetch to drive the Save button's dirty/disabled state. Save UI (Shuffle + Save + preview swatch) lives in `AccountIndicator`'s `ShipSaver`, signed-in only.

**Self-ship in orbit is "essentially transparent" (opacity ~0.16) AND has a localStorage-persisted show/hide toggle** (`showSelfShip`), surfaced in the Sidebar Navigate group only while in orbit mode. The user wanted it barely-there with the option to hide it entirely.
