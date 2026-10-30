import { useEffect, useRef } from "react";
import { useAppState } from "@/lib/store";
import { useAppSession } from "@/lib/session";
import { useShipData } from "@/lib/accountApi";

// Bridges the signed-in account's saved cosmonaut ship into the galaxy store.
// Renders nothing. When the account has a saved seed/type it overrides the local
// per-browser default so the chosen ship follows the user across devices (and is
// then broadcast to other cosmonauts by PresenceBroadcaster).
export function ShipBridge() {
  const { isLoaded, isSignedIn } = useAppSession();
  const {
    setShipSeed,
    setSavedShipSeed,
    setShipTypeId,
    setSavedShipType,
    setOwnedShipTypes,
    setFreeShipSlotsRemaining,
  } = useAppState();
  // Whether we've already adopted the account's saved ship for THIS sign-in.
  // Adopting only once prevents a background refetch (focus/reconnect) from
  // clobbering a seed/type the user is mid-edit on (and hasn't saved yet).
  const hydratedRef = useRef(false);

  const data = useShipData(isLoaded && isSignedIn);

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

  return null;
}
