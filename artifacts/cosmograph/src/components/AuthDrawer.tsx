import { useEffect } from "react";
import { SignIn, SignUp, useAuth } from "@clerk/react";
import { useAppState } from "@/lib/store";
import { AuthHandoff } from "./AuthHandoff";
import { Drawer } from "./Drawer";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Sign-in / sign-up as a cockpit panel instead of a full-screen route. Rises
 * from the Dashboard like Info / Ask / Personalize (mutually exclusive with
 * them, see the store). Uses Clerk's `hash` routing so the widget's internal
 * steps live in the URL fragment without navigating away from the galaxy; the
 * standalone `/sign-in` and `/sign-up` routes still exist for direct links and
 * the iframe new-window handoff.
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
        {authMode === "sign-in" ? "Sign in" : "Create your account"}
      </h2>
      <div className="flex justify-center">
        <AuthHandoff mode={authMode}>
          {authMode === "sign-in" ? (
            <SignIn
              routing="hash"
              signUpUrl={`${basePath}/sign-up`}
              forceRedirectUrl={basePath || "/"}
            />
          ) : (
            <SignUp
              routing="hash"
              signInUrl={`${basePath}/sign-in`}
              forceRedirectUrl={basePath || "/"}
            />
          )}
        </AuthHandoff>
      </div>
    </Drawer>
  );
}
