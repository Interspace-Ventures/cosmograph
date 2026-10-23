import { EXO_ID_APP, resolveExoIdConfig } from "./core";

/**
 * Exo Key (Exo ID) configuration for the web client. All values are PUBLIC
 * (inlined at build time by Vite) and none is a secret:
 *  - VITE_EXO_ID_ISSUER: the Exo ID issuer, e.g.
 *    https://frugal-eel-930.convex.site/exo-id (staging). Required.
 *  - VITE_EXO_ID_AUTHORIZE_URL: optional; otherwise read from Exo discovery.
 *  - VITE_EXO_ID_APP: optional Exo ID app (the token audience); default
 *    `cosmograph`. Must match one of the API server's EXO_ID_AUDIENCE values.
 * Null config means "sign-in not configured for this build"; the app still
 * renders (the default galaxy is public) and sign-in shows a clear error.
 */
export const EXO_ID_CONFIG = resolveExoIdConfig({
  issuer: import.meta.env.VITE_EXO_ID_ISSUER,
  authorizeUrl: import.meta.env.VITE_EXO_ID_AUTHORIZE_URL,
  app: import.meta.env.VITE_EXO_ID_APP?.trim() || EXO_ID_APP,
});

/** The app base path without a trailing slash ("" at the root). */
export const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
