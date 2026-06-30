// Remembers — per browser, locally — that this visitor has signed in before and
// (if they used a social login) which provider they last used. Lets the
// signed-out cockpit show "Sign In" to returning visitors (and surface their
// usual SSO) while showing "Sign Up" to brand-new ones. Purely a UX hint; never
// trusted for auth and reset is harmless.

const SEEN_KEY = "cosmograph.auth.seen";
const SSO_KEY = "cosmograph.auth.sso";

// Providers we surface a labelled hint for. Anything else (or email/password)
// falls back to a plain "Sign In".
const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  github: "GitHub",
  apple: "Apple",
  microsoft: "Microsoft",
  facebook: "Facebook",
  discord: "Discord",
  x: "X",
};

export interface AuthMemory {
  /** True once the visitor has completed a sign-in at least once on this browser. */
  seen: boolean;
  /** Normalized provider id of the last social login (e.g. "google"), if any. */
  sso: string | null;
}

// Clerk's ExternalAccount.provider can arrive as "google" or "oauth_google";
// normalize to the bare provider id.
export function normalizeProvider(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const id = raw.replace(/^oauth_/, "").trim().toLowerCase();
  return id || null;
}

export function ssoLabel(sso: string | null): string | null {
  if (!sso) return null;
  return PROVIDER_LABELS[sso] ?? null;
}

export function readAuthMemory(): AuthMemory {
  if (typeof window === "undefined") return { seen: false, sso: null };
  try {
    return {
      seen: window.localStorage.getItem(SEEN_KEY) === "1",
      sso: window.localStorage.getItem(SSO_KEY),
    };
  } catch {
    return { seen: false, sso: null };
  }
}

// Record that the visitor has signed in, and the SSO provider they signed in
// with (or none). Writes the provider deterministically: a social sign-in sets
// it, a non-social one (email/password — no provider) clears any stale value so
// the signed-out UI doesn't keep naming an SSO the visitor no longer uses.
export function rememberAuth(provider?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
    const sso = normalizeProvider(provider);
    if (sso) window.localStorage.setItem(SSO_KEY, sso);
    else window.localStorage.removeItem(SSO_KEY);
  } catch {
    // Ignore quota/availability errors — this is a best-effort hint.
  }
}
