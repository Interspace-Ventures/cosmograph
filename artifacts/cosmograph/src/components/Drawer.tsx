import { type ReactNode, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useAppState } from "@/lib/store";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Shared shell for every rich panel (Info, Ask, Personalize). Each panel now
 * RISES FROM THE COCKPIT: a bottom-anchored sheet that slides up and sits just
 * above the Dashboard bar, horizontally centred and width-capped so every panel
 * is the same size and behaves identically on desktop and mobile. One place
 * owns the scrim, the close button, the Escape handler, and the geometry.
 *
 * Panels are mutually exclusive (enforced in the store), so only one is ever
 * mounted at a time.
 */
export function Drawer({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}) {
  const { bannerHeight, cockpitWidth } = useAppState();
  const isMobile = useIsMobile();
  // Clear the Dashboard bar at the bottom (taller on mobile because each control
  // carries a caption); the sheet grows upward from there.
  const bottomGap = isMobile ? "5.75rem" : "5rem";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 pointer-events-auto"
        >
          <div
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={{ x: "-50%", y: "110%" }}
            animate={{ x: "-50%", y: 0 }}
            exit={{ x: "-50%", y: "110%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            style={{
              left: "50%",
              bottom: bottomGap,
              // Match the cockpit navbar width exactly. The published width is the
              // bar's real rendered size (already constrained to its padded
              // container), so use it verbatim — no extra viewport clamp, which
              // could leave the sheet narrower than the bar. Fall back to the
              // prior cap only until the first measurement lands.
              width: cockpitWidth
                ? `${cockpitWidth}px`
                : "min(34rem, calc(100vw - 1.5rem))",
              maxHeight: `calc(100dvh - ${bottomGap} - ${bannerHeight}px - 0.75rem)`,
            }}
            className="custom-scrollbar absolute overflow-y-auto border-2 border-edge bg-bg/95 p-5 backdrop-blur-xl sm:p-7"
          >
            <button
              onClick={onClose}
              aria-label="Close"
              autoFocus
              className="absolute top-4 right-4 z-10 text-ink-dim transition-colors hover:text-ink"
            >
              <X size={18} />
            </button>
            {children}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
