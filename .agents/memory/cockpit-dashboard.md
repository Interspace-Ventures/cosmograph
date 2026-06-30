---
name: Cockpit dashboard HUD
description: The galaxy's single bottom dashboard model that replaced the right "Mission Control" rail + top-right buttons; layering, full-bleed canvas, and where relocated controls went.
---

# Cockpit dashboard (the rail/right-push model is GONE)

All galaxy controls live in ONE bottom HUD (`Dashboard.tsx`) — account avatar,
Orbit/Fly toggle (+ self-ship eye in orbit), and the buttons that raise the rich
panels (Info, Ask Cosmos, Personalize) plus Tour/Sponsor/GitHub/Share. The rich
panels rise as bottom-anchored, centered, width-capped sheets just above the bar
(`Drawer.tsx`), identical on desktop and mobile. Desktop shows hover tooltips
(`Chrome` wraps each control); mobile shows a small persistent caption under each
icon (touch has no hover).

**Why:** the old right "Mission Control" rail (`Sidebar.tsx`, deleted) ate
horizontal width and forced an awkward right-push of the WebGL canvas; the
top-right Sponsor/GitHub/Share buttons (`HeaderActions` in Overlay, deleted) were
a second scattered control cluster. One bottom bar is cleaner and lets the galaxy
fill the screen.

**How to apply / rules that move together:**
- The galaxy `<Canvas>` is full-bleed again — `App.tsx` Scene div is `absolute
  inset-0`, transform-only (a desktop `translateX` nudge for DetailPanel
  occlusion), NO width-confine/right-inset resize. Do not re-introduce a
  canvas-resize "push"; there's no panel on the right to make room for anymore.
- Layering: Dashboard bar is `z-30` glass (`bg-bg/80 backdrop-blur-xl`); drawers
  rise above at `z-50`; the top notification banner (`BannerHost`) is `z-40` and
  now spans full width (no console right-offset). Overlay base subtree is `z-10`.
- `BannerHost` and `FlyCockpit` dropped all `consoleOpen`/`isMobile` right-offset
  logic — full width. `Footer` sits just above the bar (`bottom-[4.25rem]`,
  desktop-only `hidden md:flex`).
- DetailPanel (`Overlay.tsx`) bottom offset bumped to clear the bar
  (`bottom-[5.5rem]` on mobile); its guard is just `selectedObject` now (the old
  `!(isMobile && consoleOpen)` console-collision guard is gone).
- Relocated bits: the expanded `AccountIndicator` (Full-access badge + ShipSaver,
  so ship save/shuffle survives) moved to the TOP of `CustomizeDrawer.tsx`,
  wrapped in `<div className="mb-5 empty:hidden">` so it collapses when signed
  out. The avatar-only `AccountIndicatorRail` stays in the Dashboard bar.
- Icon-only `DashButton`s must pass a `label` (used as `aria-label`) — the
  tooltip/caption alone does not give screen readers an accessible name.
- `consoleOpen` still exists in the store but is vestigial/harmless; nothing in
  the layout reads it anymore.
