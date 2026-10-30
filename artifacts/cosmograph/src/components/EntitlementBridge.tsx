import { useEffect } from "react";
import { toast } from "sonner";
import { useAppState } from "@/lib/store";
import { useAppSession } from "@/lib/session";
import { useEntitlementData } from "@/lib/accountApi";

// Bridges the Exo Imprint session + the Convex entitlement into the galaxy
// store, and reports the Stripe return. Renders nothing.
export function EntitlementBridge() {
  const { isLoaded, isSignedIn } = useAppSession();
  const { setEntitlement } = useAppState();

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

  // The return from Stripe is only a message. The
  // membership is granted by the signature-verified webhook and arrives
  // through the reactive entitlement query; nothing here grants anything.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("checkout");
    if (outcome !== "success" && outcome !== "cancelled") return;
    params.delete("checkout");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash,
    );
    if (outcome === "success") {
      toast.success(
        "Payment received. Your membership turns on as soon as Stripe confirms it.",
      );
    } else {
      toast("Checkout cancelled — no charge was made.");
    }
  }, []);

  return null;
}
