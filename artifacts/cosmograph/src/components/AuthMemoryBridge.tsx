import { useEffect } from "react";
import { useUser } from "@clerk/react";
import { rememberAuth } from "@/lib/authMemory";

// Records — locally, per browser — that this visitor has signed in, and which
// social provider they used (read from their Clerk external accounts). The
// signed-out cockpit uses this to greet returning visitors with "Sign In" (and
// their usual SSO) instead of the default "Sign Up". Renders nothing.
export function AuthMemoryBridge() {
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
