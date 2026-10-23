// Browser bindings for the Exo ID client (./core.ts). Cosmograph is served
// under its app base path (e.g. https://staging.exo.now/cosmograph), so the
// redirect URI is `<origin><base>/auth/callback`, registered with Exo.
//
// Only import from client code: this module touches window, localStorage,
// sessionStorage, and document.cookie.

import {
  beginSignIn,
  completeSignIn,
  createExoIdSession,
  EXO_ID_PENDING_KEY,
  EXO_ID_STORAGE_KEY,
  ExoIdError,
  parseCallbackParams,
  refreshDelayMs,
  webCallbackUrl,
  type ExoIdConfig,
  type ExoIdSession,
} from "./core";

/**
 * Cookie the Cosmograph API reads the access token from. The EXO gateway
 * replaces caller-supplied Authorization headers, so same-origin browser calls
 * carry the token here (path-scoped, SameSite=Lax, same lifetime as the token).
 */
export const EXO_ACCESS_COOKIE = "exo_access";

export type BrowserExoId = {
  config: ExoIdConfig;
  session: ExoIdSession;
  redirectUri: () => string;
  /** Navigate to Exo to sign in, returning to `returnPath` (app-relative) afterwards. */
  startSignIn: (returnPath: string) => Promise<void>;
  /** Finish the redirect back from Exo and return the app-relative path to continue to. */
  completeSignIn: (search: string) => Promise<string>;
  /** Revoke at Exo and clear local tokens. The caller decides where to navigate. */
  signOut: () => Promise<void>;
};

/** Only same-app relative paths are honored as return targets. */
export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (raw.startsWith("/sign-in") || raw.startsWith("/auth/")) return "/";
  return raw;
}

export function createBrowserExoId(options: { config: ExoIdConfig; basePath: string }): BrowserExoId {
  const { config } = options;
  const basePath = options.basePath.replace(/\/+$/, "");
  const fetcher = (input: string, init: RequestInit) => window.fetch(input, init);
  // Serialize refresh-token rotation across tabs of the same origin.
  const lock =
    typeof navigator !== "undefined" && navigator.locks
      ? <T,>(task: () => Promise<T>) =>
          navigator.locks.request(`${EXO_ID_STORAGE_KEY}.refresh`, task) as unknown as Promise<T>
      : undefined;
  const session = createExoIdSession({ config, storage: window.localStorage, fetcher, lock });
  void session.hydrate();

  // Pick up sign-in, rotation, and sign-out from other tabs (including a
  // sign-in finished in a new top-level window opened from an iframe).
  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key === EXO_ID_STORAGE_KEY) void session.syncFromStorage();
  });
  // Recover a degraded session (transient refresh failure) once back online.
  window.addEventListener("online", () => session.retryNow());

  const redirectUri = () => webCallbackUrl(window.location.origin, basePath);

  return {
    config,
    session,
    redirectUri,
    async startSignIn(returnPath) {
      const { url, pending } = await beginSignIn({
        config,
        fetcher,
        redirectUri: redirectUri(),
        returnPath: safeReturnPath(returnPath),
      });
      window.sessionStorage.setItem(EXO_ID_PENDING_KEY, JSON.stringify(pending));
      window.location.assign(url);
    },
    async completeSignIn(search) {
      // The pending entry is removed on every path so a verifier is never replayed.
      const raw = window.sessionStorage.getItem(EXO_ID_PENDING_KEY);
      window.sessionStorage.removeItem(EXO_ID_PENDING_KEY);
      const { tokens, pending } = await completeSignIn({
        config,
        fetcher,
        callback: parseCallbackParams(search),
        pending: raw,
      });
      await session.setTokens(tokens);
      return safeReturnPath(pending.returnPath);
    },
    async signOut() {
      await session.signOut();
    },
  };
}

/** A no-op stand-in so callers can render "not configured" instead of throwing. */
export function exoIdNotConfigured(): ExoIdError {
  return new ExoIdError("not_configured", "Exo ID is not configured for this build.");
}

function writeAccessCookie(token: string | null, maxAgeSeconds: number, cookiePath: string): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const scope = `; Path=${cookiePath || "/"}; SameSite=Lax${secure}`;
  document.cookie = token
    ? `${EXO_ACCESS_COOKIE}=${encodeURIComponent(token)}; Max-Age=${Math.max(0, maxAgeSeconds)}${scope}`
    : `${EXO_ACCESS_COOKIE}=; Max-Age=0${scope}`;
}

/**
 * Keep the access token fresh while the page is open and mirror it into the
 * `exo_access` cookie for the Cosmograph API. Refreshes shortly before expiry
 * and again when the tab becomes visible. `onToken` also receives each token
 * Returns a cleanup function.
 */
export function keepAccessTokenFresh(
  exo: BrowserExoId,
  options: { cookiePath: string; onToken?: (token: string | null) => void },
): () => void {
  const { session } = exo;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastToken: string | null | undefined;

  const apply = () => {
    const { loaded, tokens } = session.getSnapshot();
    if (!loaded) return;
    if (timer) clearTimeout(timer);
    timer = null;
    const token = tokens?.accessToken ?? null;
    if (token !== lastToken) {
      lastToken = token;
      writeAccessCookie(token, tokens ? Math.floor((tokens.expiresAt - Date.now()) / 1000) : 0, options.cookiePath);
      options.onToken?.(token);
    }
    if (tokens) {
      timer = setTimeout(() => void session.getAccessToken(), refreshDelayMs(tokens));
    }
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") void session.getAccessToken().then(apply);
  };

  const unsubscribe = session.subscribe(apply);
  document.addEventListener("visibilitychange", onVisible);
  void session.getAccessToken().then(apply);
  apply();
  return () => {
    unsubscribe();
    document.removeEventListener("visibilitychange", onVisible);
    if (timer) clearTimeout(timer);
  };
}
