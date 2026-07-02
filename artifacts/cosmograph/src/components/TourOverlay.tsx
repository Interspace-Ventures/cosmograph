import { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, ChevronRight, Compass } from "lucide-react";
import { useAppState } from "@/lib/store";
import { useIsMobile } from "@/hooks/use-mobile";
import { getTourStops } from "@/lib/tour";

export function TourOverlay() {
  const { tourActive, tourStopIndex, setTourStopIndex, endTour, cockpitWidth } =
    useAppState();
  const isMobile = useIsMobile();
  // Same geometry as the Drawer panels: clear the cockpit bar at the bottom
  // and match the navbar's real rendered width so the tour card reads as part
  // of the same instrument cluster.
  const bottomGap = isMobile ? "5.75rem" : "5rem";

  const tourStops = useMemo(() => getTourStops(), []);
  const stop = tourStops[tourStopIndex];
  const isLast = tourStopIndex >= tourStops.length - 1;

  useEffect(() => {
    if (!tourActive || !stop) return;
    const timer = setTimeout(() => {
      if (isLast) {
        endTour();
      } else {
        setTourStopIndex(tourStopIndex + 1);
      }
    }, stop.duration);
    return () => clearTimeout(timer);
  }, [tourActive, tourStopIndex, stop, isLast, setTourStopIndex, endTour]);

  if (!tourActive || !stop) return null;

  const advance = () => {
    if (isLast) endTour();
    else setTourStopIndex(tourStopIndex + 1);
  };

  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      <button
        onClick={endTour}
        className="absolute top-6 right-6 pointer-events-auto glass-panel glass-panel-interactive flex items-center gap-2 px-4 py-2 text-xs font-display uppercase tracking-wider text-ink"
      >
        Skip Tour
        <X size={14} />
      </button>

      <AnimatePresence mode="wait">
        <motion.div
          key={tourStopIndex}
          initial={{ opacity: 0, y: 30, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: -20, x: "-50%" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{
            left: "50%",
            bottom: bottomGap,
            // Match the cockpit navbar width exactly (same fallback as Drawer
            // until the first measurement lands).
            width: cockpitWidth
              ? `${cockpitWidth}px`
              : "min(34rem, calc(100vw - 1.5rem))",
          }}
          className="absolute pointer-events-auto glass-panel p-6 text-center"
        >
          <div className="flex items-center justify-center gap-2 mb-3 text-accent">
            {(() => {
              const Icon = stop.icon ?? Compass;
              return <Icon size={14} />;
            })()}
            <span className="text-xs font-display uppercase tracking-[0.3em]">
              Guided Tour
            </span>
          </div>

          <h2 className="text-2xl md:text-3xl font-display font-bold text-ink mb-3 leading-tight">
            {stop.title}
          </h2>
          <p className="text-sm md:text-base text-ink-dim leading-relaxed">
            {stop.caption}
          </p>

          <div className="flex items-center justify-between mt-6">
            <div className="flex items-center gap-1.5">
              {tourStops.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setTourStopIndex(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === tourStopIndex
                      ? "w-6 bg-accent"
                      : "w-1.5 bg-white/25 hover:bg-white/50"
                  }`}
                  aria-label={`Go to stop ${i + 1}`}
                />
              ))}
            </div>

            <button
              onClick={advance}
              className="glass-panel glass-panel-interactive flex items-center gap-1.5 px-4 py-2 text-xs font-display uppercase tracking-wider text-ink"
            >
              {isLast ? "Finish" : "Next"}
              <ChevronRight size={14} />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
