import type { AuthConfig } from "convex/server";
import { exoKeyConfig } from "./lib/exoKey";

/**
 * Exo Key on Convex Auth: Exo ID is Cosmograph's ONLY identity provider.
 *
 * One customJwt provider per accepted audience. Convex verifies each Exo ID
 * access token's RS256 signature against `<issuer>/.well-known/jwks.json`, plus
 * `iss`, `aud` and expiry, before any function sees it; functions then read the
 * account key from `ctx.auth.getUserIdentity().subject`.
 *
 * Issuer, audience and client id are non-secret env on each Convex deployment
 * (see convex/lib/exoKey.ts and .env.example). If they are missing, no provider
 * is registered and every caller is anonymous: fail closed, no bypass.
 *
 * TODO(exo#229): sign-in cannot complete until Exo registers app `cosmograph`
 * and its /auth/callback redirect URIs. Set EXO_ID_ISSUER / EXO_ID_AUDIENCE /
 * EXO_ID_CLIENT_ID on the staging Convex deployment once it merges.
 */
const config = exoKeyConfig();

export default {
  providers: config
    ? config.audiences.map((audience) => ({
        type: "customJwt" as const,
        applicationID: audience,
        issuer: config.issuer,
        jwks: `${config.issuer}/.well-known/jwks.json`,
        algorithm: "RS256" as const,
      }))
    : [],
} satisfies AuthConfig;
