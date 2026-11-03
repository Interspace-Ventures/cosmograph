import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { currentReturnPath, useExoSession } from "@/lib/exoSession";
import { AuthHandoff } from "./AuthHandoff";

/**
 * Exo Key sign-in surfaces, shown to people as "Exo Imprint" (EXO ADR 0019:
 * user-facing copy says Exo Imprint; identifiers, routes and env names stay). Cosmograph never
 * shows its own credential form: the button sends the visitor to Exo's
 * authorize page (PKCE), and /auth/callback finishes the hand-off.
 */

function returnPathForSignIn(): string {
  const path = currentReturnPath();
  // Never bounce back onto the auth routes themselves.
  return /^\/(sign-in|sign-up|auth\/callback)(\/|\?|$)/.test(path) ? "/" : path;
}

export function ExoSignInPanel({
  mode,
  bare = false,
}: {
  mode: "sign-in" | "sign-up";
  bare?: boolean;
}) {
  const exo = useExoSession();
  const [starting, setStarting] = useState(false);
  const title = mode === "sign-in" ? "Welcome back, cosmonaut" : "Become a cosmonaut";

  const start = () => {
    setStarting(true);
    exo.signIn(returnPathForSignIn()).catch(() => {
      setStarting(false);
      toast.error("Exo Imprint sign-in is unavailable right now. Please try again.");
    });
  };

  return (
    <AuthHandoff mode={mode} bare={bare}>
      <div
        className={
          bare
            ? "w-full max-w-md py-4 text-center"
            : "w-full max-w-md border border-white/10 bg-white/[0.03] p-8 text-center shadow-2xl backdrop-blur"
        }
      >
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Cosmograph signs you in with Exo Imprint: one identity, every
          researcher&apos;s galaxy.
        </p>
        <Button
          onClick={start}
          disabled={!exo.configured || starting}
          size="lg"
          className="mt-6 w-full gap-2"
        >
          {starting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}
          {exo.configured ? "Sign in with Exo Imprint" : "Exo Imprint unavailable"}
        </Button>
      </div>
    </AuthHandoff>
  );
}

/** /auth/callback: redeem the code in the browser, then go back in. */
export function ExoAuthCallback() {
  const exo = useExoSession();
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    exo.finishSignIn(window.location.search).then(
      (returnPath) => {
        if (!cancelled) setLocation(returnPath, { replace: true });
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error && err.message
            ? err.message
            : "Sign-in could not be completed.",
        );
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md border border-white/10 bg-white/[0.03] p-8 text-center shadow-2xl">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-foreground">
              Sign-in didn&apos;t finish
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">{error}</p>
            <Button
              className="mt-6 w-full"
              onClick={() => setLocation("/", { replace: true })}
            >
              Back to the galaxy
            </Button>
          </>
        ) : (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Signing you in…
          </p>
        )}
      </div>
    </div>
  );
}
