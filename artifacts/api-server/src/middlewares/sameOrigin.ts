import type { RequestHandler } from "express";
import { isAllowedOrigin } from "../lib/publicOrigin";

// Paid endpoints answer only the Cosmograph page itself. Browsers always send an
// Origin header on cross-site and same-site fetch POSTs, so a request with a
// missing or foreign Origin is a script or another site using us as a free API.
// A determined script can forge Origin, so this is one layer: rate limits and
// the daily budget bound whatever gets past it.
//
// The expected host is the public host the visitor used: X-Forwarded-Host when
// set by a trusted gateway (EXO staging, `trust proxy` = 1), else Host.
// ALLOWED_ORIGINS (comma-separated) adds extra origins, e.g. a local dev port.
const extra = new Set(
  (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean),
);

export function originAllowed(
  origin: string | undefined,
  publicHost: string | undefined,
): boolean {
  if (!origin) return false;
  const normalized = origin.replace(/\/$/, "");
  if (extra.has(normalized)) return true;
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return false;
    return Boolean(publicHost) && url.host === publicHost;
  } catch {
    return false;
  }
}

export const requireSameOrigin: RequestHandler = (req, res, next) => {
  const forwarded = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const publicHost = forwarded || req.get("host");
  // Only the explicit allowlist (PUBLIC_APP_ORIGINS / ALLOWED_ORIGINS). Matching
  // Origin against Host is not enough: a script sets both headers.
  void publicHost;
  if (isAllowedOrigin(req.get("origin"))) {
    next();
    return;
  }
  res.status(403).json({ error: "Forbidden" });
};
