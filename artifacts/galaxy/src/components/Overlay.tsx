import { useAppState } from "@/lib/store";
import { AnimatePresence, motion } from "framer-motion";
import { IntroSequence } from "./IntroSequence";
import { StatsPanel } from "./StatsPanel";
import { DetailPanel } from "./DetailPanel";
import { ControlsHelp } from "./ControlsHelp";

export function Overlay() {
  const { introFinished, selectedObject } = useAppState();

  return (
    <div className="absolute inset-0 pointer-events-none z-10 flex flex-col">
      <AnimatePresence>
        {!introFinished && <IntroSequence key="intro" />}
      </AnimatePresence>

      {introFinished && (
        <>
          <Header />
          <div className="flex-1 flex justify-between items-start p-6 overflow-hidden">
            <div className="w-80 pointer-events-auto">
              <StatsPanel />
            </div>
            
            <AnimatePresence>
              {selectedObject && (
                <div className="w-96 pointer-events-auto max-h-[80vh] overflow-y-auto custom-scrollbar">
                  <DetailPanel />
                </div>
              )}
            </AnimatePresence>
          </div>
          <ControlsHelp />
        </>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="p-6 flex justify-between items-center pointer-events-auto">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tighter text-glow">GALAXY</h1>
        <p className="text-muted-foreground font-mono text-xs mt-1 uppercase tracking-widest">
          The Universe of Dr. Mahendra S. Rao
        </p>
      </div>
    </div>
  );
}
