import { motion, AnimatePresence } from "framer-motion";
import { Show } from "@clerk/react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { X, Lock, Heart, Rocket, Loader2, Telescope } from "lucide-react";
import { useCreateCheckout } from "@workspace/api-client-react";
import { useAppState } from "@/lib/store";

const SPONSOR_URL = "https://github.com/sponsors/heyinterspace";

export const PERKS = [
  "Rich detailed galaxy view with every sun and planet reflecting the researcher's body of work",
  "Dedicated researcher galaxy URL with customized dedication and unique guided tour, shareable with up to 3 cosmonauts",
  "Ask the galaxy: ask questions about any researcher's work or metrics and get a view of every paper in their galaxy",
  "Interactive visualization with first-person fly-through for any researcher's galaxy",
  "Every new feature and product update as it ships, instantly",
];

export function Paywall() {
  const {
    paywallOpen,
    setPaywallOpen,
    setEntitlement,
    activeAuthorLabel,
    activeAuthorId,
  } = useAppState();
  const [, setLocation] = useLocation();
  const checkout = useCreateCheckout();

  const goSignIn = () => {
    setPaywallOpen(false);
    setLocation("/sign-in");
  };

  const startCheckout = () => {
    // Carry the explored scientist through the Stripe round-trip so the success
    // redirect returns to this galaxy, not the default home scientist.
    checkout.mutate({ data: { author: activeAuthorId } }, {
      onSuccess: (res) => {
        if (res.alreadyEntitled) {
          setEntitlement(true);
          setPaywallOpen(false);
          toast.success("You're already a member — explore away.");
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
    });
  };

  return (
    <AnimatePresence>
      {paywallOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setPaywallOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel relative w-full max-w-md p-6"
          >
            <button
              onClick={() => setPaywallOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 text-ink-dim transition-colors hover:text-ink"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="grid h-10 w-10 shrink-0 place-items-center border-2 border-accent/60 bg-accent/10 text-accent">
                <Lock size={18} />
              </div>
              <div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                  Membership · $7 / year
                </span>
                <h2 className="text-xl font-title font-bold leading-tight tracking-tight text-ink">
                  Explore the full galaxy
                </h2>
              </div>
            </div>

            <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
              This is a preview of{" "}
              <span className="text-ink">{activeAuthorLabel}</span>'s cosmograph.
              For full access and a bunch of amazing features, subscribe for{" "}
              <span className="text-ink">$7 / year</span>.
            </p>

            <ul className="mt-4 space-y-2">
              {PERKS.map((perk) => (
                <li
                  key={perk}
                  className="flex items-start gap-2 text-[13px] text-ink"
                >
                  <Telescope
                    size={14}
                    className="mt-0.5 shrink-0 text-accent"
                  />
                  <span>{perk}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-col gap-2">
              <Show when="signed-out">
                <button
                  onClick={goSignIn}
                  style={{ background: "var(--accent)" }}
                  className="glass-panel glass-panel-interactive flex items-center justify-center gap-2 w-full py-3 font-display text-xs uppercase tracking-widest text-accent-foreground"
                >
                  <Rocket size={14} />
                  <span>Subscribe</span>
                </button>
              </Show>

              <Show when="signed-in">
                <button
                  onClick={startCheckout}
                  disabled={checkout.isPending}
                  style={{ background: "var(--accent)" }}
                  className="glass-panel glass-panel-interactive flex items-center justify-center gap-2 w-full py-3 font-display text-xs uppercase tracking-widest text-accent-foreground disabled:opacity-60"
                >
                  {checkout.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Lock size={14} />
                  )}
                  <span>
                    {checkout.isPending
                      ? "Starting checkout…"
                      : "Subscribe · $7/year"}
                  </span>
                </button>
              </Show>

              <a
                href={SPONSOR_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 border-2 border-edge bg-white/5 font-display text-[11px] uppercase tracking-widest text-ink-dim transition-colors hover:text-ink hover:bg-white/10"
              >
                <Heart size={13} />
                <span>Sponsor on GitHub</span>
              </a>
            </div>

            <p className="mt-3 text-center font-mono text-[10px] leading-relaxed text-ink-dim/70">
              Secure checkout by Stripe · $7/year, renews annually
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
