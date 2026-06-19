import { useAppState } from "@/lib/store";
import { AnimatePresence, motion } from "framer-motion";
import { IntroSequence } from "./IntroSequence";
import { DetailPanel } from "./DetailPanel";
import { CommandBar } from "./CommandBar";
import { galaxyData } from "@/data/galaxy";

export function Overlay() {
  const { introFinished, selectedObject, hoveredObject } = useAppState();

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      <AnimatePresence>{!introFinished && <IntroSequence key="intro" />}</AnimatePresence>

      {introFinished && (
        <>
          <Header />

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
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {selectedObject && (
              <div className="absolute top-24 right-5 w-[min(384px,calc(100vw-2.5rem))] max-h-[calc(100vh-13rem)] overflow-y-auto custom-scrollbar pointer-events-auto">
                <DetailPanel />
              </div>
            )}
          </AnimatePresence>

          <CommandBar />
        </>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="absolute top-0 left-0 p-6 pointer-events-none">
      <h1 className="text-3xl font-display font-extrabold tracking-tight text-ink">GALAXY</h1>
      <p className="text-ink-dim font-mono text-[11px] mt-1 uppercase tracking-widest">
        The Universe of {galaxyData.author.name}
      </p>
    </div>
  );
}
