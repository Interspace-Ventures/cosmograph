import { useEffect } from "react";
import { SignIn, SignUp, useAuth } from "@clerk/react";
import { useAppState } from "@/lib/store";
import { AuthHandoff } from "./AuthHandoff";
import { Drawer } from "./Drawer";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Inside the drawer the panel itself is the container, so strip the Clerk
// card's own box (background + border) — otherwise it reads as a box inside
// a box. Merges with the global clerkAppearance; `!` wins over its classes.
const drawerAppearance = {
  elements: {
    cardBox: "!bg-transparent !border-0 !shadow-none w-[440px] max-w-full",
  },
};

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
        {authMode === "sign-in" ? "Welcome back, cosmonaut" : "Become a cosmonaut"}
      </h2>
      <div className="flex justify-center">
        <AuthHandoff mode={authMode} bare>
          {authMode === "sign-in" ? (
            <SignIn
              routing="hash"
              appearance={drawerAppearance}
              signUpUrl={`${basePath}/sign-up`}
              forceRedirectUrl={basePath || "/"}
            />
          ) : (
            <SignUp
              routing="hash"
              appearance={drawerAppearance}
              signInUrl={`${basePath}/sign-in`}
              forceRedirectUrl={basePath || "/"}
            />
          )}
        </AuthHandoff>
      </div>
    </Drawer>
  );
}
