import { useEffect } from "react";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useGetEntitlement,
  useConfirmCheckout,
  getGetEntitlementQueryKey,
} from "@workspace/api-client-react";
import { useAppState } from "@/lib/store";

// Bridges Clerk auth + the server entitlement into the galaxy store, and
// finishes the Stripe redirect handshake. Renders nothing. Web auth is
// cookie-based — no Bearer token is ever attached (the browser sends Clerk's
// session cookie on same-origin /api calls).
export function EntitlementBridge() {
  const { isLoaded, isSignedIn } = useAuth();
  const { setEntitlement } = useAppState();
  const queryClient = useQueryClient();
  const confirm = useConfirmCheckout();

  const { data } = useGetEntitlement({
    query: {
      queryKey: getGetEntitlementQueryKey(),
      enabled: isLoaded && !!isSignedIn,
    },
  });

  // Push the server answer into the store. Signed-out always means locked.
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setEntitlement(false);
      return;
    }
    if (data) setEntitlement(data.entitled);
  }, [isLoaded, isSignedIn, data, setEntitlement]);

  // Complete (or report) the Stripe Checkout return. Runs once we know the
  // user is signed in so the confirm call carries their session cookie.
  useEffect(() => {
    if (!isLoaded) return;
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
            setEntitlement(res.entitled);
            void queryClient.invalidateQueries({
              queryKey: getGetEntitlementQueryKey(),
            });
            if (res.entitled) {
              toast.success("Unlocked — explore any researcher's full galaxy.");
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
