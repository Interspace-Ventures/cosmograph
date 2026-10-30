import {
  evaluateFeature,
  normalizeReleaseChannel,
  parseFeatureOverrides,
  type FeatureId,
} from "@workspace/release-flags";

const channel = normalizeReleaseChannel(import.meta.env.VITE_RELEASE_CHANNEL);
const overrides = parseFeatureOverrides(
  import.meta.env.VITE_FEATURE_FLAG_OVERRIDES,
);

export function featureDecision(id: FeatureId) {
  return evaluateFeature(id, { channel, overrides });
}

export function featureEnabled(id: FeatureId): boolean {
  return featureDecision(id).enabled;
}

/**
 * Migration Phase 2 switch (docs/convex-migration-plan.md): Exo Key sign-in,
 * with the account, researcher unlocks, ships and referrals served by Convex
 * instead of the Express API. Unscheduled on every channel, so it is OFF unless
 * VITE_FEATURE_FLAG_OVERRIDES contains `convex-account=on`. It is read once at
 * build time, so a build is wholly on one auth stack or the other.
 */
export const convexAccountEnabled = featureEnabled("convex-account");
