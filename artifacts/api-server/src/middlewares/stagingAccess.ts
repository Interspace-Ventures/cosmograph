import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";

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
    pathname.startsWith("/sign-up/")
  );
}

export function stagingAccessDecision(input: {
  enabled: boolean;
  userId?: string | null;
  organizationId?: string | null;
  authorizedUserIds?: string[];
  authorizedOrganizationIds?: string[];
  method: string;
  pathname: string;
  acceptsHtml: boolean;
}): "allow" | "redirect" | "unauthorized" {
  const authorized = Boolean(
    (input.userId && input.authorizedUserIds?.includes(input.userId)) ||
    (input.organizationId && input.authorizedOrganizationIds?.includes(input.organizationId)),
  );

  if (!input.enabled || authorized || isPublicStagingPath(input.pathname)) {
    return "allow";
  }

  const isNavigation =
    !input.pathname.startsWith("/api/") &&
    (input.method === "GET" || input.method === "HEAD") &&
    input.acceptsHtml;
  return isNavigation ? "redirect" : "unauthorized";
}

/**
 * Fail-closed access boundary for non-production deployments.
 *
 * Railway enables this explicitly with STAGING_AUTH_REQUIRED=true. Health,
 * Clerk's sign-in routes, and the static files needed to render those routes
 * remain public; every application route and API otherwise requires a valid
 * Clerk session established by clerkMiddleware().
 */
export function stagingAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
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

  const auth = getAuth(req);
  const authorizedUserIds = (process.env["STAGING_AUTHORIZED_USER_IDS"] ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const authorizedOrganizationIds = (process.env["STAGING_AUTHORIZED_ORGANIZATION_IDS"] ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const decision = stagingAccessDecision({
    enabled,
    userId: auth?.userId,
    organizationId: auth?.orgId,
    authorizedUserIds,
    authorizedOrganizationIds,
    method: req.method,
    pathname: req.path,
    acceptsHtml: req.accepts("html") === "html",
  });

  if (decision === "allow") {
    next();
    return;
  }

  if (decision === "redirect") {
    res.redirect(302, "/sign-in");
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
}
