export const RELEASE_CHANNELS = [
  "internal",
  "friends-and-family",
  "public",
] as const;

export type ReleaseChannel = (typeof RELEASE_CHANNELS)[number];

export const FEATURE_IDS = [
  "guided-tour",
  "share-cards",
  "ask-cosmo",
  "live-presence",
  "premium-ships",
  "referrals",
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

export type FeatureRelease = {
  title: string;
  description: string;
  owner: string;
  release: Record<ReleaseChannel, string | null>;
};

/**
 * Cosmograph's canonical drip plan. A null date means the feature still needs
 * an explicit release decision for that channel. Dates are UTC calendar dates
 * and become active at 00:00:00Z.
 */
export const FEATURE_RELEASES: Record<FeatureId, FeatureRelease> = {
  "guided-tour": {
    title: "Guided tour",
    description: "A narrated flight through the galaxy and Ask preview.",
    owner: "product",
    release: {
      internal: "2026-07-30",
      "friends-and-family": "2026-07-30",
      public: null,
    },
  },
  "share-cards": {
    title: "Share cards",
    description: "Capture and share a visual card from the active galaxy.",
    owner: "growth",
    release: {
      internal: "2026-07-30",
      "friends-and-family": "2026-08-06",
      public: null,
    },
  },
  "ask-cosmo": {
    title: "Ask Cosmo",
    description:
      "Grounded questions, galaxy filtering, and in-product feedback.",
    owner: "product",
    release: {
      internal: "2026-07-30",
      "friends-and-family": "2026-08-13",
      public: null,
    },
  },
  "live-presence": {
    title: "Live presence",
    description:
      "Anonymous cosmonaut headcount, ships, and realtime positions.",
    owner: "product",
    release: {
      internal: "2026-07-30",
      "friends-and-family": "2026-08-20",
      public: null,
    },
  },
  "premium-ships": {
    title: "Premium cosmonaut ships",
    description: "Member ship slots and one-time premium hull unlocks.",
    owner: "commerce",
    release: {
      internal: "2026-07-30",
      "friends-and-family": "2026-08-27",
      public: null,
    },
  },
  referrals: {
    title: "Referral links",
    description: "Personal invite links and attributed F&F signups.",
    owner: "growth",
    release: {
      internal: "2026-07-30",
      "friends-and-family": "2026-09-03",
      public: null,
    },
  },
};

export type FeatureOverride = Partial<Record<FeatureId, boolean>>;

export type FeatureDecision = {
  id: FeatureId;
  enabled: boolean;
  channel: ReleaseChannel;
  releaseAt: string | null;
  reason:
    | "override-on"
    | "override-off"
    | "scheduled"
    | "not-released"
    | "unscheduled";
};

export function normalizeReleaseChannel(
  value: string | null | undefined,
  fallback: ReleaseChannel = "friends-and-family",
): ReleaseChannel {
  return RELEASE_CHANNELS.includes(value as ReleaseChannel)
    ? (value as ReleaseChannel)
    : fallback;
}

export function parseFeatureOverrides(
  value: string | null | undefined,
): FeatureOverride {
  if (!value?.trim()) return {};

  const overrides: FeatureOverride = {};
  for (const token of value.split(",")) {
    const [rawId, rawState] = token.split("=").map((part) => part?.trim());
    if (!FEATURE_IDS.includes(rawId as FeatureId)) continue;
    if (rawState !== "on" && rawState !== "off") continue;
    overrides[rawId as FeatureId] = rawState === "on";
  }
  return overrides;
}

export function evaluateFeature(
  id: FeatureId,
  options: {
    channel?: ReleaseChannel;
    now?: Date;
    overrides?: FeatureOverride;
  } = {},
): FeatureDecision {
  const channel = options.channel ?? "friends-and-family";
  const override = options.overrides?.[id];
  const releaseAt = FEATURE_RELEASES[id].release[channel];

  if (override !== undefined) {
    return {
      id,
      enabled: override,
      channel,
      releaseAt,
      reason: override ? "override-on" : "override-off",
    };
  }

  if (!releaseAt) {
    return {
      id,
      enabled: false,
      channel,
      releaseAt,
      reason: "unscheduled",
    };
  }

  const releaseTime = Date.parse(`${releaseAt}T00:00:00.000Z`);
  const enabled = (options.now ?? new Date()).getTime() >= releaseTime;
  return {
    id,
    enabled,
    channel,
    releaseAt,
    reason: enabled ? "scheduled" : "not-released",
  };
}

export function isFeatureEnabled(
  id: FeatureId,
  options: Parameters<typeof evaluateFeature>[1] = {},
): boolean {
  return evaluateFeature(id, options).enabled;
}
