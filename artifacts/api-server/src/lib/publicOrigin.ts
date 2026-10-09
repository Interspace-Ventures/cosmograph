import type { Request } from "express";

// The origins Cosmograph is actually served from. Used for the CORS allowlist,
// the browser-request (Origin) check, the presence socket handshake, and the
// Stripe return URLs, so a forged Host / X-Forwarded-Host header can never
// steer any of them to someone else's domain.
//
// PUBLIC_APP_ORIGINS: comma-separated https origins (first = canonical).
// ALLOWED_ORIGINS:    extra origins, e.g. http://localhost:5173 for dev.
const DEFAULTS = [
  "https://cosmograph.space",
  "https://app.cosmograph.space",
  "https://staging.exo.now",
];

function parse(list: string | undefined): string[] {
  return (list ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean)
    .filter((o) => {
      try {
        const u = new URL(o);
        return (
          (u.protocol === "https:" || u.hostname === "localhost") &&
          u.pathname === "/" &&
          !u.search &&
          !u.hash
        );
      } catch {
        return false;
      }
    })
    .map((o) => new URL(o).origin);
}

export function publicOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = parse(env.PUBLIC_APP_ORIGINS);
  const railway = env.RAILWAY_PUBLIC_DOMAIN?.trim()
    ? parse(`https://${env.RAILWAY_PUBLIC_DOMAIN.trim()}`)
    : [];
  return [
    ...new Set([
      ...(configured.length ? configured : DEFAULTS),
      ...railway,
      ...parse(env.ALLOWED_ORIGINS),
    ]),
  ];
}

const ORIGINS = new Set(publicOrigins());

export function isAllowedOrigin(origin: string | undefined | null): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    // Exact origin only: no path, credentials, or trailing junk smuggled in.
    return ORIGINS.has(u.origin) && u.origin === origin.replace(/\/$/, "");
  } catch {
    return false;
  }
}

/**
 * The origin to send a visitor back to after checkout: the page's own origin
 * when it is one of ours, otherwise the canonical origin. Never derived from
 * Host or X-Forwarded-Host, which a client controls.
 */
export function returnOrigin(req: Request): string {
  const origin = req.get("origin");
  if (isAllowedOrigin(origin)) return origin!.replace(/\/$/, "");
  return publicOrigins()[0]!;
}
