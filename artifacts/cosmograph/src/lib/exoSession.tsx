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
import {
  ConvexProviderWithAuth,
  ConvexReactClient,
  useConvexAuth,
  useMutation,
} from "convex/react";
import {
  beginSignIn,
  completeSignIn,
  createExoIdSession,
  loadExoIdConfig,
  resolveExoIdEnv,
  singleFlight,
  type ExoIdConfig,
  type ExoIdSession,
  type ExoIdUser,
  EXO_ID_STORAGE_KEY,
} from "@/lib/exoId";
import { api } from "@/lib/convexApi";

/**
 * Exo Key sign-in for the SPA (migration Phase 2, behind `convex-account`).
 * Holds the Exo ID session, starts the PKCE redirect, finishes it on
 * /auth/callback, hands the access token to Convex through
 * ConvexProviderWithAuth, and calls `users.ensure` once Convex accepts it.
 *
 * Config is public build env: VITE_EXO_ID_ISSUER (endpoints come from its
 * discovery document), VITE_EXO_ID_CLIENT_ID (`cosmograph`) and
 * VITE_CONVEX_URL. Missing config means sign-in is unavailable, never bypassed.
 */

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const exoEnv = resolveExoIdEnv({
  issuer: import.meta.env.VITE_EXO_ID_ISSUER,
  clientId: import.meta.env.VITE_EXO_ID_CLIENT_ID,
});

const browserFetch = (input: string, init: RequestInit) =>
  window.fetch(input, init);

type ExoSessionValue = {
  configured: boolean;
  /** Exo tokens are held locally (Convex may still be validating them). */
  hasTokens: boolean;
  user: ExoIdUser | null;
  session: ExoIdSession | null;
  signIn: (returnPath?: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Finish the /auth/callback redirect; resolves to the return path. */
  finishSignIn: (search: string) => Promise<string>;
};

const ExoSessionContext = createContext<ExoSessionValue | null>(null);

/** The app-relative path (wouter location + query) to come back to. */
export function currentReturnPath(): string {
  const { pathname, search } = window.location;
  const path =
    basePath && pathname.startsWith(basePath)
      ? pathname.slice(basePath.length) || "/"
      : pathname;
  return `${path}${search}`;
}

const callbacks = new Map<string, Promise<string>>();

export function ExoSessionProvider({ children }: { children: ReactNode }) {
  const getConfig = useMemo(() => {
    if (!exoEnv) return null;
    let cached: ExoIdConfig | null = null;
    const load = singleFlight(() => loadExoIdConfig(browserFetch, exoEnv));
    return async () => (cached ??= await load());
  }, []);

  const session = useMemo(
    () =>
      getConfig
        ? createExoIdSession({
            getConfig,
            storage: window.localStorage,
            fetcher: browserFetch,
          })
        : null,
    [getConfig],
  );

  const tokens = useSyncExternalStore(
    session?.subscribe ?? (() => () => {}),
    session?.getSnapshot ?? (() => null),
  );

  // Another tab signed in, rotated or signed out.
  useEffect(() => {
    if (!session) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === EXO_ID_STORAGE_KEY) {
        session.syncFromStorage();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [session]);

  const signIn = useCallback(
    async (returnPath?: string) => {
      if (!getConfig) throw new Error("Exo Imprint sign-in is not configured.");
      const url = await beginSignIn({
        config: await getConfig(),
        origin: window.location.origin,
        basePath,
        returnPath: returnPath ?? currentReturnPath(),
        storage: window.sessionStorage,
      });
      window.location.assign(url);
    },
    [getConfig],
  );

  const signOut = useCallback(async () => {
    await session?.signOut();
  }, [session]);

  const finishSignIn = useCallback(
    (search: string) => {
      if (!getConfig || !session) {
        return Promise.reject(new Error("Exo Imprint sign-in is not configured."));
      }
      // The code is single use; StrictMode's double effect must share one try.
      let pending = callbacks.get(search);
      if (!pending) {
        pending = completeSignIn({
          search,
          getConfig,
          pendingStorage: window.sessionStorage,
          fetcher: browserFetch,
        }).then(({ tokens: next, returnPath }) => {
          session.setTokens(next);
          return returnPath;
        });
        callbacks.set(search, pending);
      }
      return pending;
    },
    [getConfig, session],
  );

  const value = useMemo<ExoSessionValue>(
    () => ({
      configured: !!session,
      hasTokens: !!tokens,
      user: tokens?.user ?? null,
      session,
      signIn,
      signOut,
      finishSignIn,
    }),
    [session, tokens, signIn, signOut, finishSignIn],
  );

  return (
    <ExoSessionContext.Provider value={value}>
      {children}
    </ExoSessionContext.Provider>
  );
}

export function useExoSession(): ExoSessionValue {
  const value = useContext(ExoSessionContext);
  if (!value) throw new Error("useExoSession needs <ExoSessionProvider>.");
  return value;
}

/** The `useAuth` contract ConvexProviderWithAuth expects, backed by Exo ID. */
function useExoAuthForConvex() {
  const { session, hasTokens } = useExoSession();
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) =>
      (await session?.getAccessToken({ forceRefresh: forceRefreshToken })) ??
      null,
    [session],
  );
  return useMemo(
    () => ({ isLoading: false, isAuthenticated: hasTokens, fetchAccessToken }),
    [hasTokens, fetchAccessToken],
  );
}

/**
 * Create the account row once Convex has accepted the Exo token. The identity
 * comes only from the verified token; `users.ensure` takes no arguments.
 */
function EnsureConvexUser() {
  const { isAuthenticated } = useConvexAuth();
  const { user } = useExoSession();
  const ensure = useMutation(api.users.ensure);
  const ensuredFor = useRef<string | null>(null);

  useEffect(() => {
    const subject = user?.id ?? null;
    if (!isAuthenticated || !subject) {
      if (!subject) ensuredFor.current = null;
      return;
    }
    if (ensuredFor.current === subject) return;
    ensuredFor.current = subject;
    ensure({}).catch(() => {
      ensuredFor.current = null; // retry on the next auth change
    });
  }, [isAuthenticated, user?.id, ensure]);

  return null;
}

export function ExoConvexProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    const url = import.meta.env.VITE_CONVEX_URL;
    if (!url) {
      throw new Error(
        "Missing VITE_CONVEX_URL: the convex-account flag needs a Convex deployment.",
      );
    }
    return new ConvexReactClient(url);
  });
  return (
    <ConvexProviderWithAuth client={client} useAuth={useExoAuthForConvex}>
      <EnsureConvexUser />
      {children}
    </ConvexProviderWithAuth>
  );
}
