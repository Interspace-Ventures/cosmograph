import { useEffect } from "react";
import { useUser } from "@clerk/react";
import { rememberAuth } from "@/lib/authMemory";
import { useAppSession } from "@/lib/session";
import { convexAccountEnabled } from "@/config/features";

// Records — locally, per browser — that this visitor has signed in, and which
// social provider they used (read from their Clerk external accounts). The
// signed-out cockpit uses this to greet returning visitors with "Sign In" (and
// their usual SSO) instead of the default "Sign Up". Renders nothing.
function ClerkAuthMemoryBridge() {
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;
    // Infer the SSO hint from the account's linked social providers. Clerk's
    // hosted <SignIn> doesn't surface the exact strategy of the last sign-in, so
    // we use the linked external account as a stand-in: a verified one if
    // present (most accounts have exactly one). No external account means a
    // plain email/password account — pass null so rememberAuth clears any stale
    // SSO label and the signed-out UI falls back to "Sign In".
    const accounts = user.externalAccounts ?? [];
    const verified = accounts.find((a) => a.verification?.status === "verified");
    const provider = (verified ?? accounts[0])?.provider ?? null;
    rememberAuth(provider);
  }, [isLoaded, isSignedIn, user]);

  return null;
}

// Exo Key: the provider choice happens on Exo's own page, so only remember
// that this browser has signed in before.
function ExoAuthMemoryBridge() {
  const { isLoaded, isSignedIn } = useAppSession();
  useEffect(() => {
    if (isLoaded && isSignedIn) rememberAuth(null);
  }, [isLoaded, isSignedIn]);
  return null;
}

export const AuthMemoryBridge = convexAccountEnabled
  ? ExoAuthMemoryBridge
  : ClerkAuthMemoryBridge;
