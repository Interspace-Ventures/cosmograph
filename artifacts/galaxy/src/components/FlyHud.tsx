import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Move3d } from "lucide-react";
import { useAppState } from "@/lib/store";
import { Cockpit } from "./Cockpit";

export function FlyHud() {
  const { cameraMode, tourActive, introFinished } = useAppState();
  const active = introFinished && !tourActive && cameraMode === "spaceship";
  const [showHint, setShowHint] = useState(false);
  const warpRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    setShowHint(true);
    const t = setTimeout(() => setShowHint(false), 6000);
    return () => clearTimeout(t);
  }, [active]);

  if (!active) return null;

  return (
    <>
      {/* Cockpit canopy sits behind the interactive UI (-z-10) but above the
          3D canvas, framing the fly view with its reticle, vignette and console. */}
      <Cockpit warpRef={warpRef} className="-z-10" />

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
              <span className="font-mono">W A S D</span> fly ·{" "}
              <span className="font-mono">← ↑ ↓ →</span> look ·{" "}
              <span className="font-mono">Q</span>/<span className="font-mono">E</span> roll ·{" "}
              <span className="font-mono">Space</span>/<span className="font-mono">Shift</span> up &amp; down
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
