import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createBrowserExoId,
  keepAccessTokenFresh,
  type BrowserExoId,
} from "@/lib/exoId/browser";
import { isAccessTokenFresh, type ExoIdSnapshot, type ExoIdUser } from "@/lib/exoId/core";
import { BASE_PATH, EXO_ID_CONFIG } from "@/lib/exoId/config";

// Cosmograph's only auth: Exo Key (Exo ID). The browser holds the Exo-issued
// tokens for app `cosmograph`, keeps the access token fresh, and mirrors it
// into the `exo_access` cookie (scoped to the app base path) so every
// same-origin /api call carries it, including behind the EXO gateway, which
// replaces caller Authorization headers. The server verifies it on every
// request against Exo's public JWKS; nothing here is trusted for access.

let instance: BrowserExoId | null = null;

/** The per-page Exo ID client, or null when this build has no Exo config. */
export function getExoId(): BrowserExoId | null {
  if (typeof window === "undefined" || !EXO_ID_CONFIG) return null;
  instance ??= createBrowserExoId({ config: EXO_ID_CONFIG, basePath: BASE_PATH });
  return instance;
}

export const exoAuthConfigured = EXO_ID_CONFIG !== null;

const EMPTY: ExoIdSnapshot = { loaded: true, tokens: null };
const noopSubscribe = () => () => {};

type AuthContextValue = { exo: BrowserExoId | null; snapshot: ExoIdSnapshot };
const AuthContext = createContext<AuthContextValue>({ exo: null, snapshot: EMPTY });

export function AuthProvider({ children }: { children: ReactNode }) {
  const exo = useMemo(() => getExoId(), []);
  const snapshot = useSyncExternalStore(
    exo ? exo.session.subscribe : noopSubscribe,
    () => exo?.session.getSnapshot() ?? EMPTY,
  );

  useEffect(() => {
    if (!exo) return;
    return keepAccessTokenFresh(exo, { cookiePath: BASE_PATH || "/" });
  }, [exo]);

  const value = useMemo(() => ({ exo, snapshot }), [exo, snapshot]);
  return (
    <AuthContext.Provider value={value}>
      <QueryCacheOnUserChange userId={snapshot.loaded ? (snapshot.tokens?.user.id ?? null) : undefined} />
      {children}
    </AuthContext.Provider>
  );
}

// Clears cached account queries whenever the signed-in Exo user changes
// (sign-in, sign-out, or a different account in another tab).
function QueryCacheOnUserChange({ userId }: { userId: string | null | undefined }) {
  const queryClient = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (userId === undefined) return;
    if (previous.current !== undefined && previous.current !== userId) {
      queryClient.clear();
    }
    previous.current = userId;
  }, [userId, queryClient]);
  return null;
}

export interface AuthState {
  configured: boolean;
  /** Stored session has been read. */
  isLoaded: boolean;
  isSignedIn: boolean;
  /**
   * Signed in with an unexpired access token, so the `exo_access` cookie the
   * API reads is current. Gate account API queries on this, not isSignedIn,
   * which is also true while a stale stored token is being refreshed.
   */
  accessReady: boolean;
  user: ExoIdUser | null;
  /** Hand off to Exo's authorize page; returns to `returnPath` (app-relative). */
  signIn: (returnPath?: string) => Promise<void>;
  /** Revoke at Exo and clear local tokens. */
  signOut: () => Promise<void>;
}

/** The current path + query, relative to the app base path. */
export function currentAppPath(): string {
  const { pathname, search } = window.location;
  const relative =
    BASE_PATH && pathname.startsWith(BASE_PATH)
      ? pathname.slice(BASE_PATH.length) || "/"
      : pathname;
  return `${relative}${search}`;
}

export function useAuth(): AuthState {
  const { exo, snapshot } = useContext(AuthContext);
  const signIn = useCallback(
    async (returnPath?: string) => {
      if (!exo) throw new Error("Sign-in is not configured for this build.");
      await exo.startSignIn(returnPath ?? currentAppPath());
    },
    [exo],
  );
  const signOut = useCallback(async () => {
    await exo?.signOut();
  }, [exo]);
  const tokens = snapshot.tokens;
  // Re-render just past access-token expiry so accessReady drops even when no
  // snapshot update arrives (e.g. refresh keeps failing while idle).
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!tokens) return;
    const delay = tokens.expiresAt - Date.now();
    if (delay <= 0) return;
    const handle = setTimeout(() => setTick((tick) => tick + 1), delay + 1);
    return () => clearTimeout(handle);
  }, [tokens]);
  return {
    configured: exoAuthConfigured,
    isLoaded: snapshot.loaded,
    isSignedIn: Boolean(tokens),
    accessReady: Boolean(tokens && isAccessTokenFresh(tokens, Date.now(), 0)),
    user: tokens?.user ?? null,
    signIn,
    signOut,
  };
}

/** Renders children only while signed in (after the session has loaded). */
export function SignedIn({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  return isLoaded && isSignedIn ? <>{children}</> : null;
}

/** Renders children only while signed out (after the session has loaded). */
export function SignedOut({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  return isLoaded && !isSignedIn ? <>{children}</> : null;
}
