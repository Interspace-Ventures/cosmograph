import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Move3d, X } from "lucide-react";
import { useAppState } from "@/lib/store";
import { useIsMobile } from "@/hooks/use-mobile";

// Fixed single-line height for every notification banner. Kept constant so the
// header chrome can push down by a predictable amount (no measuring) and so the
// strip reads as one standardized iPhone-style notification regardless of which
// banner is showing.
export const BANNER_HEIGHT = 34;

// How long the transient fly-controls hint stays up, and how long each banner
// shows before the queue rotates to the next when more than one is active.
const FLY_HINT_MS = 7000;
const CYCLE_MS = 6000;

type Banner = {
  id: string;
  accent: boolean;
  content: React.ReactNode;
  cta?: { label: string; onClick: () => void };
  onDismiss?: () => void;
};

// A single standardized notification strip pinned to the very top edge. Instead
// of floating toasts that occlude the galaxy, it slides down and the header
// chrome slides down with it (the store's bannerHeight). When more than one
// banner is active (e.g. the limited-time offer plus the fly-controls hint) it
// quietly cycles between them. On desktop it insets its right edge by the live
// console width so it never sits under the Mission Control rail (which renders
// above this overlay's stacking context); on mobile the console docks to the
// bottom, so the banner spans the full width.
export function BannerHost() {
  const {
    showDealBanner,
    dismissDealBanner,
    setCustomizeOpen,
    consoleOpen,
    cameraMode,
    tourActive,
    introFinished,
    setBannerHeight,
  } = useAppState();
  const isMobile = useIsMobile();
  const desktopRight = consoleOpen ? "min(12rem, 80vw)" : "3.5rem";

  // Fly-controls hint: re-shows each time the viewer enters spaceship mode, then
  // auto-expires so it never lingers.
  const [flyHintOn, setFlyHintOn] = useState(false);
  const flyActive = introFinished && !tourActive && cameraMode === "spaceship";
  useEffect(() => {
    if (!flyActive) {
      setFlyHintOn(false);
      return;
    }
    setFlyHintOn(true);
    const t = window.setTimeout(() => setFlyHintOn(false), FLY_HINT_MS);
    return () => window.clearTimeout(t);
  }, [flyActive]);

  const banners: Banner[] = [];
  if (flyHintOn) {
    banners.push({
      id: "fly",
      accent: false,
      content: (
        <span className="flex items-center gap-2.5">
          <Move3d size={14} className="shrink-0 text-accent" />
          <span className="font-mono text-[11px] leading-tight tracking-wide text-ink-dim">
            <span className="text-ink">W A S D</span> fly ·{" "}
            <span className="text-ink">← ↑ ↓ →</span> look ·{" "}
            <span className="text-ink">Q</span>/<span className="text-ink">E</span>{" "}
            roll · <span className="text-ink">Space</span>/
            <span className="text-ink">Shift</span> up &amp; down
          </span>
        </span>
      ),
    });
  }
  if (showDealBanner) {
    banners.push({
      id: "deal",
      accent: true,
      content: (
        <span className="flex items-center gap-2.5">
          <Sparkles size={13} className="shrink-0 text-accent" />
          <span className="font-mono text-[11px] leading-tight tracking-wide text-ink-dim">
            <span className="uppercase tracking-widest text-accent">
              Limited-time
            </span>{" "}
            — full membership for just{" "}
            <span className="text-ink">$7&nbsp;/&nbsp;year</span>.
          </span>
        </span>
      ),
      cta: { label: "See what's included", onClick: () => setCustomizeOpen(true) },
      onDismiss: dismissDealBanner,
    });
  }

  // Rotate through the active banners when more than one is showing.
  const count = banners.length;
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (count <= 1) {
      setIdx(0);
      return;
    }
    const t = window.setInterval(
      () => setIdx((i) => (i + 1) % count),
      CYCLE_MS,
    );
    return () => window.clearInterval(t);
  }, [count]);

  const current = count > 0 ? banners[idx % count] : null;
  const hasBanner = current !== null;

  // Publish the push-down height so the header chrome slides to make room.
  useEffect(() => {
    setBannerHeight(hasBanner ? BANNER_HEIGHT : 0);
    return () => setBannerHeight(0);
  }, [hasBanner, setBannerHeight]);

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key="banner-host"
          initial={{ y: "-100%" }}
          animate={{ y: 0 }}
          exit={{ y: "-100%" }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          style={{
            right: isMobile ? "0px" : desktopRight,
            height: BANNER_HEIGHT,
          }}
          className={`pointer-events-auto absolute left-0 top-0 z-40 overflow-hidden border-b-2 bg-[rgba(11,9,18,0.88)] backdrop-blur-md transition-[right] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            current.accent ? "border-accent/50" : "border-edge"
          }`}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="flex h-full items-center justify-center gap-2.5 px-9 text-center"
            >
              {current.content}
              {current.cta && (
                <button
                  onClick={current.cta.onClick}
                  className="shrink-0 border-2 border-accent/60 bg-accent/10 px-2.5 py-0.5 font-display text-[10px] uppercase tracking-widest text-accent transition-colors hover:bg-accent/20"
                >
                  {current.cta.label}
                </button>
              )}
            </motion.div>
          </AnimatePresence>
          {current.onDismiss && (
            <button
              onClick={current.onDismiss}
              aria-label="Dismiss"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-dim transition-colors hover:text-ink"
            >
              <X size={15} />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
