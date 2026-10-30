import { useEffect } from "react";
import { rememberAuth } from "@/lib/authMemory";
import { useAppSession } from "@/lib/session";

// Records, locally per browser, that this visitor has signed in before, so the
// signed-out cockpit greets them with "Sign In" instead of "Sign Up". The
// provider choice happens on Exo Imprint's own page, so no SSO hint is kept.
// Renders nothing.
export function AuthMemoryBridge() {
  const { isLoaded, isSignedIn } = useAppSession();
  useEffect(() => {
    if (isLoaded && isSignedIn) rememberAuth(null);
  }, [isLoaded, isSignedIn]);
  return null;
}
