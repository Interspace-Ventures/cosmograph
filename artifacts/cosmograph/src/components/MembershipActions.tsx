import { Show } from "@clerk/react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Lock, Loader2, Rocket } from "lucide-react";
import { useCreateCheckout } from "@workspace/api-client-react";
import { useAppState } from "@/lib/store";
import { useUnlockFlow } from "@/lib/useUnlockFlow";

const ACCENT = { background: "var(--accent)" } as const;
const BTN =
  "glass-panel glass-panel-interactive flex w-full items-center justify-center gap-2 py-3 font-display text-xs uppercase tracking-widest text-accent-foreground disabled:opacity-60";

// The membership call-to-action, shared by the Paywall modal and ScreenshotGate.
// It renders one of three states:
//   • signed-out          → "Subscribe" (routes to sign-in)
//   • signed-in non-member → "Subscribe · $7/year" (Stripe checkout)
//   • signed-in member     → "Unlock <name>" — free within the included slots, or
//                            "+$1/year" for each researcher beyond them.
export function MembershipActions({ onDone }: { onDone?: () => void }) {
  const {
    entitled,
    unlockedAuthors,
    includedSlots,
    activeAuthorId,
    activeAuthorLabel,
    setEntitlement,
  } = useAppState();
  const [, setLocation] = useLocation();
  const checkout = useCreateCheckout();
  const { unlock, unlocking } = useUnlockFlow();

  const isPaidSlot = unlockedAuthors.length >= includedSlots;
  const busy = checkout.isPending || unlocking;

  const goSignIn = () => {
    onDone?.();
    setLocation("/sign-in");
  };

  const startUnlock = () => {
    if (activeAuthorId) unlock(activeAuthorId, activeAuthorLabel, onDone);
  };

  const startCheckout = () => {
    // Carry the explored researcher through the Stripe round-trip so the success
    // redirect returns to this galaxy (encoded as ?author= in success_url).
    checkout.mutate(
      { data: { author: activeAuthorId } },
      {
        onSuccess: (res) => {
          if (res.alreadyEntitled) {
            // Already a member — this researcher just needs unlocking, not a new
            // subscription. Fall through to the unlock flow.
            if (activeAuthorId) unlock(activeAuthorId, activeAuthorLabel, onDone);
            else {
              setEntitlement({ entitled: true, unlocked: unlockedAuthors, includedSlots });
              onDone?.();
            }
            return;
          }
          if (res.url) {
            window.location.href = res.url;
          } else {
            toast.error("Could not start checkout. Please try again.");
          }
        },
        onError: () => {
          toast.error("Could not start checkout. Please try again.");
        },
      },
    );
  };

  return (
    <>
      <Show when="signed-out">
        <button onClick={goSignIn} style={ACCENT} className={BTN}>
          <Rocket size={14} />
          <span>Subscribe</span>
        </button>
      </Show>

      <Show when="signed-in">
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
              {unlocking
                ? "Unlocking…"
                : isPaidSlot
                  ? "Unlock · +$1/year"
                  : `Unlock ${activeAuthorLabel}`}
            </span>
          </button>
        ) : (
          <button
            onClick={startCheckout}
            disabled={busy}
            style={ACCENT}
            className={BTN}
          >
            {checkout.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Lock size={14} />
            )}
            <span>
              {checkout.isPending ? "Starting checkout…" : "Subscribe · $7/year"}
            </span>
          </button>
        )}
      </Show>
    </>
  );
}
