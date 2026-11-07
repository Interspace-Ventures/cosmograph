import { ConvexError } from "convex/values";
import type { Auth, UserIdentity } from "convex/server";

/**
 * Exo Key (Exo ID) configuration for Cosmograph's Convex deployments.
 *
 * Cosmograph is a pure relying party of Exo ID (Exo ADR 0004), the same
 * pattern Universe, Construct and Observatory use. Exo is the only OAuth
 * client; it mints RS256 access tokens with `iss` = the Exo ID issuer,
 * `aud` = the Exo app id, `sub` = the Exo user id, plus `email`,
 * `email_verified` and `name`. Convex verifies them against Exo's public JWKS
 * (see convex/auth.config.ts). There is no client secret, signing key or other
 * auth secret anywhere in Cosmograph, and no bypass.
 *
 * All three values are NON-SECRET config set per Convex deployment by Exo
 * delivery (never hardcoded here, never crossed between staging and prod):
 *  - EXO_ID_ISSUER   e.g. https://frugal-eel-930.convex.site/exo-id (staging)
 *  - EXO_ID_AUDIENCE comma-separated audiences this deployment accepts
 *                    (normally just the Cosmograph app id). Do not add
 *                    `exo-staging` (the staging gateway's audience).
 *  - EXO_ID_CLIENT_ID the Exo app id the SPA starts its PKCE hand-off with.
 *                    In Exo the app id is also the token audience, so it must
 *                    be one of EXO_ID_AUDIENCE.
 *
 * Exo registered app `cosmograph` in exo#229 (merged as exo#240): auth code +
 * PKCE at <issuer>/id/authorize, redeemed at <issuer>/v1/token by the SPA
 * (public client). The registration goes live once EXO redeploys its staging
 * Convex (frugal-eel-930).
 */
export interface ExoKeyConfig {
  issuer: string;
  audiences: string[];
  clientId: string;
}

function trimSlashes(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function list(value: string | undefined): string[] {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Reads the Exo Key config from the deployment environment. Returns null when
 * any part is missing or inconsistent, which makes auth.config.ts register no
 * provider: every request is then anonymous (fail closed), never trusted.
 */
export function exoKeyConfig(
  env: Record<string, string | undefined> = process.env,
): ExoKeyConfig | null {
  const issuer = env.EXO_ID_ISSUER?.trim()
    ? trimSlashes(env.EXO_ID_ISSUER)
    : "";
  const audiences = list(env.EXO_ID_AUDIENCE);
  const clientId = env.EXO_ID_CLIENT_ID?.trim() ?? "";
  if (!issuer || !issuer.startsWith("https://")) return null;
  if (audiences.length === 0 || !clientId) return null;
  if (!audiences.includes(clientId)) return null;
  return { issuer, audiences, clientId };
}

/**
 * Convex passes customJwt claims through under their raw JWT names, so Exo's
 * `email_verified` arrives as `identity.email_verified`, not the OIDC-mapped
 * `identity.emailVerified`. Accept either; require a literal true.
 */
export function isEmailVerified(identity: UserIdentity): boolean {
  return (
    identity.emailVerified === true ||
    (identity as Record<string, unknown>)["email_verified"] === true
  );
}

/** The verified email, or undefined when Exo did not assert it verified. */
export function verifiedEmail(identity: UserIdentity): string | undefined {
  const email = identity.email?.trim().toLowerCase();
  return email && isEmailVerified(identity) ? email : undefined;
}

/**
 * The caller's verified Exo identity, or a ConvexError. The account key is
 * always `identity.subject` from the token Convex already verified; it is never
 * taken from function arguments.
 */
export async function requireIdentity(ctx: {
  auth: Auth;
}): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || !identity.subject) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Sign in with Exo Imprint is required.",
    });
  }
  return identity;
}
