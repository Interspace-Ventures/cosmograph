import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import type { Request } from "express";

/**
 * Exo Key (Exo ID) token verification. Exo ID is Cosmograph's only identity
 * issuer: Cosmograph is a pure relying party. It holds no signing keys, no
 * OAuth clients, and no provider or auth secrets. Browsers sign in on Exo's
 * hosted authorize page (authorization code + PKCE, app `cosmograph`) and
 * present the Exo ID access token; this module verifies it against Exo ID's
 * PUBLIC JWKS.
 *
 * Access tokens are RS256 JWTs with `iss` = `${EXO_CONVEX_SITE_URL}/exo-id`,
 * `aud` = the Exo ID app, `sub` = the Exo user id (stable across apps), plus
 * `email`, `email_verified`, and `name`. They live 15 minutes.
 *
 * Configuration is non-secret and comes from the environment:
 *  - `EXO_ID_ISSUER` (preferred) or `EXO_CONVEX_SITE_URL` (issuer = `<site>/exo-id`).
 *  - `EXO_ID_AUDIENCE`: comma-separated audiences this deployment accepts.
 *    Defaults to `cosmograph`. Never hardcode an environment's audience in code;
 *    see docs/staging.md for why staging does NOT add `exo-staging` here.
 *
 * Token transport, in order:
 *  1. `Authorization: Bearer <token>`: direct calls. Behind the EXO staging
 *     gateway this header is REPLACED by the gateway's own token (audience
 *     `exo-staging`), which this app rejects unless explicitly configured.
 *  2. The `exo_access` cookie: the browser mirrors Cosmograph's own access
 *     token here (path-scoped, SameSite=Lax, same lifetime as the token).
 * Every presented token is verified in turn and the first one that passes
 * signature, issuer, audience, algorithm, and expiry checks wins (Universe #34).
 * The transport is never trusted on its own.
 */

export const EXO_ACCESS_COOKIE = "exo_access";
export const DEFAULT_EXO_ID_AUDIENCE = "cosmograph";

export interface ExoIdentity {
  /** Exo user id (JWT `sub`); Cosmograph's account key (users.exo_subject). */
  subject: string;
  issuer: string;
  audience: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface ExoVerifierConfig {
  issuer: string;
  audiences: string[];
}

function trimSlashes(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/** The Exo ID issuer, or null when this deployment is not configured. */
export function exoIdIssuer(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env["EXO_ID_ISSUER"];
  if (explicit && explicit.trim()) return trimSlashes(explicit);
  const site = env["EXO_CONVEX_SITE_URL"];
  if (site && site.trim()) return `${trimSlashes(site)}/exo-id`;
  return null;
}

/** Audiences accepted by this deployment (`EXO_ID_AUDIENCE`, comma-separated). */
export function exoIdAudiences(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = (env["EXO_ID_AUDIENCE"] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.length > 0 ? [...new Set(configured)] : [DEFAULT_EXO_ID_AUDIENCE];
}

export function exoVerifierConfig(
  env: NodeJS.ProcessEnv = process.env,
): ExoVerifierConfig | null {
  const issuer = exoIdIssuer(env);
  if (!issuer) return null;
  return { issuer, audiences: exoIdAudiences(env) };
}

let cachedJwks: { issuer: string; jwks: JWTVerifyGetKey } | null = null;

function jwksFor(issuer: string): JWTVerifyGetKey {
  if (cachedJwks?.issuer !== issuer) {
    cachedJwks = {
      issuer,
      jwks: createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)),
    };
  }
  return cachedJwks.jwks;
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim()) || null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Every presented Exo access token: Authorization header first, then the cookie. */
export function presentedTokens(req: Pick<Request, "headers">): string[] {
  const header = req.headers["authorization"];
  const value = Array.isArray(header) ? header[0] : header;
  const bearer = value ? /^Bearer\s+(\S+)$/i.exec(value.trim())?.[1] : undefined;
  const cookieHeader = req.headers["cookie"];
  const cookie = readCookie(
    Array.isArray(cookieHeader) ? cookieHeader.join(";") : cookieHeader,
    EXO_ACCESS_COOKIE,
  );
  const tokens: string[] = [];
  if (bearer) tokens.push(bearer);
  if (cookie && cookie !== bearer) tokens.push(cookie);
  return tokens;
}

/**
 * Verify one token. Returns null for any failure (bad signature, wrong
 * issuer/audience/algorithm, expired, missing subject). `keys` is injectable
 * for tests; production always uses Exo's published JWKS for the issuer.
 */
export async function verifyExoToken(
  token: string,
  config: ExoVerifierConfig,
  keys: JWTVerifyGetKey = jwksFor(config.issuer),
): Promise<ExoIdentity | null> {
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: config.issuer,
      audience: config.audiences,
      algorithms: ["RS256"],
    });
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const audience = aud.find((value): value is string =>
      typeof value === "string" && config.audiences.includes(value),
    );
    if (!audience) return null;
    return {
      subject: payload.sub,
      issuer: config.issuer,
      audience,
      email: typeof payload["email"] === "string" ? payload["email"] : null,
      emailVerified: payload["email_verified"] === true,
      name: typeof payload["name"] === "string" ? payload["name"] : null,
    };
  } catch {
    return null;
  }
}

/** Verify each presented token in turn; the first valid one wins. */
export async function verifyPresentedTokens(
  tokens: string[],
  config: ExoVerifierConfig,
  keys?: JWTVerifyGetKey,
): Promise<ExoIdentity | null> {
  for (const token of tokens) {
    const identity = await verifyExoToken(token, config, keys);
    if (identity) return identity;
  }
  return null;
}

const identityCache = new WeakMap<object, Promise<ExoIdentity | null>>();

/**
 * The request's verified Exo identity, or null. Memoized per request so the
 * staging boundary and requireAuth verify the token only once. Fails closed:
 * an unconfigured deployment has no signed-in requests.
 */
export function getExoIdentity(req: Request): Promise<ExoIdentity | null> {
  const cached = identityCache.get(req);
  if (cached) return cached;
  const pending = (async () => {
    const tokens = presentedTokens(req);
    if (tokens.length === 0) return null;
    const config = exoVerifierConfig();
    if (!config) {
      req.log?.error("exo.identity.not_configured: set EXO_ID_ISSUER");
      return null;
    }
    return verifyPresentedTokens(tokens, config);
  })();
  identityCache.set(req, pending);
  return pending;
}
