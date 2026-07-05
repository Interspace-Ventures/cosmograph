import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, ChevronRight, Compass } from "lucide-react";
import { useAppState } from "@/lib/store";
import { useIsMobile } from "@/hooks/use-mobile";
import { getTourStops } from "@/lib/tour";
import { askQueryToFilters, runAskQuery } from "@/data/galaxy";
import { ChatMessage } from "./ui/chat";
import { MessageCircleStar } from "./MessageCircleStar";

export function TourOverlay() {
  const {
    tourActive,
    tourStopIndex,
    setTourStopIndex,
    endTour,
    cockpitWidth,
    filters,
    setFilters,
  } = useAppState();
  // Always-current filters snapshot so the ask-demo can restore whatever the
  // user had before the tour (rather than blindly resetting to all-on).
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const isMobile = useIsMobile();
  // Clear the cockpit navbar at the bottom and match its real rendered width so
  // the tour card reads as part of the same instrument cluster. Desktop needs a
  // larger gap than the Drawer panels because the navbar sits higher there
  // (md:pb-10) — 5rem left the card's bottom edge tucked under the bar.
  const bottomGap = isMobile ? "5.75rem" : "6.75rem";

  const tourStops = useMemo(() => getTourStops(), []);
  const stop = tourStops[tourStopIndex];
  const isLast = tourStopIndex >= tourStops.length - 1;

  // Deterministic result for the Ask-Cosmo demo card (same query that lights up
  // the galaxy). Computed in-browser — the count shown always matches what's lit.
  const askDemo = useMemo(() => {
    if (!stop?.ask || !stop.askPrompt) return null;
    const r = runAskQuery(stop.ask);
    return { prompt: stop.askPrompt, count: r.count, total: r.total };
  }, [stop]);

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

  // Ask-Cosmo demo: while an "ask" stop is showing, push its deterministic
  // query through the normal filters path so matching planets light up. On leave
  // (stop change, Skip/end, unmount) restore the exact filters the user had
  // before the demo — not a blanket reset — so a pre-filtered session survives.
  useEffect(() => {
    if (!tourActive || !stop?.ask) return;
    const prev = filtersRef.current;
    setFilters(askQueryToFilters(stop.ask));
    return () => setFilters(prev);
  }, [tourActive, tourStopIndex, stop, setFilters]);

  if (!tourActive || !stop) return null;

  const advance = () => {
    if (isLast) endTour();
    else setTourStopIndex(tourStopIndex + 1);
  };

  return (
    <div className="absolute inset-0 z-40 pointer-events-none">
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
            // The ask stop shows a two-column layout (Ask demo | tour text), so
            // it needs a wider card; other stops match the cockpit navbar width
            // exactly (same fallback as Drawer until the first measurement lands).
            width: askDemo
              ? "min(48rem, calc(100vw - 1.5rem))"
              : cockpitWidth
                ? `${cockpitWidth}px`
                : "min(34rem, calc(100vw - 1.5rem))",
          }}
          className="absolute pointer-events-auto border-2 border-edge bg-bg/95 backdrop-blur-xl px-5 py-3.5 text-left sm:px-6 sm:py-4"
        >
          <div
            className={
              askDemo
                ? "flex flex-col gap-4 md:flex-row md:items-stretch md:gap-5"
                : ""
            }
          >
            {/* Ask-Cosmo demo sits SIDE BY SIDE with the tour text on this stop
                (a faithful, non-modal mock of the Ask panel — the real drawer's
                scrim would black out the galaxy behind it). */}
            {askDemo && (
              <div className="shrink-0 border-b-2 border-edge pb-4 md:w-[19rem] md:border-b-0 md:border-r-2 md:pb-0 md:pr-5">
                <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-accent">
                  <MessageCircleStar size={12} /> Ask Cosmo
                </span>
                <div className="mt-3 flex flex-col gap-2">
                  <ChatMessage role="user">{askDemo.prompt}</ChatMessage>
                  <span className="self-start font-mono text-[10px] uppercase tracking-widest text-accent">
                    {askDemo.count} of {askDemo.total} papers match
                  </span>
                  <ChatMessage role="assistant">
                    {askDemo.count.toLocaleString()}{" "}
                    {askDemo.count === 1 ? "paper matches" : "papers match"} —
                    they're lit up across the galaxy now, and the rest fade away.
                  </ChatMessage>
                </div>
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2 text-accent">
                {(() => {
                  const Icon = stop.icon ?? Compass;
                  return <Icon size={12} />;
                })()}
                <span className="text-[10px] font-display uppercase tracking-[0.3em]">
                  Guided Tour
                </span>
                <h2 className="ml-1 text-sm md:text-base font-display font-bold text-ink leading-tight">
                  {stop.title}
                </h2>
              </div>

              <p className="text-xs md:text-sm text-ink-dim leading-relaxed">
                {stop.caption}
              </p>

              {/* Page indicator + Next sit BELOW the text, full-width. */}
              <div className="mt-3 flex items-center justify-between gap-4">
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
                  className="glass-panel glass-panel-interactive flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-[10px] font-display uppercase tracking-wider text-ink"
                >
                  {isLast ? "Finish" : "Next"}
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
