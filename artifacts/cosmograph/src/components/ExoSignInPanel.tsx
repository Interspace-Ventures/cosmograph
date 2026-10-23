import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

/**
 * The one sign-in control: hands off to Exo Key's hosted sign-in page
 * (Google, GitHub, or phone), which returns to /auth/callback. First-time
 * visitors get an account by continuing; there is no separate sign-up form.
 */
export function ExoSignInPanel({
  mode,
  returnPath,
  bare = false,
}: {
  mode: "sign-in" | "sign-up";
  /** App-relative path to land on afterwards; defaults to the current page. */
  returnPath?: string;
  bare?: boolean;
}) {
  const { configured, signIn } = useAuth();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const start = () => {
    setStarting(true);
    setError("");
    signIn(returnPath).catch((failure: unknown) => {
      setStarting(false);
      setError(
        failure instanceof Error ? failure.message : "Sign-in could not start.",
      );
    });
  };

  return (
    <div
      className={
        bare
          ? "w-full max-w-md py-4 text-center"
          : "w-full max-w-md rounded-none border border-white/10 bg-white/[0.03] p-8 text-center shadow-2xl backdrop-blur"
      }
    >
      <h1 className="text-xl font-semibold text-foreground">
        {mode === "sign-in" ? "Welcome back, cosmonaut" : "Become a cosmonaut"}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {mode === "sign-in"
          ? "Sign in with Exo to unlock the full galaxy."
          : "One account, every researcher's galaxy. Continuing with Exo creates it."}
      </p>
      {!configured ? (
        <p role="alert" className="mt-6 text-sm text-red-400">
          Sign-in is not configured for this build (VITE_EXO_ID_ISSUER is unset).
        </p>
      ) : (
        <Button
          onClick={start}
          disabled={starting}
          size="lg"
          className="mt-6 w-full gap-2"
        >
          {starting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}
          {starting ? "Opening Exo…" : "Continue with Exo"}
        </Button>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
