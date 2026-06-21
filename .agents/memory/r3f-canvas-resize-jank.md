---
name: R3F canvas resize jank on panel toggle
description: Why animating a flex sibling's width makes the R3F galaxy stutter, and the debounce fix.
---

# R3F Canvas resize jank when a sibling panel animates width

The galaxy `<Canvas>` lives in a `flex-1` column next to the collapsible Flight
Console (`Sidebar`). Animating the console's `width` (rail ↔ open) shrinks/grows
the canvas column every frame.

**Symptom:** the console "shift" looks jagged/steppy — the 3D scene pops in
discrete jumps during the transition.

**Why:** R3F's default resize fires on every ResizeObserver tick, so each frame of
the width transition triggers a full WebGL buffer resize + camera-aspect recompute.
That per-frame renderer work can't hold 60fps and makes the scene stutter.

**Fix:** debounce the Canvas resize — `<Canvas resize={{ debounce: 150 }}>`. During
the transition the existing frame is cheaply CSS-scaled to fit the changing column,
then the buffer snaps to crisp resolution once layout settles (~150ms after the last
size change). Pair with a smooth easing on the width transition.

**How to apply:** any time an R3F Canvas shares layout with an animated/resizable
panel (collapsible sidebars, resizable splits, drawers), debounce the Canvas resize
instead of letting it re-size per frame. Don't reach for a new "dashboard/console"
library — this is the actual root cause.
