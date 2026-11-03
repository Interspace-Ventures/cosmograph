import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/lib/convexApi";
import { useBillingActions } from "@/lib/billingApi";

/**
 * Data access for the account, researcher unlocks, ships and referrals. All of
 * it lives on Convex, where identity comes only from the verified Exo Imprint
 * (Exo Key) token. The old Clerk + Express path is gone.
 */

export interface Entitlement {
  entitled: boolean;
  email?: string | null;
  includedSlots: number;
  unlocked: string[];
  /** Convex (Phase 3): membership detail written by the Stripe webhook. */
  plan?: "annual" | "lifetime" | null;
  status?: string | null;
  memberUntil?: string | null;
  cancelAtPeriodEnd?: boolean;
}

export interface ShipState {
  shipSeed?: string | null;
  shipType?: string | null;
  ownedTypes?: string[];
  entitled?: boolean;
  includedSkinSlots?: number;
  freeSlotsRemaining?: number;
}

export interface ShipClaim {
  alreadyOwned: boolean;
  granted: boolean;
  /** Stripe Checkout URL for membership (ships are included in membership). */
  url?: string | null;
  /** Payment is needed and no checkout URL could be produced. */
  checkoutRequired?: boolean;
}

export interface ReferralInfo {
  code: string;
  referredCount: number;
}

type Action<A extends unknown[], R> = {
  run: (...args: A) => Promise<R>;
  isPending: boolean;
};

function usePending<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): Action<A, R> {
  const [count, setCount] = useState(0);
  const run = useCallback(
    async (...args: A) => {
      setCount((c) => c + 1);
      try {
        return await fn(...args);
      } finally {
        setCount((c) => c - 1);
      }
    },
    [fn],
  );
  return { run, isPending: count > 0 };
}

/** Stable error code from a ConvexError (or an HTTP status, for plain fetch errors). */
export function accountErrorCode(err: unknown): string | null {
  if (err instanceof ConvexError) {
    const data = err.data as { code?: unknown } | undefined;
    return typeof data?.code === "string" ? data.code : null;
  }
  const status = (err as { status?: number } | null)?.status;
  return typeof status === "number" ? `HTTP_${status}` : null;
}

// --- reads --------------------------------------------------------------

export function useEntitlementData(enabled: boolean): Entitlement | undefined {
  return useQuery(api.account.entitlement, enabled ? {} : "skip");
}

export function useShipData(enabled: boolean): ShipState | undefined {
  return useQuery(api.ship.get, enabled ? {} : "skip");
}

function useConvexReferral(enabled: boolean): ReferralInfo | undefined {
  const mine = useQuery(api.referral.mine, enabled ? {} : "skip");
  const ensure = useMutation(api.referral.ensure);
  const asked = useRef(false);
  useEffect(() => {
    if (!enabled || !mine || mine.code || asked.current) return;
    asked.current = true; // allocate the code once per mount
    ensure({}).catch(() => {
      asked.current = false;
    });
  }, [enabled, mine, ensure]);
  return mine?.code
    ? { code: mine.code, referredCount: mine.referredCount }
    : undefined;
}

export const useReferralData = useConvexReferral;

// --- writes -------------------------------------------------------------

function useConvexUnlock(): Action<[string], Entitlement> {
  const unlock = useMutation(api.billing.unlock);
  return usePending(
    useCallback((author: string) => unlock({ author }), [unlock]),
  );
}

export const useUnlockResearcherAction = useConvexUnlock;

function useConvexSaveShip(): Action<[string, string | null], ShipState> {
  const save = useMutation(api.ship.save);
  return usePending(
    useCallback(
      (seed: string, type: string | null) => save({ seed, type }),
      [save],
    ),
  );
}

export const useSaveShipAction = useConvexSaveShip;

function useConvexClaimShip(): Action<[string, string | null], ShipClaim> {
  const claim = useMutation(api.ship.claim);
  const { startCheckout } = useBillingActions();
  // Ships are included in membership (#12). A non-member's claim starts
  // membership checkout carrying the hull; the verified webhook grants it.
  return usePending(
    useCallback(
      async (type: string, author: string | null): Promise<ShipClaim> => {
        const res = await claim({ type });
        if (!res.checkoutRequired) return res;
        const started = await startCheckout({ plan: "annual", ship: type, author });
        return started.url
          ? { alreadyOwned: false, granted: false, url: started.url }
          : res;
      },
      [claim, startCheckout],
    ),
  );
}

export const useClaimShipAction = useConvexClaimShip;

function useConvexClaimReferral(): Action<[string], ReferralInfo> {
  const claim = useMutation(api.referral.claim);
  return usePending(useCallback((code: string) => claim({ code }), [claim]));
}

export const useClaimReferralAction = useConvexClaimReferral;
