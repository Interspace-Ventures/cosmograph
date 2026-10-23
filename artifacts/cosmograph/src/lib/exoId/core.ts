// Exo Key (Exo ID) v1 relying-party client for Cosmograph (Exo ADR 0004).
// Mirrors Interspace-Ventures/universe lib/exo-id (PRs #29/#33/#34).
//
// Exo is the only OAuth client platform-wide. Cosmograph holds no provider
// secrets, no auth keys, and renders no provider buttons: it sends people to
// Exo's hosted authorize page (authorization code + PKCE S256) and redeems the
// one-time code at Exo's token endpoint for an app-scoped RS256 access token
// (aud = the Exo ID app, `cosmograph` by default; sub = Exo user id) plus a
// rotating refresh token. The API server verifies that token against Exo's
// public JWKS (artifacts/api-server/src/middlewares/exoIdentity.ts).
//
// This module is platform-free: storage, fetch, randomness, hashing, and the
// clock are injected, so the node test runner can exercise it. Browser
// bindings live in ./browser.ts.

export const EXO_ID_APP = "cosmograph";
/** Web callback, relative to the app base path (`/cosmograph/auth/callback`). */
export const EXO_ID_CALLBACK_ROUTE = "/auth/callback";
export const EXO_ID_STORAGE_KEY = "cosmograph.exoId";
export const EXO_ID_PENDING_KEY = "cosmograph.exoId.pending";
/** Refresh this long before the access token actually expires. */
export const EXO_ID_REFRESH_SKEW_MS = 60_000;
/** A started sign-in must come back from Exo within this window. */
export const EXO_ID_PENDING_MAX_AGE_MS = 10 * 60_000;

export type ExoIdConfig = {
  app: string;
  issuer: string;
  /** Null means "read authorization_endpoint from discovery". */
  authorizeUrl: string | null;
  tokenUrl: string;
  revokeUrl: string;
  discoveryUrl: string;
};

/** Storage may be sync (localStorage) or async (expo-secure-store). */
export type KeyValueStorage = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
};

export type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export type ExoIdUser = { id: string; email: string | null; name: string | null };

export type ExoIdTokens = {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds at which the access token expires. */
  expiresAt: number;
  user: ExoIdUser;
};

export type PendingSignIn = {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  returnPath: string;
  createdAt: number;
};

export class ExoIdError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(code: string, message: string, status: number | null = null) {
    super(message);
    this.name = "ExoIdError";
    this.code = code;
    this.status = status;
  }

  /**
   * Whether the grant itself is dead (revoked, rotated, expired, rejected)
   * rather than the request failing transiently. Terminal errors clear the
   * stored session; transient ones keep it for the next attempt.
   */
  get terminal(): boolean {
    return this.status === 400 || this.status === 401 || this.status === 403;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** HTTPS (or local HTTP) URL without credentials, query, or fragment; no trailing slash. */
export function normalizeEndpoint(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalHost(url.hostname))) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/**
 * Exo's issuer is always `${EXO_CONVEX_SITE_URL}/exo-id` (docs/exo-id.md in
 * Interspace-Ventures/exo). Accepts the Exo Convex site URL
 * (`*.convex.site`) or client URL (`*.convex.cloud`) so existing deployment
 * variables keep working until the explicit issuer variable is set.
 */
export function exoIdIssuerFromExoUrl(value: string | null | undefined): string | null {
  const endpoint = normalizeEndpoint(value);
  if (!endpoint) return null;
  const url = new URL(endpoint);
  if (url.pathname !== "" && url.pathname !== "/") return null;
  const host = url.host.replace(/\.convex\.cloud$/, ".convex.site");
  return `${url.protocol}//${host}/exo-id`;
}

/**
 * Resolve the Exo ID endpoints. `issuer` wins; otherwise it derives from the
 * Exo Convex URL. Token/revoke/discovery derive from the issuer. The
 * authorize page is an Exo web route (not under the issuer): pass it
 * explicitly or leave it null to read it from discovery at sign-in time.
 * Returns null when no safe issuer is available ("identity not configured").
 */
export function resolveExoIdConfig(env: {
  issuer?: string | null;
  exoConvexUrl?: string | null;
  authorizeUrl?: string | null;
  app?: string;
}): ExoIdConfig | null {
  const issuer = normalizeEndpoint(env.issuer) ?? exoIdIssuerFromExoUrl(env.exoConvexUrl);
  if (!issuer) return null;
  return {
    app: env.app ?? EXO_ID_APP,
    issuer,
    authorizeUrl: normalizeEndpoint(env.authorizeUrl),
    tokenUrl: `${issuer}/v1/token`,
    revokeUrl: `${issuer}/v1/revoke`,
    discoveryUrl: `${issuer}/.well-known/openid-configuration`,
  };
}

/** The configured authorize page, or `authorization_endpoint` from Exo discovery. */
export async function resolveAuthorizeEndpoint(config: ExoIdConfig, fetcher: Fetcher): Promise<string> {
  if (config.authorizeUrl) return config.authorizeUrl;
  let body: unknown = null;
  try {
    const response = await fetcher(config.discoveryUrl, {
      method: "GET",
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    body = response.ok ? await response.json() : null;
  } catch {
    body = null;
  }
  const endpoint = isRecord(body) && typeof body.authorization_endpoint === "string"
    ? normalizeEndpoint(body.authorization_endpoint)
    : null;
  if (!endpoint) {
    throw new ExoIdError("discovery_failed", "Exo could not be reached. Check your connection and try again.");
  }
  return endpoint;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Randomness + SHA-256, injectable because React Native has no WebCrypto. */
export type PkceCrypto = {
  randomBytes(length: number): Uint8Array;
  sha256(input: string): Promise<Uint8Array>;
};

export const webPkceCrypto: PkceCrypto = {
  randomBytes: (length) => globalThis.crypto.getRandomValues(new Uint8Array(length)),
  sha256: async (input) =>
    new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))),
};

/** 32 random bytes, base64url (43 chars) — used for both the PKCE verifier and state. */
export function randomToken(crypto: PkceCrypto, byteLength = 32): string {
  return base64UrlEncode(crypto.randomBytes(byteLength));
}

/** RFC 7636 S256 challenge: base64url(sha256(ascii(verifier))). */
export async function codeChallengeS256(verifier: string, crypto: PkceCrypto): Promise<string> {
  return base64UrlEncode(await crypto.sha256(verifier));
}

/** `${origin}${basePath}/auth/callback` — registered with Exo per environment. */
export function webCallbackUrl(origin: string, basePath = ""): string {
  const base = basePath.replace(/\/+$/, "");
  return `${origin.replace(/\/+$/, "")}${base && !base.startsWith("/") ? `/${base}` : base}${EXO_ID_CALLBACK_ROUTE}`;
}

export function buildAuthorizeUrl(
  authorizeEndpoint: string,
  params: { app: string; redirectUri: string; state: string; codeChallenge: string },
): string {
  const url = new URL(authorizeEndpoint);
  url.searchParams.set("app", params.app);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/**
 * Start a sign-in: mint verifier + state and return the Exo authorize URL
 * plus the pending record the caller must keep (session storage on web,
 * memory on native) until Exo redirects back.
 */
export async function beginSignIn(options: {
  config: ExoIdConfig;
  fetcher: Fetcher;
  redirectUri: string;
  returnPath: string;
  crypto?: PkceCrypto;
  now?: number;
}): Promise<{ url: string; pending: PendingSignIn }> {
  const crypto = options.crypto ?? webPkceCrypto;
  const pending: PendingSignIn = {
    state: randomToken(crypto),
    codeVerifier: randomToken(crypto),
    redirectUri: options.redirectUri,
    returnPath: options.returnPath,
    createdAt: options.now ?? Date.now(),
  };
  const endpoint = await resolveAuthorizeEndpoint(options.config, options.fetcher);
  const url = buildAuthorizeUrl(endpoint, {
    app: options.config.app,
    redirectUri: pending.redirectUri,
    state: pending.state,
    codeChallenge: await codeChallengeS256(pending.codeVerifier, crypto),
  });
  return { url, pending };
}

/** Validate a stored pending sign-in against the state Exo returned. */
export function checkPendingSignIn(
  raw: unknown,
  returnedState: string | null,
  now = Date.now(),
): PendingSignIn {
  let pending: unknown = raw;
  if (typeof raw === "string") {
    try {
      pending = JSON.parse(raw);
    } catch {
      pending = null;
    }
  }
  if (
    !isRecord(pending) ||
    typeof pending.state !== "string" ||
    typeof pending.codeVerifier !== "string" ||
    typeof pending.redirectUri !== "string" ||
    typeof pending.returnPath !== "string" ||
    typeof pending.createdAt !== "number"
  ) {
    throw new ExoIdError("no_pending_sign_in", "This sign-in was not started here. Start again.");
  }
  if (!returnedState || returnedState !== pending.state) {
    throw new ExoIdError("state_mismatch", "The sign-in response did not match this session. Start again.");
  }
  if (now - pending.createdAt > EXO_ID_PENDING_MAX_AGE_MS) {
    throw new ExoIdError("sign_in_expired", "This sign-in took too long. Start again.");
  }
  return pending as PendingSignIn;
}

export type CallbackParams = { code: string | null; state: string | null; error: string | null };

/**
 * Read `code`/`state`/`error` from a callback URL or search string without
 * relying on URL/URLSearchParams (incomplete on React Native).
 */
export function parseCallbackParams(urlOrSearch: string): CallbackParams {
  const withoutHash = urlOrSearch.split("#")[0] ?? "";
  const queryIndex = withoutHash.indexOf("?");
  const query = queryIndex === -1 ? (withoutHash.includes("=") ? withoutHash : "") : withoutHash.slice(queryIndex + 1);
  const values: Record<string, string> = {};
  for (const part of query.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const rawKey = eq === -1 ? part : part.slice(0, eq);
    const rawValue = eq === -1 ? "" : part.slice(eq + 1);
    try {
      const key = decodeURIComponent(rawKey.replace(/\+/g, " "));
      if (!(key in values)) values[key] = decodeURIComponent(rawValue.replace(/\+/g, " "));
    } catch {
      // Malformed escape: ignore the pair.
    }
  }
  return { code: values.code || null, state: values.state || null, error: values.error || null };
}

/** Throws for an Exo error redirect (e.g. access_denied); no-op otherwise. */
export function assertNoCallbackError(params: CallbackParams): void {
  if (!params.error) return;
  throw new ExoIdError(
    params.error,
    params.error === "access_denied" ? "Sign-in was cancelled." : `Exo could not sign you in (${params.error}).`,
  );
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** Validate a token-endpoint success body into the stored token set. */
export function parseTokenResponse(body: unknown, now = Date.now()): ExoIdTokens {
  if (
    !isRecord(body) ||
    typeof body.access_token !== "string" ||
    !body.access_token ||
    typeof body.refresh_token !== "string" ||
    !body.refresh_token ||
    typeof body.token_type !== "string" ||
    body.token_type.toLowerCase() !== "bearer" ||
    typeof body.expires_in !== "number" ||
    !Number.isFinite(body.expires_in) ||
    body.expires_in <= 0 ||
    !isRecord(body.user) ||
    typeof body.user.id !== "string" ||
    !body.user.id
  ) {
    throw new ExoIdError("invalid_token_response", "Exo returned an unexpected token response.");
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: now + body.expires_in * 1000,
    user: { id: body.user.id, email: optionalString(body.user.email), name: optionalString(body.user.name) },
  };
}

function isTokens(value: unknown): value is ExoIdTokens {
  return (
    isRecord(value) &&
    typeof value.accessToken === "string" &&
    typeof value.refreshToken === "string" &&
    typeof value.expiresAt === "number" &&
    isRecord(value.user) &&
    typeof value.user.id === "string"
  );
}

export async function loadTokens(storage: KeyValueStorage, key = EXO_ID_STORAGE_KEY): Promise<ExoIdTokens | null> {
  try {
    const raw = await storage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isTokens(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** True while the access token is usable for at least `skewMs` more. */
export function isAccessTokenFresh(tokens: ExoIdTokens, now = Date.now(), skewMs = EXO_ID_REFRESH_SKEW_MS): boolean {
  return tokens.expiresAt - skewMs > now;
}

/** Milliseconds until the access token should be refreshed (never negative). */
export function refreshDelayMs(tokens: ExoIdTokens, now = Date.now(), skewMs = EXO_ID_REFRESH_SKEW_MS): number {
  return Math.max(0, tokens.expiresAt - skewMs - now);
}

async function postJson(fetcher: Fetcher, url: string, body: Record<string, string>): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ExoIdError("network_error", "Exo could not be reached. Check your connection and try again.");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = isRecord(payload) && typeof payload.error === "string" ? payload.error : `http_${response.status}`;
    throw new ExoIdError(code, `Exo rejected the request (${code}).`, response.status);
  }
  return payload;
}

export async function exchangeAuthorizationCode(
  fetcher: Fetcher,
  config: ExoIdConfig,
  params: { code: string; redirectUri: string; codeVerifier: string },
  now: () => number = Date.now,
): Promise<ExoIdTokens> {
  const payload = await postJson(fetcher, config.tokenUrl, {
    grant_type: "authorization_code",
    app: config.app,
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });
  return parseTokenResponse(payload, now());
}

/** Refresh-token grant. Exo rotates the refresh token on every call. */
export async function refreshExoIdTokens(
  fetcher: Fetcher,
  config: ExoIdConfig,
  refreshToken: string,
  now: () => number = Date.now,
): Promise<ExoIdTokens> {
  const payload = await postJson(fetcher, config.tokenUrl, {
    grant_type: "refresh_token",
    app: config.app,
    refresh_token: refreshToken,
  });
  return parseTokenResponse(payload, now());
}

/** Best-effort revoke; sign-out proceeds locally even if Exo is unreachable. */
export async function revokeExoIdRefreshToken(fetcher: Fetcher, config: ExoIdConfig, refreshToken: string): Promise<boolean> {
  try {
    await postJson(fetcher, config.revokeUrl, { app: config.app, refresh_token: refreshToken });
    return true;
  } catch {
    return false;
  }
}

/** Finish a sign-in: check state, exchange the code, and return the tokens + pending record. */
export async function completeSignIn(options: {
  config: ExoIdConfig;
  fetcher: Fetcher;
  callback: CallbackParams;
  pending: unknown;
  now?: () => number;
}): Promise<{ tokens: ExoIdTokens; pending: PendingSignIn }> {
  const now = options.now ?? Date.now;
  assertNoCallbackError(options.callback);
  const pending = checkPendingSignIn(options.pending, options.callback.state, now());
  if (!options.callback.code) throw new ExoIdError("missing_code", "Exo did not return a sign-in code.");
  const tokens = await exchangeAuthorizationCode(
    options.fetcher,
    options.config,
    { code: options.callback.code, redirectUri: pending.redirectUri, codeVerifier: pending.codeVerifier },
    now,
  );
  return { tokens, pending };
}

/** Collapse concurrent calls into one in-flight promise. */
export function singleFlight<T>(task: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    inFlight ??= task().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

export type ExoIdSnapshot = {
  /** Storage has been read (always true for sync storage after construction). */
  loaded: boolean;
  tokens: ExoIdTokens | null;
  /** Refresh is failing transiently; the session is kept and recovery is scheduled. */
  degraded?: boolean;
  /** Bumps each time auth recovers from a transient failure. */
  authEpoch?: number;
};

export type ExoIdSession = ReturnType<typeof createExoIdSession>;

/** Runs `task` holding an exclusive lock shared by every tab (e.g. Web Locks). */
export type RefreshLock = <T>(task: () => Promise<T>) => Promise<T>;

/** Delays between transient refresh retries inside one refresh attempt. */
export const EXO_ID_REFRESH_RETRY_DELAYS_MS = [500, 2_000];
/** Backoff for background recovery after every retry failed transiently. */
export const EXO_ID_RECOVERY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];

/**
 * The signed-in Exo ID session: an observable token store mirrored to
 * storage, with deduplicated refresh.
 *
 * - Cross-tab: refreshes run under `lock` (Web Locks in browsers); after
 *   acquiring it the session re-reads storage and adopts any rotation another
 *   tab completed, so two tabs never submit the same rotating refresh token.
 *   A terminal refresh error (invalid_grant) only clears storage if it still
 *   holds the refresh token that failed.
 * - Sign-out / new sign-in bump a generation; a refresh resolving afterwards
 *   is discarded and its refresh token revoked (never resurrects a session).
 * - Transient failures (network, 5xx) retry briefly, then keep the session
 *   `degraded` and retry in the background; recovery bumps `authEpoch` so
 *   Convex providers re-authenticate without a reload.
 */
export function createExoIdSession(options: {
  config: ExoIdConfig;
  storage: KeyValueStorage;
  fetcher: Fetcher;
  now?: () => number;
  storageKey?: string;
  lock?: RefreshLock;
  sleep?: (ms: number) => Promise<void>;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}) {
  const { config, storage, fetcher } = options;
  const key = options.storageKey ?? EXO_ID_STORAGE_KEY;
  const now = options.now ?? Date.now;
  const lock: RefreshLock = options.lock ?? ((task) => task());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const schedule = options.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancel = options.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let snapshot: ExoIdSnapshot = { loaded: false, tokens: null, degraded: false, authEpoch: 0 };
  let generation = 0;
  let recoveryAttempt = 0;
  let recoveryHandle: unknown = null;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const publish = (tokens: ExoIdTokens | null) => {
    snapshot = { ...snapshot, loaded: true, tokens };
    emit();
  };

  const setDegraded = (degraded: boolean) => {
    if (Boolean(snapshot.degraded) === degraded) return;
    // Leaving degraded mode: Convex saw a null token earlier, so a new epoch
    // tells providers to fetch a token again.
    snapshot = { ...snapshot, degraded, authEpoch: (snapshot.authEpoch ?? 0) + (degraded ? 0 : 1) };
    emit();
  };

  const stopRecovery = () => {
    if (recoveryHandle !== null) cancel(recoveryHandle);
    recoveryHandle = null;
    recoveryAttempt = 0;
  };

  // Storage writes run strictly in call order, so a sign-out's deletion can
  // never be overtaken by a slower (async storage) write from a refresh.
  let writeQueue: Promise<void> = Promise.resolve();
  const persist = (tokens: ExoIdTokens | null) => {
    const write = async () => {
      try {
        if (tokens) await storage.setItem(key, JSON.stringify(tokens));
        else await storage.removeItem(key);
      } catch {
        // Storage failure keeps the in-memory session for this run.
      }
    };
    writeQueue = writeQueue.then(write, write);
    return writeQueue;
  };

  const store = async (tokens: ExoIdTokens | null) => {
    // Queue the write before notifying, so anything reacting to the new
    // snapshot (e.g. a refresh reading storage) sees it after it lands.
    const written = persist(tokens);
    publish(tokens);
    await written;
  };

  /** Read shared storage only after this session's own queued writes land. */
  const readStored = async () => {
    await writeQueue;
    return loadTokens(storage, key);
  };

  /** Replace the session from outside (sign-in completion, sign-out). */
  const setTokens = async (tokens: ExoIdTokens | null) => {
    generation += 1;
    stopRecovery();
    snapshot = { ...snapshot, degraded: false };
    await store(tokens);
  };

  const hydrate = singleFlight(async () => {
    const stored = await loadTokens(storage, key);
    if (!snapshot.loaded) publish(stored);
    return snapshot.tokens;
  });

  const refreshWithRetry = async (refreshToken: string): Promise<ExoIdTokens> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await refreshExoIdTokens(fetcher, config, refreshToken, now);
      } catch (error) {
        const terminal = error instanceof ExoIdError && error.terminal;
        const delay = EXO_ID_REFRESH_RETRY_DELAYS_MS[attempt];
        if (terminal || delay === undefined) throw error;
        await sleep(delay);
      }
    }
  };

  const scheduleRecovery = () => {
    if (recoveryHandle !== null) return;
    const delays = EXO_ID_RECOVERY_DELAYS_MS;
    const delay = delays[Math.min(recoveryAttempt, delays.length - 1)]!;
    recoveryAttempt += 1;
    recoveryHandle = schedule(() => {
      recoveryHandle = null;
      void refresh();
    }, delay);
  };

  /**
   * After discarding a stale refresh, only a genuinely new session (a new
   * sign-in here or in another tab) may be handed back — never the tokens
   * being signed out, nor any we just discarded.
   */
  const replacementSession = (...excluded: Array<ExoIdTokens | null | undefined>): ExoIdTokens | null => {
    const tokens = snapshot.tokens;
    if (!tokens || excluded.some((old) => old?.refreshToken === tokens.refreshToken)) return null;
    return isAccessTokenFresh(tokens, now()) ? tokens : null;
  };

  const refresh = singleFlight(() =>
    lock(async (): Promise<ExoIdTokens | null> => {
      const startedGeneration = generation;
      const current = snapshot.tokens;
      // Re-read under the lock: another tab may have rotated while we waited.
      const stored = await readStored();
      // The session was replaced (sign-out / sign-in) during the read.
      if (generation !== startedGeneration) return replacementSession(current, stored);
      if (!stored) {
        // Signed out elsewhere (another tab, or storage was cleared).
        if (current) publish(null);
        stopRecovery();
        return null;
      }
      if (current?.refreshToken !== stored.refreshToken) {
        // Another tab already rotated; adopt its result.
        publish(stored);
        if (isAccessTokenFresh(stored, now())) {
          stopRecovery();
          setDegraded(false);
          return stored;
        }
      }
      try {
        const next = await refreshWithRetry(stored.refreshToken);
        // Signed out (or in again) mid-refresh — in this tab (generation) or
        // another tab (shared storage no longer holds the token we rotated):
        // never resurrect the old session; retire the token Exo just issued.
        const latest = await readStored();
        if (generation !== startedGeneration || latest?.refreshToken !== stored.refreshToken) {
          void revokeExoIdRefreshToken(fetcher, config, next.refreshToken);
          if (generation === startedGeneration) {
            generation += 1;
            publish(latest);
          }
          return replacementSession(current, stored, next);
        }
        const committedGeneration = generation;
        await store(next);
        if (generation !== committedGeneration) {
          // Signed out (or in again) while the new tokens were being
          // persisted; the sign-out's queued deletion ran after our write.
          void revokeExoIdRefreshToken(fetcher, config, next.refreshToken);
          return replacementSession(current, stored, next);
        }
        stopRecovery();
        setDegraded(false);
        return next;
      } catch (error) {
        if (generation !== startedGeneration) return replacementSession(current, stored);
        if (!(error instanceof ExoIdError) || !error.terminal) {
          setDegraded(true);
          scheduleRecovery();
          return null;
        }
        stopRecovery();
        snapshot = { ...snapshot, degraded: false };
        const latest = await readStored();
        if (generation !== startedGeneration) return replacementSession(current, stored);
        if (latest && latest.refreshToken !== stored.refreshToken) {
          publish(latest);
          return isAccessTokenFresh(latest, now()) ? latest : null;
        }
        await store(null);
        return null;
      }
    }),
  );

  return {
    config,
    fetcher,
    getSnapshot: (): ExoIdSnapshot => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Read storage once. Safe to call repeatedly. */
    hydrate,
    setTokens,
    /** Try to recover now (e.g. the device came back online). */
    retryNow() {
      if (!snapshot.degraded) return;
      if (recoveryHandle !== null) cancel(recoveryHandle);
      recoveryHandle = null;
      void refresh();
    },
    /** Re-read storage (e.g. after a `storage` event from another tab). */
    async syncFromStorage() {
      const startedGeneration = generation;
      const stored = await readStored();
      // This tab replaced the session during the read; its own state wins.
      if (generation !== startedGeneration) return;
      const current = snapshot.tokens;
      if (stored?.refreshToken === current?.refreshToken && stored?.accessToken === current?.accessToken) return;
      // Another tab signed out or switched account: any refresh this tab still
      // has in flight is now stale. (A same-user rotation isn't a replacement.)
      if (!stored || !current || stored.user.id !== current.user.id) generation += 1;
      publish(stored);
      if (stored && snapshot.degraded && isAccessTokenFresh(stored, now())) {
        stopRecovery();
        setDegraded(false);
      }
    },
    /**
     * The access token for the API and Convex, refreshing when it is
     * (nearly) expired or when a caller forces it. Null = signed out or
     * refresh failed.
     */
    async getAccessToken({ forceRefresh = false }: { forceRefresh?: boolean } = {}): Promise<string | null> {
      if (!snapshot.loaded) await hydrate();
      const tokens = snapshot.tokens;
      if (!tokens) return null;
      if (!forceRefresh && isAccessTokenFresh(tokens, now())) return tokens.accessToken;
      return (await refresh())?.accessToken ?? null;
    },
    async signOut() {
      const cached = snapshot.tokens?.refreshToken;
      // Invalidate any in-flight refresh right away, let queued writes land,
      // then revoke what is persisted (another tab may have rotated since
      // this tab last synced) as well as this tab's cached token.
      generation += 1;
      await writeQueue;
      const persisted = (await loadTokens(storage, key))?.refreshToken;
      const refreshTokens = new Set([persisted, cached].filter((token): token is string => Boolean(token)));
      await setTokens(null);
      await Promise.all([...refreshTokens].map((token) => revokeExoIdRefreshToken(fetcher, config, token)));
    },
  };
}
