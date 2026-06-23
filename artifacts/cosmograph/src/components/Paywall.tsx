import { motion, AnimatePresence } from "framer-motion";
import { X, Heart, Telescope } from "lucide-react";
import { useAppState } from "@/lib/store";
import { MembershipActions } from "@/components/MembershipActions";
import { MembershipPitch } from "@/components/MembershipPitch";

const SPONSOR_URL = "https://github.com/sponsors/heyinterspace";

export const PERKS = [
  "Explore 3 researchers' full galaxies on your membership — add any more for $1/year each",
  "Rich detailed galaxy view with every sun and planet reflecting the researcher's body of work",
  "A dedicated, shareable URL for each researcher's galaxy with its own guided tour",
  "Ask Cosmos: ask questions about a researcher's work and watch matching papers light up",
  "Interactive first-person fly-through of any unlocked galaxy",
  "Every new feature and product update as it ships, instantly",
];

export function Paywall() {
  const { paywallOpen, setPaywallOpen } = useAppState();

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

            <MembershipPitch />

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
              <MembershipActions onDone={() => setPaywallOpen(false)} />
            </div>

            {/* Sponsor the project on GitHub. */}
            <div className="mt-4 border-t-2 border-edge pt-4">
              <p className="mb-2 text-center text-[12px] leading-relaxed text-ink-dim">
                If you like what you see and want to support this project,
                contribute:
              </p>
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
