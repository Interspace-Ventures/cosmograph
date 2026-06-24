---
name: R3F canvas resize vs. transform on console toggle
description: Why the galaxy canvas is width-confined (resized) on console toggle for a real "push", and why the earlier translate-only approach was reverted.
---

# R3F Canvas: console toggle resizes the canvas (real push), it does NOT translate

The galaxy `<Canvas>` (EffectComposer/Bloom) shares the viewport with the right-side
Mission Control console (`Sidebar`, an `absolute right-0` overlay).

## Current (correct) approach — confine the canvas, accept one debounced snap
The Scene-wrapping div in `App.tsx` is `absolute inset-y-0 left-0` with an inline
`right` inset equal to the **live Sidebar width** (`0` during intro,
`min(12rem,80vw)` when console open, `3.5rem` rail when closed — these must match the
Sidebar's `w-14` / `w-[min(12rem,80vw)]`). Opening/closing the console changes the
canvas width, so the galaxy is genuinely **pushed** into the remaining space and never
hidden under the panel. `<Canvas resize={{ debounce: 150 }}>` coalesces the 450ms
push transition into a **single buffer snap after layout settles** (minor end-snap is
the accepted cost). Selected-object occlusion by the top-left floating `DetailPanel`
is handled separately with a desktop-only `translateX` nudge (`8rem`) on the same
container — a pure transform (no resize) so picking planets stays smooth.

## Why the earlier translate-only approach was REVERTED — do not flip it back
Previously the canvas was full-bleed `absolute inset-0` and only slid with
`translateX(calc(... * -0.5))` to avoid resizing the WebGL/bloom buffers. That is
smoother (no realloc, no snap) and recenters a centered galaxy correctly **on paper**,
BUT the full-bleed canvas still extends *under* the console, so its right side / outer
planets stay hidden behind the panel. Users read this as "the sidebar just hides
content, it doesn't push it." A translate cannot shrink the galaxy to fit; only
resizing the canvas (narrower aspect/FOV fit) actually makes room. So we accepted the
debounced-resize snap as the price of a true push.

**Why (root tradeoff):** WebGL/postprocessing buffer reallocation is the expensive,
janky part — but it is also the ONLY thing that produces genuine content reservation.
Debouncing makes the realloc happen once (after the transition) instead of per frame.

**How to apply:** when an R3F Canvas shares layout with a collapsible panel and the
product requirement is "push, don't overlay/hide", confine the canvas width and
debounce its resize. Use transform-only sliding only when recentering (not making
room) is acceptable. Keep panel-open state in the store (`consoleOpen`) so canvas and
panel stay in sync. Don't re-introduce a flex sibling (that resizes per frame, no
debounce) and don't reach for a "dashboard/console" library.
