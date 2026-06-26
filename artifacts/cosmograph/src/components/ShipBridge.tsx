import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/react";
import { useGetShip, getGetShipQueryKey } from "@workspace/api-client-react";
import { useAppState } from "@/lib/store";

// Bridges the signed-in account's saved cosmonaut ship into the galaxy store.
// Renders nothing. When the account has a saved seed it overrides the local
// per-browser default so the chosen ship follows the user across devices (and is
// then broadcast to other cosmonauts by PresenceBroadcaster). Web auth is
// cookie-based — no Bearer token is attached.
export function ShipBridge() {
  const { isLoaded, isSignedIn } = useAuth();
  const { setShipSeed, setSavedShipSeed } = useAppState();
  // Whether we've already adopted the account's saved ship for THIS sign-in.
  // Adopting only once prevents a background refetch (focus/reconnect) from
  // clobbering a seed the user is mid-shuffle on (and hasn't saved yet).
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
      // Signed out: forget any server-saved seed; the local default stays. Allow
      // re-hydration on the next sign-in.
      setSavedShipSeed(null);
      hydratedRef.current = false;
      return;
    }
    if (!data) return;
    // Keep the dirty-state baseline current on every refetch...
    setSavedShipSeed(data.shipSeed ?? null);
    // ...but adopt the saved ship as the active one only on first hydration, so
    // later refetches don't overwrite the user's unsaved local selection.
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      if (data.shipSeed) setShipSeed(data.shipSeed);
    }
  }, [isLoaded, isSignedIn, data, setShipSeed, setSavedShipSeed]);

  return null;
}
