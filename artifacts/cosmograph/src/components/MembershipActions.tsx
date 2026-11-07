import { useLocation } from "wouter";
import { toast } from "sonner";
import { Lock, Loader2, Rocket, ShieldCheck } from "lucide-react";
import { useAppState } from "@/lib/store";
import { SessionShow } from "@/lib/session";
import { useUnlockFlow } from "@/lib/useUnlockFlow";
import {
  checkoutErrorMessage,
  useBillingActions,
  type MemberPlan,
} from "@/lib/billingApi";

const ACCENT = { background: "var(--accent)" } as const;
const BTN =
  "glass-panel glass-panel-interactive flex w-full items-center justify-center gap-2 py-3 font-display text-xs uppercase tracking-widest text-accent-foreground disabled:opacity-60";

// The membership call-to-action, shared by the Paywall modal and ScreenshotGate.
// It renders one of three states:
//   • signed-out          → "Subscribe" (routes to sign-up — new visitors need an
//                            account first; the sign-up page links to sign-in)
//   • signed-in non-member → "Join · $9.99/year" or "Lifetime · $29.99"
//                            through Convex checkout.
//   • signed-in member     → "Unlock <name>" (researchers are included with
//                            membership).
export function MembershipActions({ onDone }: { onDone?: () => void }) {
  const {
    entitled,
    activeAuthorId,
    activeAuthorLabel,
  } = useAppState();
  const [, setLocation] = useLocation();
  const billing = useBillingActions();
  const { unlock, unlocking } = useUnlockFlow();

  const checkingOut = billing.pending;
  const busy = checkingOut || unlocking;

  const goSignUp = () => {
    onDone?.();
    setLocation("/sign-up");
  };

  const startUnlock = () => {
    if (activeAuthorId) unlock(activeAuthorId, activeAuthorLabel, onDone);
  };

  // Membership checkout through the Convex HTTP action. The researcher rides along and is unlocked by the verified
  // webhook once payment lands; the return URL itself grants nothing.
  const startConvexCheckout = (plan: MemberPlan) => {
    billing.startCheckout({ plan, author: activeAuthorId }).then(
      (res) => {
        if (res.alreadyEntitled) {
          if (activeAuthorId) unlock(activeAuthorId, activeAuthorLabel, onDone);
          else onDone?.();
          return;
        }
        if (res.url) window.location.href = res.url;
        else toast.error("Could not start checkout. Please try again.");
      },
      (err: unknown) => {
        toast.error(checkoutErrorMessage(err));
      },
    );
  };

  return (
    <>
      <SessionShow when="signed-out">
        <button onClick={goSignUp} style={ACCENT} className={BTN}>
          <Rocket size={14} />
          <span>Subscribe</span>
        </button>
      </SessionShow>

      <SessionShow when="signed-in">
        {entitled ? (
          <button
            onClick={startUnlock}
            disabled={busy}
            style={ACCENT}
            className={BTN}
          >
            {unlocking ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Lock size={14} />
            )}
            <span>
              {unlocking ? "Unlocking…" : `Unlock ${activeAuthorLabel}`}
            </span>
          </button>
        ) : (
          <>
            <button
              onClick={() => startConvexCheckout("annual")}
              disabled={busy}
              style={ACCENT}
              className={BTN}
            >
              {checkingOut ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Lock size={14} />
              )}
              <span>
                {checkingOut ? "Starting checkout…" : "Join · $9.99/year"}
              </span>
            </button>
            <button
              onClick={() => startConvexCheckout("lifetime")}
              disabled={busy}
              className="mt-2 w-full py-1.5 font-mono text-[11px] uppercase tracking-widest text-ink-dim underline-offset-4 hover:underline disabled:opacity-60"
            >
              Or lifetime · $29.99 once
            </button>
          </>
        )}
      </SessionShow>
    </>
  );
}

// Shown only to signed-out visitors, next to the Subscribe CTA. Spells out why
// the "Subscribe" button sends them to sign-up first — transparency about the
// account requirement (membership + unlocks are tied to the account, sync across
// devices, and billing stays self-serve) rather than a silent redirect.
export function WhyAccountNote() {
  return (
    <SessionShow when="signed-out">
      <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-ink-dim">
        <ShieldCheck size={13} className="mt-0.5 shrink-0 text-accent" />
        <span>
          Subscribing creates a free account first. It's how your membership and
          unlocked researchers stay tied to you — available on any device, with
          billing you can manage or cancel anytime.
        </span>
      </p>
    </SessionShow>
  );
}
