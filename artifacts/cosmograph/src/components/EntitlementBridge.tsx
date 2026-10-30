import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useConfirmCheckout,
  getGetEntitlementQueryKey,
} from "@workspace/api-client-react";
import { useAppState } from "@/lib/store";
import { useAppSession } from "@/lib/session";
import { useEntitlementData } from "@/lib/accountApi";
import { convexAccountEnabled } from "@/config/features";

// Bridges Clerk auth + the server entitlement into the galaxy store, and
// finishes the Stripe redirect handshake. Renders nothing. Web auth is
// cookie-based — no Bearer token is ever attached (the browser sends Clerk's
// session cookie on same-origin /api calls).
export function EntitlementBridge() {
  const { isLoaded, isSignedIn } = useAppSession();
  const { setEntitlement } = useAppState();
  const queryClient = useQueryClient();
  const confirm = useConfirmCheckout();

  const data = useEntitlementData(isLoaded && isSignedIn);

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

  // Complete (or report) the Stripe Checkout return. Runs once we know the
  // user is signed in so the confirm call carries their session cookie.
  useEffect(() => {
    if (!isLoaded) return;
    // Membership checkout moves to Convex + a Stripe webhook in Phase 3; a
    // Convex build never starts an Express checkout, so there's nothing to
    // confirm here (payment state never comes from the browser).
    if (convexAccountEnabled) return;
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
  }, [isLoaded, isSignedIn]);

  return null;
}
