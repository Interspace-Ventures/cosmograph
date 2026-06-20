---
name: Fly (spaceship) camera mode
description: How Fly mode achieves a first-person spaceship feel and why it owns the camera directly instead of via OrbitControls.
---

Fly mode is a true first-person flight that takes over the single shared R3F
camera directly; OrbitControls is unmounted (`return null`) while in spaceship
mode (except during a tour, which always wins).

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
