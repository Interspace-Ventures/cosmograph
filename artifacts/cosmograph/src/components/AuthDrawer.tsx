import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useAppState } from "@/lib/store";
import { AuthHandoff } from "./AuthHandoff";
import { Drawer } from "./Drawer";
import { ExoSignInPanel } from "./ExoSignInPanel";

/**
 * Sign-in / sign-up as a cockpit panel instead of a full-screen route. Rises
 * from the Dashboard like Info / Ask / Personalize (mutually exclusive with
 * them, see the store). The panel hands off to Exo Key and returns to the
 * current galaxy; the standalone `/sign-in` and `/sign-up` routes still exist
 * for direct links, the staging boundary, and the iframe new-window handoff.
 */
export function AuthDrawer() {
  const { authOpen, authMode, setAuthOpen } = useAppState();
  const { isSignedIn } = useAuth();

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
        <AuthHandoff mode={authMode} bare>
          <ExoSignInPanel mode={authMode} bare />
        </AuthHandoff>
      </div>
    </Drawer>
  );
}
