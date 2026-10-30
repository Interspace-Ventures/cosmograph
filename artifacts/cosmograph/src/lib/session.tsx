import { useEffect, useRef, useState, type ReactNode } from "react";
import { Show, UserButton, useAuth, useClerk } from "@clerk/react";
import { useConvexAuth } from "convex/react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { convexAccountEnabled } from "@/config/features";
import { useExoSession } from "@/lib/exoSession";

/**
 * One sign-in surface for the UI, whichever auth stack this build uses.
 * `convex-account` off (default): Clerk + Express, exactly as before.
 * `convex-account` on: Exo Key + Convex. The flag is a build-time constant, so
 * the hook chosen below never changes between renders.
 */
export interface AppSession {
  /** Auth state is known (no flash of the wrong UI). */
  isLoaded: boolean;
  /** Signed in AND accepted by the backend this build talks to. */
  isSignedIn: boolean;
  /** Start sign-in (Clerk's hosted flow, or the Exo PKCE redirect). */
  openSignIn: () => void;
  signOut: () => void;
}

function useClerkSession(): AppSession {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const clerk = useClerk();
  return {
    isLoaded,
    isSignedIn: !!isSignedIn,
    openSignIn: () => clerk.redirectToSignIn(),
    signOut: () => void signOut(),
  };
}

function useExoAppSession(): AppSession {
  const exo = useExoSession();
  const { isLoading, isAuthenticated } = useConvexAuth();
  return {
    isLoaded: !isLoading,
    isSignedIn: isAuthenticated,
    openSignIn: () => {
      exo.signIn().catch(() => {
        toast.error("Sign-in is unavailable right now. Please try again.");
      });
    },
    signOut: () => void exo.signOut(),
  };
}

export const useAppSession: () => AppSession = convexAccountEnabled
  ? useExoAppSession
  : useClerkSession;

function ExoShow({
  when,
  children,
}: {
  when: "signed-in" | "signed-out";
  children: ReactNode;
}) {
  const { isLoaded, isSignedIn } = useExoAppSession();
  if (!isLoaded) return null;
  return isSignedIn === (when === "signed-in") ? <>{children}</> : null;
}

/** Drop-in for Clerk's `<Show when=...>` on either stack. */
export const SessionShow: (props: {
  when: "signed-in" | "signed-out";
  children: ReactNode;
}) => ReactNode = convexAccountEnabled ? ExoShow : Show;

/** Avatar + sign-out menu for an Exo session (Clerk builds use UserButton). */
function ExoAccountButton() {
  const { user, signOut } = useExoSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);
  const label = user?.name || user?.email || "Exo Imprint account";
  const initial = label.trim().charAt(0).toUpperCase() || "?";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Account: ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-edge bg-accent/20 font-mono text-[11px] text-ink"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 min-w-[200px] border-2 border-edge bg-bg/95 p-2 backdrop-blur-xl">
          <p className="truncate px-1 pb-2 font-mono text-[11px] text-ink-dim">
            {label}
          </p>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="flex w-full items-center gap-2 px-1 py-1.5 font-mono text-[11px] uppercase tracking-widest text-ink hover:text-accent"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export const AccountButton: () => ReactNode = convexAccountEnabled
  ? ExoAccountButton
  : () => <UserButton />;
