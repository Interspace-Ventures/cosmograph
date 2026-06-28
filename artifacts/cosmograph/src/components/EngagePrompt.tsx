import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Star, Share2, X, Sparkles } from "lucide-react";
import { SITE } from "@/config/site";
import { ShareModal } from "./ShareModal";

// A visitor who has lingered this long is almost certainly engaged — that's the
// right moment for a gentle, one-time ask. Persisted so it never shows twice.
const SEEN_KEY = "cosmograph:engagePromptSeen";
const DELAY_MS = 45_000;

const ACTION =
  "flex items-center gap-2 border-2 border-edge bg-white/5 px-3 py-2 font-display text-[11px] uppercase tracking-widest text-ink-dim transition-colors hover:bg-white/10 hover:text-ink";

export function EngagePrompt() {
  const [show, setShow] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // ignore (private mode / storage disabled)
    }
    if (seen) return;
    // Mark seen the moment it appears — not just on dismiss — so a visitor who
    // glances at it and leaves never gets it again on a later visit.
    const t = window.setTimeout(() => {
      setShow(true);
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {
        // ignore (private mode / storage disabled)
      }
    }, DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore (private mode / storage disabled)
    }
  };

  return (
    <>
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="glass-panel pointer-events-auto absolute bottom-24 left-3 right-3 z-30 p-4 md:bottom-6 md:left-6 md:right-auto md:w-[20rem]"
          >
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="absolute right-2.5 top-2.5 text-ink-dim transition-colors hover:text-ink"
            >
              <X size={15} />
            </button>
            <div className="flex items-center gap-2 pr-6">
              <Sparkles size={14} className="shrink-0 text-accent" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                Enjoying Cosmograph?
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">
              If wandering these stars brought you a moment of wonder, help it
              reach more of the galaxy.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <a
                href={SITE.github.sponsors}
                target="_blank"
                rel="noopener noreferrer"
                onClick={dismiss}
                className={ACTION}
              >
                <Heart size={13} className="shrink-0 text-accent" />
                <span>Support with a sponsorship</span>
              </a>
              <a
                href={SITE.github.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={dismiss}
                className={ACTION}
              >
                <Star size={13} className="shrink-0 text-accent" />
                <span>Star our repo</span>
              </a>
              <button
                onClick={() => {
                  setShareOpen(true);
                  dismiss();
                }}
                className={ACTION}
              >
                <Share2 size={13} className="shrink-0 text-accent" />
                <span>Spread the word</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
    </>
  );
}
