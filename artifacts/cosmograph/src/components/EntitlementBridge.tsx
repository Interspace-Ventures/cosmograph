import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useGetEntitlement,
  useConfirmCheckout,
  getGetEntitlementQueryKey,
} from "@workspace/api-client-react";
import { useAppState } from "@/lib/store";

// Bridges Exo auth + the server entitlement into the galaxy store, and
// finishes the Stripe redirect handshake. Renders nothing. Web auth is
// cookie-based: the browser sends the `exo_access` cookie (Cosmograph's Exo ID
// access token, see lib/auth.tsx) on same-origin /api calls.
export function EntitlementBridge() {
  const { isLoaded, isSignedIn, accessReady } = useAuth();
  const { setEntitlement } = useAppState();
  const queryClient = useQueryClient();
  const confirm = useConfirmCheckout();

  const { data } = useGetEntitlement({
    query: {
      queryKey: getGetEntitlementQueryKey(),
      enabled: isLoaded && accessReady,
    },
  });

  // Push the server answer into the store. Signed-out always means no member,
  // no unlocks.
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setEntitlement({ entitled: false, unlocked: [], includedSlots: 3 });
      return;
    }
    if (data) setEntitlement(data);
  }, [isLoaded, isSignedIn, data, setEntitlement]);

  // Complete (or report) the Stripe Checkout return. Waits for a fresh access
  // token so the confirm call carries a valid `exo_access` cookie.
  useEffect(() => {
    if (!isLoaded || (isSignedIn && !accessReady)) return;
    const params = new URLSearchParams(window.location.search);
    const stripParams = () => {
      params.delete("unlocked");
      params.delete("unlock_cancelled");
      params.delete("session_id");
      const qs = params.toString();
      const next = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
      window.history.replaceState({}, "", next);
    };

    if (params.get("unlocked") === "1") {
      const sessionId = params.get("session_id");
      stripParams();
      if (!isSignedIn || !sessionId) return;
      confirm.mutate(
        { data: { sessionId } },
        {
          onSuccess: (res) => {
            setEntitlement(res);
            void queryClient.invalidateQueries({
              queryKey: getGetEntitlementQueryKey(),
            });
            if (res.entitled) {
              toast.success("You're a member — this researcher's galaxy is unlocked.");
            }
          },
          onError: () => {
            toast.error("We couldn't confirm your payment. Please contact support.");
          },
        },
      );
    } else if (params.get("unlock_cancelled") === "1") {
      stripParams();
      toast("Checkout cancelled — no charge was made.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, accessReady]);

  return null;
}
