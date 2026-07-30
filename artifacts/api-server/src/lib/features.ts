import type { RequestHandler } from "express";
import {
  evaluateFeature,
  normalizeReleaseChannel,
  parseFeatureOverrides,
  type FeatureId,
} from "@workspace/release-flags";

const channel = normalizeReleaseChannel(process.env.RELEASE_CHANNEL);
const overrides = parseFeatureOverrides(process.env.FEATURE_FLAG_OVERRIDES);

export function featureDecision(id: FeatureId) {
  return evaluateFeature(id, { channel, overrides });
}

export function featureEnabled(id: FeatureId): boolean {
  return featureDecision(id).enabled;
}

/**
 * API-side enforcement for unreleased capabilities. A 404 keeps routes from
 * advertising future features and prevents UI-only flags from becoming a
 * security or cost-control boundary.
 */
export function requireFeature(id: FeatureId): RequestHandler {
  return (_req, res, next) => {
    if (featureEnabled(id)) {
      next();
      return;
    }
    res.status(404).json({ error: "Not found" });
  };
}
