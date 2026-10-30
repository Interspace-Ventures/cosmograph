import { useCallback, useState } from "react";
import { convexAccountEnabled } from "@/config/features";
import { useExoSession } from "@/lib/exoSession";

/**
 * Membership checkout and billing portal on Convex (migration Phase 3, behind
 * `convex-account`). Both are Convex HTTP actions on the deployment's
 * `.convex.site` host, called with the Exo Key access token as a Bearer
 * token; the server checks this page's Origin against its allowlist, rate
 * limits, and builds the Stripe return URLs itself. Payment state never comes
 * from here: membership turns on only when the signature-verified Stripe
 * webhook lands, and the entitlement query updates reactively.
 */

export type MemberPlan = "annual" | "lifetime";

export interface CheckoutIntent {
  plan?: MemberPlan;
  /** Researcher to unlock once the membership is active. */
  author?: string | null;
  /** Premium hull to grant once the membership is active. */
  ship?: string | null;
}

export interface CheckoutStart {
  alreadyEntitled: boolean;
  url?: string;
}

export class BillingRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "BillingRequestError";
  }
}

/** HTTP actions are served from the deployment's .convex.site origin. */
export function convexSiteUrl(): string | null {
  const explicit = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined;
  if (explicit) return explicit.replace(/\/$/, "");
  const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith(".convex.cloud")) return null;
    parsed.hostname = parsed.hostname.replace(/\.convex\.cloud$/, ".convex.site");
    return parsed.origin;
  } catch {
    return null;
  }
}

/** Same rule as the server (convex/lib/billingConfig.ts safeReturnPath). */
function returnPath(): string {
  const path = window.location.pathname;
  return path.length <= 256 &&
    /^\/(?!\/)[A-Za-z0-9\-._~/]*$/.test(path) &&
    !path.includes("..")
    ? path
    : "/";
}

export interface BillingActions {
  startCheckout: (intent: CheckoutIntent) => Promise<CheckoutStart>;
  openPortal: () => Promise<{ url: string }>;
  pending: boolean;
}

function useConvexBilling(): BillingActions {
  const { session } = useExoSession();
  const [pending, setPending] = useState(false);

  const call = useCallback(
    async (path: string, body: Record<string, unknown>): Promise<unknown> => {
      const base = convexSiteUrl();
      if (!base || !session) {
        throw new BillingRequestError(503, "BILLING_UNAVAILABLE", "Checkout is unavailable right now.");
      }
      const token = await session.getAccessToken();
      if (!token) {
        throw new BillingRequestError(401, "UNAUTHENTICATED", "Please sign in again.");
      }
      setPending(true);
      try {
        const res = await fetch(`${base}${path}`, {
          method: "POST",
          credentials: "omit",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => ({}))) as {
          code?: string;
          error?: string;
        };
        if (!res.ok) {
          throw new BillingRequestError(
            res.status,
            data.code ?? null,
            data.error ?? "Checkout is unavailable right now.",
          );
        }
        return data;
      } finally {
        setPending(false);
      }
    },
    [session],
  );

  const startCheckout = useCallback(
    (intent: CheckoutIntent) =>
      call("/billing/checkout", {
        plan: intent.plan ?? "annual",
        returnPath: returnPath(),
        ...(intent.author ? { author: intent.author } : {}),
        ...(intent.ship ? { ship: intent.ship } : {}),
      }) as Promise<CheckoutStart>,
    [call],
  );

  const openPortal = useCallback(
    () => call("/billing/portal", { returnPath: returnPath() }) as Promise<{ url: string }>,
    [call],
  );

  return { startCheckout, openPortal, pending };
}

function useNoConvexBilling(): BillingActions {
  const unavailable = useCallback(
    () =>
      Promise.reject(
        new BillingRequestError(404, "NOT_FOUND", "Convex billing is off in this build."),
      ),
    [],
  );
  return { startCheckout: unavailable, openPortal: unavailable, pending: false };
}

/** Picked once from the build-time flag, like the hooks in accountApi.ts. */
export const useBillingActions: () => BillingActions = convexAccountEnabled
  ? useConvexBilling
  : useNoConvexBilling;

/** User-facing text for a failed checkout start. */
export function checkoutErrorMessage(err: unknown): string {
  if (err instanceof BillingRequestError) {
    if (err.code === "RATE_LIMITED" || err.code === "DAILY_LIMIT") return err.message;
    if (err.code === "GLOBAL_CUTOFF") return "Checkout is paused right now. Please try again later.";
    if (err.code === "UNAUTHENTICATED") return "Please sign in again to continue.";
  }
  return "Could not start checkout. Please try again.";
}
