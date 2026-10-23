import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { rememberAuth } from "@/lib/authMemory";

// Records, locally per browser, that this visitor has signed in, so the
// signed-out cockpit greets returning visitors with "Sign In" instead of the
// default "Sign Up". Exo's access token does not say which provider was used
// (Exo's own sign-in page remembers the last provider itself), so no SSO hint
// is stored and any stale one from the Clerk era is cleared. Renders nothing.
export function AuthMemoryBridge() {
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    rememberAuth(null);
  }, [isLoaded, isSignedIn]);

  return null;
}
