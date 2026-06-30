import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useGetShip,
  useConfirmSkin,
  getGetShipQueryKey,
} from "@workspace/api-client-react";
import { useAppState } from "@/lib/store";

// Bridges the signed-in account's saved cosmonaut ship into the galaxy store.
// Renders nothing. When the account has a saved seed/type it overrides the local
// per-browser default so the chosen ship follows the user across devices (and is
// then broadcast to other cosmonauts by PresenceBroadcaster). Web auth is
// cookie-based — no Bearer token is attached.
export function ShipBridge() {
  const { isLoaded, isSignedIn } = useAuth();
  const {
    setShipSeed,
    setSavedShipSeed,
    setShipTypeId,
    setSavedShipType,
    setOwnedShipTypes,
    setFreeShipSlotsRemaining,
  } = useAppState();
  const queryClient = useQueryClient();
  const confirm = useConfirmSkin();
  // Whether we've already adopted the account's saved ship for THIS sign-in.
  // Adopting only once prevents a background refetch (focus/reconnect) from
  // clobbering a seed/type the user is mid-edit on (and hasn't saved yet).
  const hydratedRef = useRef(false);

  const { data } = useGetShip({
    query: {
      queryKey: getGetShipQueryKey(),
      enabled: isLoaded && !!isSignedIn,
    },
  });

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      // Signed out: forget any server-saved seed/type; the local default stays.
      // Reset owned types to just the free scout and allow re-hydration next
      // sign-in.
      setSavedShipSeed(null);
      setSavedShipType(null);
      setOwnedShipTypes(["scout"]);
      setFreeShipSlotsRemaining(0);
      hydratedRef.current = false;
      return;
    }
    if (!data) return;
    // Keep the dirty-state baseline + owned set current on every refetch...
    setSavedShipSeed(data.shipSeed ?? null);
    setSavedShipType(data.shipType ?? null);
    setOwnedShipTypes(data.ownedTypes ?? ["scout"]);
    setFreeShipSlotsRemaining(data.freeSlotsRemaining ?? 0);
    // ...but adopt the saved ship as the active one only on first hydration, so
    // later refetches don't overwrite the user's unsaved local selection.
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      if (data.shipSeed) setShipSeed(data.shipSeed);
      if (data.shipType) setShipTypeId(data.shipType);
    }
  }, [
    isLoaded,
    isSignedIn,
    data,
    setShipSeed,
    setSavedShipSeed,
    setShipTypeId,
    setSavedShipType,
    setOwnedShipTypes,
    setFreeShipSlotsRemaining,
  ]);

  // Complete (or report) a $1 ship-type Stripe Checkout return. Mirrors the
  // researcher-unlock handshake in EntitlementBridge, but for the skin params
  // (skin_unlocked / skin_cancelled). On success the granted type is equipped
  // and the ship query refetched so ownedTypes/freeSlots refresh.
  useEffect(() => {
    if (!isLoaded) return;
    const params = new URLSearchParams(window.location.search);
    const stripParams = () => {
      params.delete("skin_unlocked");
      params.delete("skin_cancelled");
      params.delete("session_id");
      const qs = params.toString();
      const next =
        window.location.pathname +
        (qs ? `?${qs}` : "") +
        window.location.hash;
      window.history.replaceState({}, "", next);
    };

    if (params.get("skin_unlocked") === "1") {
      const sessionId = params.get("session_id");
      stripParams();
      if (!isSignedIn || !sessionId) return;
      confirm.mutate(
        { data: { sessionId } },
        {
          onSuccess: (res) => {
            setSavedShipSeed(res.shipSeed ?? null);
            setSavedShipType(res.shipType ?? null);
            setOwnedShipTypes(res.ownedTypes ?? ["scout"]);
            setFreeShipSlotsRemaining(res.freeSlotsRemaining ?? 0);
            if (res.shipType) setShipTypeId(res.shipType);
            void queryClient.invalidateQueries({
              queryKey: getGetShipQueryKey(),
            });
            toast.success("Ship type unlocked — it's yours to fly.");
          },
          onError: () => {
            toast.error(
              "We couldn't confirm your purchase. Please contact support.",
            );
          },
        },
      );
    } else if (params.get("skin_cancelled") === "1") {
      stripParams();
      toast("Checkout cancelled — no charge was made.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  return null;
}
