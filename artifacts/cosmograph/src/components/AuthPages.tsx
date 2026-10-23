import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { getExoId, useAuth } from "@/lib/auth";
import { claimAutoSignIn } from "@/lib/exoId/autoSignIn";
import { safeReturnPath } from "@/lib/exoId/browser";
import { BASE_PATH } from "@/lib/exoId/config";
import { AuthHandoff } from "./AuthHandoff";
import { ExoSignInPanel } from "./ExoSignInPanel";

/** Full navigation to an app-relative path (re-runs the server boundary). */
function goTo(path: string, replace = false): void {
  const href = `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
  if (replace) window.location.replace(href);
  else window.location.assign(href);
}

function inIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

// Dismissible shell for the auth panel: a blurred backdrop over the galaxy with
// an explicit close button, click-outside, and Escape, all navigating back to
// the galaxy so sign-in reads as a panel you can leave, not a dead end.
function AuthModal({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const close = () => setLocation("/");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={close}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 px-4 backdrop-blur-sm"
    >
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={close}
          aria-label="Back to the galaxy"
          className="absolute -right-3 -top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 border-edge bg-background text-ink shadow-lg transition-colors hover:bg-white/10"
        >
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}

function hasAccessCookie(): boolean {
  return document.cookie
    .split(";")
    .some((part) => part.trim().startsWith("exo_access="));
}

/**
 * /sign-in and /sign-up. Reached directly, from the staging access boundary
 * (`?next=<path>`), or from the iframe new-window handoff.
 *
 * - Signed in with a fresh token mirrored to the cookie: return to `next`.
 * - Signed out: start the Exo handoff on its own (behind the EXO gateway the
 *   visitor already has an Exo session, so Exo comes straight back). Loop
 *   guard: at most two automatic tries per minute per tab, then the
 *   "Continue with Exo" button shows (Universe #33).
 */
export function SignInPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  const session = useAuth();
  const next = safeReturnPath(new URLSearchParams(window.location.search).get("next"));
  const [framed] = useState(inIframe);

  // Return only once a fresh token is in the cookie the server reads;
  // returning on a stale stored session would bounce straight back here.
  const [cookieReady, setCookieReady] = useState(false);
  useEffect(() => {
    if (!session.accessReady) {
      setCookieReady(false);
      return;
    }
    let tries = 0;
    let handle: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (hasAccessCookie()) setCookieReady(true);
      else if (++tries < 10) handle = setTimeout(check, 100);
    };
    check();
    return () => clearTimeout(handle);
  }, [session.accessReady]);
  const returning = session.accessReady && cookieReady;

  const [autoStarting, setAutoStarting] = useState(false);
  const autoTried = useRef(false);
  useEffect(() => {
    if (framed || autoTried.current) return;
    if (!session.configured || !session.isLoaded || session.isSignedIn) return;
    autoTried.current = true;
    if (!claimAutoSignIn(window.sessionStorage)) return;
    setAutoStarting(true);
    session.signIn(next).catch(() => setAutoStarting(false));
  }, [framed, session, next]);

  useEffect(() => {
    if (returning) goTo(next, true);
  }, [returning, next]);

  const status = returning
    ? "Signed in. Returning…"
    : autoStarting
      ? "Signing you in with Exo…"
      : !session.isLoaded
        ? "Checking your session…"
        : session.isSignedIn
          ? "Refreshing your session…"
          : null;

  return (
    <AuthModal>
      <AuthHandoff mode={mode}>
        {returning || autoStarting || !session.isLoaded ? (
          <div className="w-full max-w-md rounded-none border border-white/10 bg-white/[0.03] p-8 text-center shadow-2xl backdrop-blur">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {status}
            </p>
          </div>
        ) : (
          <>
            {status ? (
              <p aria-live="polite" className="mb-3 text-center text-sm text-muted-foreground">
                {status}
              </p>
            ) : null}
            <ExoSignInPanel mode={mode} returnPath={next} />
          </>
        )}
      </AuthHandoff>
    </AuthModal>
  );
}

/**
 * Exo ID redirect target (`<origin><base>/auth/callback`, registered with Exo
 * for app `cosmograph`). Exo sends `?code&state`; verify state, redeem the
 * code at Exo's token endpoint with the PKCE verifier, then continue to the
 * stored return path.
 */
export function AuthCallbackPage() {
  const [error, setError] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // the pending verifier is single-use
    ran.current = true;
    const exo = getExoId();
    if (!exo) {
      setError("Sign-in is not configured for this build.");
      return;
    }
    exo
      .completeSignIn(window.location.search)
      .then((returnPath) => goTo(returnPath, true))
      .catch((failure: unknown) => {
        setError(
          failure instanceof Error ? failure.message : "Sign-in could not be completed.",
        );
      });
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-none border border-white/10 bg-white/[0.03] p-8 text-center shadow-2xl backdrop-blur">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-foreground">Sign-in did not complete.</h1>
            <p role="alert" className="mt-3 text-sm text-red-400">
              {error}
            </p>
            <Button className="mt-6 w-full" size="lg" onClick={() => goTo("/sign-in")}>
              Back to sign in
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-foreground">Signing you in…</h1>
            <p aria-live="polite" className="mt-3 text-sm text-muted-foreground">
              Confirming your Exo account with Cosmograph.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
