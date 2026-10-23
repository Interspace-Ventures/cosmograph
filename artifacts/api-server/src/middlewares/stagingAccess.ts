import type { Request, Response, NextFunction } from "express";
import { withAppBasePath } from "../lib/appPath";
import { getExoIdentity } from "./exoIdentity";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

const PUBLIC_STAGING_PATHS = new Set([
  "/api/health",
  "/api/healthz",
  "/favicon.ico",
  "/favicon.svg",
  "/apple-touch-icon.png",
  "/logo-mark.svg",
  "/robots.txt",
  "/opengraph.jpg",
  "/opengraph.png",
]);

export function stagingAccessRequired(value: string | undefined): boolean {
  return value ? TRUE_VALUES.has(value.trim().toLowerCase()) : false;
}

export function isPublicStagingPath(pathname: string): boolean {
  return (
    PUBLIC_STAGING_PATHS.has(pathname) ||
    pathname.startsWith("/assets/") ||
    pathname === "/sign-in" ||
    pathname.startsWith("/sign-in/") ||
    pathname === "/sign-up" ||
    pathname.startsWith("/sign-up/") ||
    // Exo ID redirect target: the browser redeems the one-time code here.
    pathname === "/auth/callback"
  );
}

export function stagingAccessDecision(input: {
  enabled: boolean;
  userId?: string | null;
  method: string;
  pathname: string;
  acceptsHtml: boolean;
}): "allow" | "redirect" | "unauthorized" {
  if (
    !input.enabled ||
    input.userId ||
    isPublicStagingPath(input.pathname)
  ) {
    return "allow";
  }

  const isNavigation =
    !input.pathname.startsWith("/api/") &&
    (input.method === "GET" || input.method === "HEAD") &&
    input.acceptsHtml;
  return isNavigation ? "redirect" : "unauthorized";
}

/**
 * Where a signed-out visitor goes: the sign-in page, returning to `returnTo`
 * (app-relative path + query) afterwards. Only same-app relative paths are
 * carried; anything else returns to the galaxy.
 */
export function signInLocation(returnTo: string): string {
  const next =
    returnTo.startsWith("/") &&
    !returnTo.startsWith("//") &&
    !returnTo.startsWith("/\\") &&
    !returnTo.startsWith("/sign-in") &&
    !returnTo.startsWith("/auth/")
      ? returnTo
      : "/";
  return next === "/"
    ? withAppBasePath("/sign-in")
    : `${withAppBasePath("/sign-in")}?next=${encodeURIComponent(next)}`;
}

/**
 * Fail-closed access boundary for non-production deployments.
 *
 * Railway enables this explicitly with STAGING_AUTH_REQUIRED=true. Health,
 * the sign-in and Exo ID callback routes, and the static files needed to render
 * them remain public; every application route and API otherwise requires a
 * verified Exo ID access token for this app's audience (see exoIdentity.ts).
 */
export async function stagingAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const enabled = stagingAccessRequired(
    process.env["STAGING_AUTH_REQUIRED"],
  );

  if (!enabled) {
    next();
    return;
  }

  res.set({
    "Cache-Control": "private, no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
  });

  const decision = stagingAccessDecision({
    enabled,
    userId: isPublicStagingPath(req.path)
      ? null
      : (await getExoIdentity(req))?.subject,
    method: req.method,
    pathname: req.path,
    acceptsHtml: req.accepts("html") === "html",
  });

  if (decision === "allow") {
    next();
    return;
  }

  if (decision === "redirect") {
    res.redirect(302, signInLocation(req.url));
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
}
