import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { useAppState } from "@/lib/store";
import { useIsMobile } from "@/hooks/use-mobile";

// A slim, dismissable promo strip pinned to the very top edge. Shown only to
// non-members (and only until dismissed — persisted in the store). It nudges the
// $7/year deal and, rather than hard-selling inline, opens the Personalize
// drawer where every membership benefit is spelled out.
//
// On desktop the right "Mission Control" rail renders above this overlay's
// stacking context, so the banner's right edge (and its close button) must stay
// clear of the console — we inset the right side by the live console width, the
// same way HeaderActions does. On mobile the console docks to the bottom, so the
// banner spans the full width up top.
export function DealBanner() {
  const { showDealBanner, dismissDealBanner, setCustomizeOpen, consoleOpen } =
    useAppState();
  const isMobile = useIsMobile();
  const desktopRight = consoleOpen ? "min(12rem, 80vw)" : "3.5rem";

  return (
    <AnimatePresence>
      {showDealBanner && (
        <motion.div
          initial={{ y: "-100%" }}
          animate={{ y: 0 }}
          exit={{ y: "-100%" }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          style={{ right: isMobile ? "0px" : desktopRight }}
          className="pointer-events-auto absolute left-0 top-0 z-40 border-b-2 border-accent/50 bg-[rgba(11,9,18,0.85)] backdrop-blur-md transition-[right] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        >
          <div className="flex items-center justify-center gap-2.5 px-9 py-1.5 text-center">
            <Sparkles size={13} className="shrink-0 text-accent" />
            <p className="font-mono text-[11px] leading-tight tracking-wide text-ink-dim">
              <span className="uppercase tracking-widest text-accent">
                Limited-time
              </span>{" "}
              — full membership for just{" "}
              <span className="text-ink">$7&nbsp;/&nbsp;year</span>.
            </p>
            <button
              onClick={() => setCustomizeOpen(true)}
              className="shrink-0 border-2 border-accent/60 bg-accent/10 px-2.5 py-0.5 font-display text-[10px] uppercase tracking-widest text-accent transition-colors hover:bg-accent/20"
            >
              See what's included
            </button>
          </div>
          <button
            onClick={dismissDealBanner}
            aria-label="Dismiss offer"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-dim transition-colors hover:text-ink"
          >
            <X size={15} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
