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
