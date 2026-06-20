import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Move3d } from "lucide-react";
import { useAppState } from "@/lib/store";

export function FlyHud() {
  const { cameraMode, tourActive, introFinished } = useAppState();
  const active = introFinished && !tourActive && cameraMode === "spaceship";
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (!active) return;
    setShowHint(true);
    const t = setTimeout(() => setShowHint(false), 6000);
    return () => clearTimeout(t);
  }, [active]);

  if (!active) return null;

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
        <div className="relative h-8 w-8 opacity-70">
          <div className="absolute inset-0 rounded-full border border-accent/40" />
          <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
          <div className="absolute left-1/2 top-0 h-2 w-px -translate-x-1/2 bg-accent/50" />
          <div className="absolute left-1/2 bottom-0 h-2 w-px -translate-x-1/2 bg-accent/50" />
          <div className="absolute top-1/2 left-0 h-px w-2 -translate-y-1/2 bg-accent/50" />
          <div className="absolute top-1/2 right-0 h-px w-2 -translate-y-1/2 bg-accent/50" />
        </div>
      </div>

      <AnimatePresence>
        {showHint && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="pointer-events-none absolute bottom-28 left-1/2 z-20 -translate-x-1/2 glass-panel flex items-center gap-3 px-5 py-3"
          >
            <Move3d size={16} className="shrink-0 text-accent" />
            <span className="text-sm text-ink">
              <span className="font-mono">Drag</span> to steer ·{" "}
              <span className="font-mono">W A S D</span> to fly ·{" "}
              <span className="font-mono">Space</span>/<span className="font-mono">Shift</span> up &amp; down
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
