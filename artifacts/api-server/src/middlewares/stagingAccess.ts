import type { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

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
    pathname.startsWith("/assets/")
  );
}

export function stagingAccessDecision(input: {
  enabled: boolean;
  /** The request carried a valid Exo gateway token minted for this App. */
  fromGateway: boolean;
  pathname: string;
}): "allow" | "forbidden" {
  if (!input.enabled || input.fromGateway || isPublicStagingPath(input.pathname)) {
    return "allow";
  }
  return "forbidden";
}

const APP = "cosmograph";
export const GATEWAY_TOKEN_HEADER = "x-exo-gateway-token";

let remoteJwks: { url: string; set: JWTVerifyGetKey } | null = null;

function issuerJwks(issuer: string): JWTVerifyGetKey {
  const url = `${new URL(issuer).origin}/exo-key/.well-known/jwks.json`;
  if (remoteJwks?.url !== url) {
    remoteJwks = { url, set: createRemoteJWKSet(new URL(url)) };
  }
  return remoteJwks.set;
}

/**
 * True only for a short-lived RS256 token Exo Key minted for exactly this App
 * (aud exo-gateway:cosmograph, sub exo-gateway, token_use gateway), checked
 * against Exo Key's PUBLIC JWKS. Mirrors EXO's reference verifyGatewayToken
 * (src/platform/delivery/gatewayTokens.ts). Needs no secret. Never throws.
 */
export async function verifyGatewayToken(
  token: string | undefined,
  issuer: string | undefined,
  jwks?: JWTVerifyGetKey,
): Promise<boolean> {
  const iss = issuer?.trim();
  if (!iss || !token || token.split(".").length !== 3) return false;
  try {
    const { payload } = await jwtVerify(token, jwks ?? issuerJwks(iss), {
      issuer: iss,
      audience: `exo-gateway:${APP}`,
      subject: "exo-gateway",
      algorithms: ["RS256"],
      maxTokenAge: "10m",
    });
    return payload.token_use === "gateway";
  } catch {
    return false;
  }
}

/**
 * Fail-closed access boundary for non-production deployments.
 *
 * Enabled explicitly with STAGING_AUTH_REQUIRED=true. Staging is reached only
 * through the EXO gateway (https://staging.exo.now/cosmograph), which signs the
 * reviewer in with Exo Imprint and checks their grant before forwarding. This
 * origin then accepts a request only when it carries the gateway's token for
 * this App, so calling the origin directly gets a 403. Health and static
 * assets stay public. EXO_KEY_ISSUER (public, non-secret) names the issuer;
 * without it every gated request fails closed.
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

  const header = req.headers[GATEWAY_TOKEN_HEADER];
  const token = Array.isArray(header) ? header[0] : header;
  const public_ = isPublicStagingPath(req.path);
  const decision = stagingAccessDecision({
    enabled,
    fromGateway: public_
      ? false
      : await verifyGatewayToken(token, process.env["EXO_KEY_ISSUER"]),
    pathname: req.path,
  });

  if (decision === "allow") {
    next();
    return;
  }

  res
    .status(403)
    .type("text/plain")
    .send("Forbidden: open Cosmograph staging at https://staging.exo.now/cosmograph");
}
