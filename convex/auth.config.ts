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
 * Exo registered app `cosmograph` (exo#229, merged as exo#240). Staging sets
 * EXO_ID_ISSUER=https://frugal-eel-930.convex.site/exo-id, EXO_ID_AUDIENCE and
 * EXO_ID_CLIENT_ID=cosmograph through Exo delivery.
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
