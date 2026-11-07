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
 * deployment, set by Exo delivery like the Express server's.
 */
export function featureEnabled(
  id: FeatureId,
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): boolean {
  return evaluateFeature(id, {
    channel: normalizeReleaseChannel(env.RELEASE_CHANNEL),
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
