// Exo Key (Exo ID v1) relying-party client for the Cosmograph SPA.
//
// Cosmograph is a public OAuth 2 client of Exo (Exo ADR 0004): it runs the
// authorization-code + PKCE (S256) flow, redeems the code IN THE BROWSER at
// the token endpoint, and hands the Exo-issued RS256 access token to Convex,
// which verifies it against Exo's JWKS (convex/auth.config.ts). There is no
// client secret anywhere. Modeled on Observatory's lib/exo-id.ts.
//
// Endpoints are read from the issuer's discovery document
// (`<issuer>/.well-known/openid-configuration`), never hardcoded: the
// authorize page lives on the Exo web app (staging.exo.now/id/authorize) and
// the token endpoint on Exo's Convex site.
//
// The Exo app id ("client_id" in OAuth terms, `cosmograph`) is sent as Exo's
// `app` parameter. That is what Exo's authorize page and token endpoint read
// for registered first-party apps; a bare `client_id` routes to Exo's
// third-party (CIMD/DCR) client path instead.
//
// Everything here is DOM-free (storage, fetch, randomness and the clock are
// injected) so node:test can exercise the whole flow.

export const EXO_ID_STORAGE_KEY = "cosmograph.exoId";
export const EXO_ID_PENDING_KEY = "cosmograph.exoId.pending";
export const EXO_ID_CALLBACK_ROUTE = "/auth/callback";
/** Refresh this long before the access token actually expires. */
export const EXO_ID_REFRESH_SKEW_MS = 60_000;
/** A started sign-in must come back from Exo within this window. */
export const EXO_ID_PENDING_MAX_AGE_MS = 10 * 60_000;

export type ExoIdEnv = { issuer: string; app: string };

export type ExoIdConfig = {
  app: string;
  issuer: string;
  authorizeUrl: string;
  tokenUrl: string;
  revokeUrl: string | null;
};

export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
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

  /** The grant itself is dead (rejected), not a transient failure. */
  get terminal() {
    return this.status === 400 || this.status === 401 || this.status === 403;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLocalHost(hostname: string) {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}

/** HTTPS (or local HTTP) URL without credentials, query or fragment. */
export function normalizeEndpoint(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && isLocalHost(url.hostname))
    ) {
      return null;
    }
    if (url.username || url.password || url.search || url.hash) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/**
 * Public build env -> issuer + app id, or null when missing/unsafe (the UI then
 * treats sign-in as unavailable: fail closed, never a bypass).
 */
export function resolveExoIdEnv(env: {
  issuer: string | undefined;
  clientId: string | undefined;
}): ExoIdEnv | null {
  const issuer = normalizeEndpoint(env.issuer);
  const app = env.clientId?.trim() ?? "";
  if (!issuer || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(app)) return null;
  return { issuer, app };
}

export function discoveryUrl(issuer: string) {
  return `${issuer}/.well-known/openid-configuration`;
}

/**
 * Validate a discovery document for this issuer. The document must name the
 * same issuer, offer the code flow with S256 PKCE, and give HTTPS endpoints.
 */
export function parseDiscovery(doc: unknown, env: ExoIdEnv): ExoIdConfig {
  const bad = (why: string) =>
    new ExoIdError("invalid_discovery", `Exo Imprint sign-in is misconfigured (${why}).`);
  if (!isRecord(doc)) throw bad("not an object");
  if (normalizeEndpoint(doc.issuer) !== env.issuer) throw bad("issuer mismatch");
  const authorizeUrl = normalizeEndpoint(doc.authorization_endpoint);
  const tokenUrl = normalizeEndpoint(doc.token_endpoint);
  if (!authorizeUrl || !tokenUrl) throw bad("missing endpoints");
  const methods = doc.code_challenge_methods_supported;
  if (Array.isArray(methods) && !methods.includes("S256")) {
    throw bad("S256 PKCE unsupported");
  }
  const types = doc.response_types_supported;
  if (Array.isArray(types) && !types.includes("code")) {
    throw bad("code flow unsupported");
  }
  return {
    app: env.app,
    issuer: env.issuer,
    authorizeUrl,
    tokenUrl,
    revokeUrl: normalizeEndpoint(doc.revocation_endpoint),
  };
}

export async function loadExoIdConfig(
  fetcher: Fetcher,
  env: ExoIdEnv,
): Promise<ExoIdConfig> {
  let response: Response;
  try {
    response = await fetcher(discoveryUrl(env.issuer), {
      method: "GET",
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new ExoIdError(
      "network_error",
      "Exo Imprint could not be reached. Check your connection and try again.",
    );
  }
  if (!response.ok) {
    throw new ExoIdError(
      "discovery_failed",
      "Exo Imprint sign-in is unavailable right now.",
      response.status,
    );
  }
  return parseDiscovery(await response.json().catch(() => null), env);
}

export function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type RandomSource = (bytes: Uint8Array) => Uint8Array;

const defaultRandom: RandomSource = (bytes) =>
  globalThis.crypto.getRandomValues(bytes);

/** 32 random bytes, base64url (43 chars): PKCE verifier and state. */
export function randomToken(random: RandomSource = defaultRandom, byteLength = 32) {
  return base64UrlEncode(random(new Uint8Array(byteLength)));
}

/** RFC 7636 S256: base64url(sha256(ascii(verifier))). */
export async function codeChallengeS256(verifier: string) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * `<origin><basePath>/auth/callback`, exactly as registered with Exo:
 * https://staging.exo.now/cosmograph/auth/callback on staging,
 * https://cosmograph.space/auth/callback in production.
 */
export function exoIdCallbackUrl(origin: string, basePath = "") {
  const base = basePath.replace(/\/+$/, "");
  return `${origin.replace(/\/+$/, "")}${base}${EXO_ID_CALLBACK_ROUTE}`;
}

/** Only same-app relative paths survive the round-trip (no open redirect). */
export function safeReturnPath(path: string | null | undefined) {
  if (
    !path ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.length > 512
  ) {
    return "/";
  }
  return path;
}

export function buildAuthorizeUrl(
  config: ExoIdConfig,
  params: { redirectUri: string; state: string; codeChallenge: string },
) {
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("app", config.app);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/** Mint verifier + state, persist them, return the Exo authorize URL. */
export async function beginSignIn(options: {
  config: ExoIdConfig;
  origin: string;
  basePath?: string;
  returnPath: string;
  storage: KeyValueStorage;
  now?: number;
  random?: RandomSource;
}) {
  const random = options.random ?? defaultRandom;
  const pending: PendingSignIn = {
    state: randomToken(random),
    codeVerifier: randomToken(random),
    redirectUri: exoIdCallbackUrl(options.origin, options.basePath),
    returnPath: safeReturnPath(options.returnPath),
    createdAt: options.now ?? Date.now(),
  };
  options.storage.setItem(EXO_ID_PENDING_KEY, JSON.stringify(pending));
  return buildAuthorizeUrl(options.config, {
    redirectUri: pending.redirectUri,
    state: pending.state,
    codeChallenge: await codeChallengeS256(pending.codeVerifier),
  });
}

/** Read and delete the pending sign-in (single use) and check `state`. */
export function consumePendingSignIn(
  storage: KeyValueStorage,
  returnedState: string | null,
  now = Date.now(),
): PendingSignIn {
  const raw = storage.getItem(EXO_ID_PENDING_KEY);
  storage.removeItem(EXO_ID_PENDING_KEY);
  let pending: unknown = null;
  try {
    pending = raw ? JSON.parse(raw) : null;
  } catch {
    pending = null;
  }
  if (
    !isRecord(pending) ||
    typeof pending.state !== "string" ||
    typeof pending.codeVerifier !== "string" ||
    typeof pending.redirectUri !== "string" ||
    typeof pending.returnPath !== "string" ||
    typeof pending.createdAt !== "number"
  ) {
    throw new ExoIdError(
      "no_pending_sign_in",
      "This sign-in was not started in this browser tab.",
    );
  }
  if (!returnedState || returnedState !== pending.state) {
    throw new ExoIdError(
      "state_mismatch",
      "The sign-in response did not match this browser session.",
    );
  }
  if (now - pending.createdAt > EXO_ID_PENDING_MAX_AGE_MS) {
    throw new ExoIdError("sign_in_expired", "This sign-in took too long. Start again.");
  }
  return { ...(pending as PendingSignIn), returnPath: safeReturnPath(pending.returnPath) };
}

function optionalString(value: unknown) {
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
    throw new ExoIdError(
      "invalid_token_response",
      "Exo Imprint returned an unexpected token response.",
    );
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: now + body.expires_in * 1000,
    user: {
      id: body.user.id,
      email: optionalString(body.user.email),
      name: optionalString(body.user.name),
    },
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

export function loadTokens(storage: KeyValueStorage): ExoIdTokens | null {
  try {
    const raw = storage.getItem(EXO_ID_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isTokens(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveTokens(storage: KeyValueStorage, tokens: ExoIdTokens) {
  storage.setItem(EXO_ID_STORAGE_KEY, JSON.stringify(tokens));
}

export function clearTokens(storage: KeyValueStorage) {
  storage.removeItem(EXO_ID_STORAGE_KEY);
}

export function isAccessTokenFresh(
  tokens: ExoIdTokens,
  now = Date.now(),
  skewMs = EXO_ID_REFRESH_SKEW_MS,
) {
  return tokens.expiresAt - skewMs > now;
}

async function postJson(fetcher: Fetcher, url: string, body: Record<string, string>) {
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
    throw new ExoIdError(
      "network_error",
      "Exo Imprint could not be reached. Check your connection and try again.",
    );
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `http_${response.status}`;
    throw new ExoIdError(code, `Exo Imprint rejected the request (${code}).`, response.status);
  }
  return payload;
}

export async function exchangeAuthorizationCode(
  fetcher: Fetcher,
  config: ExoIdConfig,
  params: { code: string; redirectUri: string; codeVerifier: string },
  now: () => number = Date.now,
) {
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
) {
  const payload = await postJson(fetcher, config.tokenUrl, {
    grant_type: "refresh_token",
    app: config.app,
    refresh_token: refreshToken,
  });
  return parseTokenResponse(payload, now());
}

/** Best-effort revoke; sign-out proceeds locally even if Exo is unreachable. */
export async function revokeExoIdRefreshToken(
  fetcher: Fetcher,
  config: ExoIdConfig,
  refreshToken: string,
) {
  if (!config.revokeUrl) return false;
  try {
    await postJson(fetcher, config.revokeUrl, {
      app: config.app,
      refresh_token: refreshToken,
    });
    return true;
  } catch {
    return false;
  }
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

/**
 * Finish the redirect: check `state` (and `iss` when Exo sends it, RFC 9207),
 * redeem the code in the browser, and return tokens plus the return path.
 */
export async function completeSignIn(options: {
  search: string;
  getConfig: () => Promise<ExoIdConfig>;
  pendingStorage: KeyValueStorage;
  fetcher: Fetcher;
  now?: () => number;
}): Promise<{ tokens: ExoIdTokens; returnPath: string }> {
  const now = options.now ?? Date.now;
  const params = new URLSearchParams(options.search);
  const error = params.get("error");
  if (error) {
    options.pendingStorage.removeItem(EXO_ID_PENDING_KEY);
    throw new ExoIdError(error, "Sign-in was cancelled or denied.");
  }
  const code = params.get("code");
  const pending = consumePendingSignIn(options.pendingStorage, params.get("state"), now());
  if (!code) throw new ExoIdError("missing_code", "Exo Imprint did not return a sign-in code.");
  const config = await options.getConfig();
  const iss = params.get("iss");
  if (iss !== null && normalizeEndpoint(iss) !== config.issuer) {
    throw new ExoIdError("issuer_mismatch", "The sign-in response came from an unexpected issuer.");
  }
  const tokens = await exchangeAuthorizationCode(
    options.fetcher,
    config,
    { code, redirectUri: pending.redirectUri, codeVerifier: pending.codeVerifier },
    now,
  );
  return { tokens, returnPath: pending.returnPath };
}

export type ExoIdSession = ReturnType<typeof createExoIdSession>;

/**
 * The signed-in session: an observable token store mirrored to storage, with
 * deduplicated, cross-tab-safe refresh (same contract as Observatory's).
 */
export function createExoIdSession(options: {
  getConfig: () => Promise<ExoIdConfig>;
  storage: KeyValueStorage;
  fetcher: Fetcher;
  now?: () => number;
}) {
  const { getConfig, storage, fetcher } = options;
  const now = options.now ?? Date.now;
  let tokens = loadTokens(storage);
  let epoch = 0;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const setTokens = (next: ExoIdTokens | null) => {
    tokens = next;
    if (next) saveTokens(storage, next);
    else clearTokens(storage);
    emit();
  };

  const adopt = (next: ExoIdTokens | null) => {
    tokens = next;
    emit();
  };

  const refresh = singleFlight(async (): Promise<ExoIdTokens | null> => {
    const stored = loadTokens(storage);
    if (!stored) {
      if (tokens) adopt(null);
      return null;
    }
    if (tokens?.refreshToken !== stored.refreshToken) {
      adopt(stored);
      if (isAccessTokenFresh(stored, now())) return stored;
    }
    const current = stored;
    const startedEpoch = epoch;
    try {
      const config = await getConfig();
      const next = await refreshExoIdTokens(fetcher, config, current.refreshToken, now);
      if (epoch !== startedEpoch) return null;
      if (!loadTokens(storage)) {
        if (tokens) adopt(null);
        return null;
      }
      setTokens(next);
      return next;
    } catch (error) {
      if (epoch !== startedEpoch) return null;
      if (!(error instanceof ExoIdError) || !error.terminal) return null;
      const latest = loadTokens(storage);
      if (latest && latest.refreshToken !== current.refreshToken) {
        adopt(latest);
        return isAccessTokenFresh(latest, now()) ? latest : null;
      }
      setTokens(null);
      return null;
    }
  });

  function endSession() {
    const refreshToken =
      tokens?.refreshToken ?? loadTokens(storage)?.refreshToken ?? null;
    epoch += 1;
    setTokens(null);
    return refreshToken;
  }

  return {
    getSnapshot: () => tokens,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setTokens,
    syncFromStorage() {
      const stored = loadTokens(storage);
      if (
        stored?.refreshToken === tokens?.refreshToken &&
        stored?.accessToken === tokens?.accessToken
      ) {
        return;
      }
      adopt(stored);
    },
    /** Access token for Convex; refreshes when (nearly) expired or forced. */
    async getAccessToken({ forceRefresh = false }: { forceRefresh?: boolean } = {}) {
      if (!tokens) return null;
      if (!forceRefresh && isAccessTokenFresh(tokens, now())) return tokens.accessToken;
      return (await refresh())?.accessToken ?? null;
    },
    /** Local tokens are gone before the (best-effort) revoke starts. */
    async signOut() {
      const refreshToken = endSession();
      if (!refreshToken) return;
      try {
        await revokeExoIdRefreshToken(fetcher, await getConfig(), refreshToken);
      } catch {
        // Already signed out locally.
      }
    },
  };
}
