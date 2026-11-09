import { ConvexError } from "convex/values";
import {
  evaluateFeature,
  normalizeReleaseChannel,
  parseFeatureOverrides,
  type FeatureId,
} from "../../lib/release-flags/src/index";

/**
 * Server-side release gates for Convex functions, the same contract as the
 * Express `requireFeature` middleware (artifacts/api-server/src/lib/features.ts):
 * an unreleased capability answers "not found" so a UI-only flag never becomes
 * the security or cost boundary.
 *
 * RELEASE_CHANNEL and FEATURE_FLAG_OVERRIDES are non-secret env on each Convex
 * deployment (CONVEX_ENV_<NAME> in that environment's Bitwarden project, synced
 * by the Render pre-deploy). A deployment with no valid RELEASE_CHANNEL is
 * treated as `public`, the most closed audience, so a production deployment
 * that is missing the variable can never pick up internal or F&F dates.
 * (The shared normalizeReleaseChannel default is friends-and-family, which is
 * right for the SPA and Express, where render.yaml always sets the channel.)
 */
export function featureEnabled(
  id: FeatureId,
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): boolean {
  return evaluateFeature(id, {
    channel: normalizeReleaseChannel(env.RELEASE_CHANNEL, "public"),
    overrides: parseFeatureOverrides(env.FEATURE_FLAG_OVERRIDES),
    now,
  }).enabled;
}

export function requireFeature(
  id: FeatureId,
  env: Record<string, string | undefined> = process.env,
): void {
  if (!featureEnabled(id, env)) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Not found" });
  }
}
