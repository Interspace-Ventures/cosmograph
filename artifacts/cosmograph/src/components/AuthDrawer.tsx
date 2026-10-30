import { useEffect } from "react";
import { useAppState } from "@/lib/store";
import { useAppSession } from "@/lib/session";
import { ExoSignInPanel } from "./ExoAuth";
import { Drawer } from "./Drawer";

/**
 * Sign-in / sign-up as a cockpit panel instead of a full-screen route. Rises
 * from the Dashboard like Info / Ask / Personalize (mutually exclusive with
 * them, see the store). The panel hands off to Exo Imprint; the standalone
 * `/sign-in` and `/sign-up` routes still exist for direct links.
 */
export function AuthDrawer() {
  const { authOpen, authMode, setAuthOpen } = useAppState();
  const { isSignedIn } = useAppSession();

  // Once the visitor is signed in, drop the panel automatically.
  useEffect(() => {
    if (isSignedIn && authOpen) setAuthOpen(false);
  }, [isSignedIn, authOpen, setAuthOpen]);

  return (
    <Drawer
      open={authOpen}
      onClose={() => setAuthOpen(false)}
      labelledBy="auth-drawer-title"
    >
      <h2 id="auth-drawer-title" className="sr-only">
        {authMode === "sign-in" ? "Welcome back, cosmonaut" : "Become a cosmonaut"}
      </h2>
      <div className="flex justify-center">
        <ExoSignInPanel mode={authMode} bare />
      </div>
    </Drawer>
  );
}
