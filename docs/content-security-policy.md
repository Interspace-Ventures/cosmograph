# Content Security Policy

Cosmograph sends a strict, nonce-based CSP on every response
(`artifacts/api-server/src/security/csp.ts`). It enforces the EXO platform rule:
no third-party JavaScript.

## The policy

```
default-src 'self';
script-src 'nonce-<random per response>' 'strict-dynamic' https: 'unsafe-inline';
script-src-attr 'none';
style-src 'self' 'unsafe-inline';
font-src 'self' data:;
img-src 'self' data: blob:;
media-src 'self' blob:;
connect-src 'self' https://api.openalex.org <CSP_CONNECT_SRC>;
worker-src 'self' blob:;
frame-src 'none'; object-src 'none'; base-uri 'none';
form-action 'self'; frame-ancestors 'none';
upgrade-insecure-requests;
report-uri /api/csp-report; report-to csp
```

- **Scripts.** The server reads the built `index.html` once and stamps a fresh
  128-bit nonce onto every `<script>` and `<link rel="modulepreload">` per
  request. `'strict-dynamic'` lets those trusted scripts load Vite's chunks
  (and deck.gl on `/world`); anything else, inline or from another host, is
  refused. `https:` and `'unsafe-inline'` are ignored by every browser that
  supports nonces and only keep very old browsers working (the
  [web.dev strict CSP](https://web.dev/articles/strict-csp) recipe).
- **Styles** allow `'unsafe-inline'` because React `style={}` props and the
  3D/world code set inline styles. Style injection cannot run code; tightening
  this is a later, separate change.
- **Fonts** are self-hosted (Fontsource), so `font-src` is `'self'` only.
- **connect-src** is `'self'`, OpenAlex's public API (the researcher search calls
  it from the browser), plus `CSP_CONNECT_SRC` (bare `https://` / `wss://`
  origins only; anything else is dropped). Set it to the Convex deployment and
  the Exo Imprint issuer when those go live.

## Rollout

1. **Report-only (default).** `CSP_MODE` unset or `report-only`. Browsers send
   violations to `POST /api/csp-report`; each one is logged as
   `"CSP violation"` with directive, blocked URL and page (query strings
   stripped, 16 KB body cap, 30 reports per minute per IP).
2. **Soak on staging** for a few days of real use: sign-in, checkout, `/world`,
   Ask Cosmo, sharing. Every logged violation is either a bug in the policy
   (fix the policy) or a third-party script (remove it).
3. **Enforce.** Set `CSP_MODE=enforce` on staging, re-test, then production.
   `CSP_MODE=off` is the emergency switch.
