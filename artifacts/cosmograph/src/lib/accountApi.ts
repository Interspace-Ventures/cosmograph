import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  getGetEntitlementQueryKey,
  getGetReferralQueryKey,
  getGetShipQueryKey,
  useClaimReferral,
  useClaimSkin,
  useGetEntitlement,
  useGetReferral,
  useGetShip,
  useSaveShip,
  useUnlockResearcher,
} from "@workspace/api-client-react";
import { convexAccountEnabled } from "@/config/features";
import { api } from "@/lib/convexApi";
import { useBillingActions } from "@/lib/billingApi";

/**
 * Data access for the Phase 2 features (account, researcher unlocks, ships,
 * referrals) on either backend. With `convex-account` off these wrap the
 * generated Express client exactly as before; with it on they call Convex,
 * where identity comes only from the verified Exo token. Each export picks its
 * implementation once, from the build-time flag.
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
  /** Stripe Checkout URL (Express $1 hull, or Convex membership checkout). */
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

/** Stable error code from either backend (HTTP status or ConvexError code). */
export function accountErrorCode(err: unknown): string | null {
  if (err instanceof ConvexError) {
    const data = err.data as { code?: unknown } | undefined;
    return typeof data?.code === "string" ? data.code : null;
  }
  const status = (err as { status?: number } | null)?.status;
  return typeof status === "number" ? `HTTP_${status}` : null;
}

// --- reads --------------------------------------------------------------

export const useEntitlementData: (enabled: boolean) => Entitlement | undefined =
  convexAccountEnabled
    ? (enabled) => useQuery(api.account.entitlement, enabled ? {} : "skip")
    : (enabled) =>
        useGetEntitlement({
          query: { queryKey: getGetEntitlementQueryKey(), enabled },
        }).data;

export const useShipData: (enabled: boolean) => ShipState | undefined =
  convexAccountEnabled
    ? (enabled) => useQuery(api.ship.get, enabled ? {} : "skip")
    : (enabled) =>
        useGetShip({ query: { queryKey: getGetShipQueryKey(), enabled } }).data;

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

export const useReferralData: (enabled: boolean) => ReferralInfo | undefined =
  convexAccountEnabled
    ? useConvexReferral
    : (enabled) =>
        useGetReferral({ query: { queryKey: getGetReferralQueryKey(), enabled } })
          .data;

// --- writes -------------------------------------------------------------

function useLegacyUnlock(): Action<[string], Entitlement> {
  const queryClient = useQueryClient();
  const mutation = useUnlockResearcher();
  const run = useCallback(
    async (author: string) => {
      const res = await mutation.mutateAsync({ data: { author } });
      void queryClient.invalidateQueries({ queryKey: getGetEntitlementQueryKey() });
      return res;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, mutation.mutateAsync],
  );
  return { run, isPending: mutation.isPending };
}

function useConvexUnlock(): Action<[string], Entitlement> {
  const unlock = useMutation(api.billing.unlock);
  return usePending(
    useCallback((author: string) => unlock({ author }), [unlock]),
  );
}

export const useUnlockResearcherAction = convexAccountEnabled
  ? useConvexUnlock
  : useLegacyUnlock;

function useLegacySaveShip(): Action<[string, string | null], ShipState> {
  const queryClient = useQueryClient();
  const mutation = useSaveShip();
  const run = useCallback(
    async (seed: string, type: string | null) => {
      const res = await mutation.mutateAsync({ data: { seed, type } });
      void queryClient.invalidateQueries({ queryKey: getGetShipQueryKey() });
      return res;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, mutation.mutateAsync],
  );
  return { run, isPending: mutation.isPending };
}

function useConvexSaveShip(): Action<[string, string | null], ShipState> {
  const save = useMutation(api.ship.save);
  return usePending(
    useCallback(
      (seed: string, type: string | null) => save({ seed, type }),
      [save],
    ),
  );
}

export const useSaveShipAction = convexAccountEnabled
  ? useConvexSaveShip
  : useLegacySaveShip;

function useLegacyClaimShip(): Action<[string, string | null], ShipClaim> {
  const queryClient = useQueryClient();
  const mutation = useClaimSkin();
  const run = useCallback(
    async (type: string, author: string | null) => {
      const res = await mutation.mutateAsync({ data: { type, author } });
      void queryClient.invalidateQueries({ queryKey: getGetShipQueryKey() });
      return res;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, mutation.mutateAsync],
  );
  return { run, isPending: mutation.isPending };
}

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

export const useClaimShipAction = convexAccountEnabled
  ? useConvexClaimShip
  : useLegacyClaimShip;

function useLegacyClaimReferral(): Action<[string], ReferralInfo> {
  const mutation = useClaimReferral();
  const run = useCallback(
    (code: string) => mutation.mutateAsync({ data: { code } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutation.mutateAsync],
  );
  return { run, isPending: mutation.isPending };
}

function useConvexClaimReferral(): Action<[string], ReferralInfo> {
  const claim = useMutation(api.referral.claim);
  return usePending(useCallback((code: string) => claim({ code }), [claim]));
}

export const useClaimReferralAction = convexAccountEnabled
  ? useConvexClaimReferral
  : useLegacyClaimReferral;
