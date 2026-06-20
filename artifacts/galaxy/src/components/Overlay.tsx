import { useAppState } from "@/lib/store";
import { AnimatePresence, motion } from "framer-motion";
import { ScrollIntro } from "./ScrollIntro";
import { DetailPanel } from "./DetailPanel";
import { CommandBar } from "./CommandBar";
import { FilteredPapersPanel } from "./FilteredPapersPanel";
import { TourOverlay } from "./TourOverlay";
import { FlyHud } from "./FlyHud";
import { galaxyData } from "@/data/galaxy";
import { Compass, Rewind, Info, X, Sun, Globe2, Moon, Orbit, Network } from "lucide-react";
import { useState, useEffect } from "react";

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
                              <span className="text-ink">{d.paperCount}</span> papers
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
        <InfoButton />
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

const LEGEND = [
  {
    icon: Sun,
    title: "Suns are research domains",
    body: "Each sun is a field Dr. Rao has worked in. The larger the sun, the more papers he published in that domain.",
  },
  {
    icon: Globe2,
    title: "Planets are papers",
    body: "Every planet orbiting a sun is a single published paper. The larger the planet, the more times it has been cited.",
  },
  {
    icon: Moon,
    title: "Moons are co-authors",
    body: "Select a paper and its moons appear — the collaborators who co-authored it.",
  },
  {
    icon: Orbit,
    title: "Orbits show relevance",
    body: "A planet's distance from its sun reflects how central the paper is to that domain.",
  },
  {
    icon: Network,
    title: "Nearby suns are related",
    body: "Solar systems are grouped by broad research field, so suns clustered together belong to the same area of science — while distant clusters are different fields entirely.",
  },
];

function InfoButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="About this visualization"
        className="glass-panel glass-panel-interactive flex items-center gap-2 px-4 py-2 text-xs font-display uppercase tracking-wider text-ink pointer-events-auto"
      >
        <Info size={14} />
        Info
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center p-6 pointer-events-auto"
          >
            <div
              className="absolute inset-0 bg-black/65 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="relative glass-panel w-full max-w-lg p-7 max-h-[calc(100vh-3rem)] overflow-y-auto custom-scrollbar"
            >
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="absolute top-4 right-4 text-ink-dim hover:text-ink transition-colors"
              >
                <X size={18} />
              </button>

              <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                How to read this galaxy
              </span>
              <h2 className="text-2xl font-title font-bold tracking-tight text-ink mt-1 mb-5">
                A lifetime of work, mapped to the stars
              </h2>

              <div className="space-y-4">
                {LEGEND.map(({ icon: Icon, title, body }) => (
                  <div key={title} className="flex items-start gap-3.5">
                    <div className="mt-0.5 shrink-0 grid place-items-center w-9 h-9 border-2 border-edge bg-white/5 text-accent">
                      <Icon size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-display font-semibold text-ink">{title}</div>
                      <p className="text-[13px] leading-relaxed text-ink-dim mt-0.5">{body}</p>
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-6 pt-4 border-t-2 border-edge font-mono text-[11px] text-ink-dim leading-relaxed">
                Built from {galaxyData.papers.length.toLocaleString()} papers across{" "}
                {galaxyData.domains.length} domains. Bibliographic data sourced from OpenAlex.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
