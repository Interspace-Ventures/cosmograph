---
name: R3F headless WebGL limitation
description: Why screenshot/app_preview shows a WebGL error for the Galaxy 3D app even though it works
---

The `screenshot` / app_preview tool runs a headless browser with NO GPU
(`VENDOR = 0xffff, DEVICE = 0xffff`), so any React Three Fiber / Three.js app throws
"Error creating WebGL context" there and the dev runtime-error overlay covers the page.

**Why:** This is an environment limitation, not a code bug. Real user browsers (and the
user's preview pane) have a GPU and render fine.

**How to apply:** Do NOT chase WebGL-context errors seen only in screenshots. Verify R3F
apps via `pnpm --filter @workspace/<slug> run typecheck` and by checking workflow/browser
console logs for *non-WebGL* runtime errors instead. `THREE.Clock ... deprecated` and
`WebGLRenderer: Context Lost` during HMR are harmless.
