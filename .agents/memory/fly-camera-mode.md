---
name: Fly (spaceship) camera mode
description: How Fly mode achieves a third-person spaceship chase feel and why it owns the camera directly instead of via OrbitControls.
---

Fly mode flies the single shared R3F camera directly; OrbitControls is unmounted
(`return null`) while in spaceship mode (except during a tour, which always
wins). The camera itself is still a free-flying first-person camera — the
**third-person chase look is a render trick, not a separate camera rig**:
`SelfShip` (Presence.tsx) draws the player's OWN ship opaque (`variant="peer"`),
locked at a fixed camera-space offset ahead-of+below the camera
(`FLY_SHIP_OFFSET`), so the flying camera reads as a chase cam sitting behind the
ship. The self ship shows ONLY in Fly now (it used to be an Orbit-only
translucent chase craft); Orbit/god mode has no ship. `showSelfShip` store state
is vestigial (no UI toggle).

**Why third-person:** the point is to let players see (and pay for nicer) ships.
PresenceBroadcaster still sends raw camera position, so peers see your ship at
the camera, slightly behind your on-screen chase ship — accepted, not worth the
complexity to reconcile.

**Why:** The user explicitly rejected the earlier Fly mode because it felt like
the same distant god view — it never changed perspective and speed ran away. The
fix is a perspective change (dive-in) plus bounded momentum flight, which
OrbitControls cannot express.

**How to apply:**
- Entering spaceship mode triggers a cinematic dive-in: capture current
  pos/quat, then in `useFrame` lerp position → `FLY_START` (low in the galactic
  plane, just outside the core) and slerp orientation → look-at-core over
  `FLY_ENTER_DUR`. A `flyEntering` ref gates input until the dive completes, then
  yaw/pitch are reseeded from the achieved quaternion. Do not let player input
  run during the dive or it fights the animation.
- Flight is momentum-based, not direct translate: accelerate a velocity vector,
  hard-clamp to `maxSpeed`, integrate by `delta`, damp by `1 - min(1, delta*k)`.
  The old `translateZ(velocity)` + `*0.9` model accumulated to ~thousands of
  units/sec — never reintroduce unbounded accumulation.
- Forward/strafe are applied in look-space (rotate intent by camera quaternion);
  vertical (Space/E up, Shift/Q down) uses **world up** so ascend/descend stay
  intuitive while pitched. Subtle roll on strafe sells the "spaceship" feel.
- Reset the key-state ref on mode entry and on window `blur`, or a key held
  during alt-tab sticks thrust on.
- Galaxy extent is ~2000, clusters ~500; `maxSpeed`/`FLY_START`/damping are tuned
  to that scale and need an in-browser pass (no GPU in the sandbox) to finalize.
- **Perceived scale lever:** Fly narrows the shared camera FOV on entry and Orbit
  restores it on entry (set imperatively + `updateProjectionMatrix()`); a wide FOV
  made the viewer feel "bigger than the planets." Tune scale in order FOV → maxSpeed
  → accel.
- **Chase-ship heading must copy the full camera quaternion** (`camera.quaternion`
  then flip 180° about Y, since the model nose is local +Z but the camera looks
  down -Z), NOT `setFromUnitVectors(forward, camDir)`. Shortest-arc from a single
  direction ignores "up", so pitching the camera induced a phantom sideways roll —
  controls didn't match on-screen motion. Add turn-banking (yaw-rate → roll about
  the forward axis) on top; it's a separate signal from the camera's strafe-roll,
  so no double-bank.
- **Thruster glow is ref-driven, not state:** a per-frame `thrustRef` (0..1, from
  camera/peer move speed ÷ ~240, clamped) feeds rear-engine sprites whose opacity/
  scale a child `useFrame` lerps (`dt*8`) — never a React prop, or every ship
  re-renders each frame. Reset thrust + prevPos on Fly (re)entry or the first
  frame's stale-delta spikes the glow.
- **Per-mode camera persistence:** each mode records its latest vantage every frame
  (Orbit: pos+orbit target; Fly: pos+yaw+pitch) and the mode-enter effects restore
  it instead of resetting — Fly skips the dive-in once it has a saved vantage.
  Record continuously in `useFrame`, NOT in a leave effect: OrbitControls unmounts
  the instant you enter Fly, so `orbitRef` is already null by the time a switch
  effect runs.
