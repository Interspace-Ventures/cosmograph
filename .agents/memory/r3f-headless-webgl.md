---
name: R3F headless WebGL limitation
description: Why screenshot/app_preview shows a WebGL error for the Galaxy 3D app even though it works
---

The `screenshot` / app_preview tool AND the `runTest` (Playwright) testing subagent both
run a headless browser with NO GPU (`VENDOR = 0xffff, DEVICE = 0xffff`), so any React
Three Fiber / Three.js app throws "Error creating WebGL context" there and the dev
runtime-error overlay covers the page.

**Why:** This is an environment limitation, not a code bug. Real user browsers (and the
user's preview pane) have a GPU and render fine.

**runTest can't e2e this app:** automated UI testing is effectively blocked for the galaxy
— every flow gates behind the WebGL canvas, and after repeated context-creation failures
the page blanks (white, no buttons), so runTest reports false "failures" that are really
the GPU-less harness. Don't keep re-running it; validate via typecheck + manual real-browser
pass instead.

**No graceful degradation (as of 2026-06):** the app has NO React error boundary and NO
WebGL-availability fallback, so a real visitor whose browser/GPU can't do WebGL gets the
same blank screen, not a friendly message. Worth adding before any public/"friends & family"
share.

**How to apply:** Do NOT chase WebGL-context errors seen only in screenshots. Verify R3F
apps via `pnpm --filter @workspace/<slug> run typecheck` and by checking workflow/browser
console logs for *non-WebGL* runtime errors instead. `THREE.Clock ... deprecated` and
`WebGLRenderer: Context Lost` during HMR are harmless.
