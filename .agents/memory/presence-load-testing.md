---
name: Presence load testing
description: How to load-test the presence WebSocket, and the verified concurrency bounds.
---

# Presence load testing

The presence layer (`api-server/src/presence/server.ts`) was load-verified to **100 concurrent clients**: all connect, `peers[]` snapshot caps at exactly 60 (`MAX_RENDER_PEERS`), headcount reports the true `clients.size`, and every client keeps receiving the ~10 Hz `state` tick with zero drops/errors. Server fans out one pre-serialized payload per tick, so cost is ~1 stringify/tick regardless of headcount.

**How to bench it:** the per-IP cap (`MAX_PER_IP=4`) + handshake-rate limit block a naive flood from one host. `clientIp()` takes the **last** `X-Forwarded-For` entry, so connect **directly to the service port** (`ws://127.0.0.1:8080/api/presence`, not through the :80 proxy — the proxy overwrites XFF) and set a **distinct `X-Forwarded-For` per socket** to simulate distinct IPs. `ws` only resolves inside a package that depends on it (e.g. run the script from `artifacts/api-server`), not from the workspace root.

**Why:** proving the "100 people on the same scientist" scenario needs real distinct-IP connections; the abuse guards otherwise reject same-IP bursts after 4.

**How to apply:** reuse this XFF-varying direct-port approach for any future presence concurrency test; don't try to route load through the shared proxy.
