import { useAppState } from "@/lib/store";
import { AnimatePresence, motion } from "framer-motion";
import { ScrollIntro } from "./ScrollIntro";
import { DetailPanel } from "./DetailPanel";
import { CommandBar } from "./CommandBar";
import { FilteredPapersPanel } from "./FilteredPapersPanel";
import { TourOverlay } from "./TourOverlay";
import { FlyHud } from "./FlyHud";
import { galaxyData } from "@/data/galaxy";
import { Compass, Rewind } from "lucide-react";

export function Overlay() {
  const { introFinished, selectedObject, hoveredObject, searchActive, tourActive } = useAppState();

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      <AnimatePresence>{!introFinished && <ScrollIntro key="intro" />}</AnimatePresence>

      {introFinished && (
        <>
          {!tourActive && (
            <>
              <Header />

              <FilteredPapersPanel />

              <AnimatePresence>
                {hoveredObject && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="absolute top-24 left-1/2 -translate-x-1/2 glass-panel px-4 py-2 max-w-md text-center pointer-events-none"
                  >
                    <span className="font-mono text-[10px] uppercase tracking-widest text-accent mr-2">
                      {hoveredObject.type === "sun" ? "Domain" : "Paper"}
                    </span>
                    <span className="text-sm text-ink line-clamp-1">{hoveredObject.name}</span>
                    {hoveredObject.type === "sun" &&
                      (() => {
                        const d = galaxyData.domains.find((x) => x.id === hoveredObject.id);
                        if (!d) return null;
                        return (
                          <div className="mt-1.5 flex items-center justify-center gap-4 font-mono text-[11px] text-ink-dim">
                            <span>
                              <span className="text-ink">{d.paperCount}</span> planets
                            </span>
                            <span className="text-ink-dim/40">·</span>
                            <span>
                              <span className="text-ink">{d.totalCitations.toLocaleString()}</span> citations
                            </span>
                          </div>
                        );
                      })()}
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {selectedObject && (
                  <div
                    className={`absolute z-30 inset-x-3 bottom-24 max-h-[38vh] md:inset-x-auto md:bottom-auto md:top-24 md:right-5 md:w-[min(384px,calc(100vw-2.5rem))] md:max-h-[calc(100vh-13rem)] md:!block overflow-y-auto custom-scrollbar pointer-events-auto ${
                      searchActive ? "hidden" : "block"
                    }`}
                  >
                    <DetailPanel />
                  </div>
                )}
              </AnimatePresence>

              <CommandBar />
              <FlyHud />
            </>
          )}
          <TourOverlay />
        </>
      )}
    </div>
  );
}

function Header() {
  const { startTour, replayIntro } = useAppState();

  return (
    <div className="absolute top-0 left-0 right-0 p-6 flex items-start justify-between">
      <div className="pointer-events-none">
        <h1 className="text-3xl font-title font-bold tracking-tight text-ink">Galactic</h1>
        <p className="text-ink-dim font-mono text-[11px] mt-1 uppercase tracking-widest">
          A Journey of Scientific Exploration · {galaxyData.author.name}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={replayIntro}
          className="glass-panel glass-panel-interactive flex items-center gap-2 px-4 py-2 text-xs font-display uppercase tracking-wider text-ink pointer-events-auto"
        >
          <Rewind size={14} />
          Replay Intro
        </button>
        <button
          onClick={startTour}
          className="glass-panel glass-panel-interactive flex items-center gap-2 px-4 py-2 text-xs font-display uppercase tracking-wider text-ink pointer-events-auto"
        >
          <Compass size={14} />
          Take the Tour
        </button>
      </div>
    </div>
  );
}
