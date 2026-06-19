import { motion } from "framer-motion";
import { useAppState } from "@/lib/store";
import { galaxyData } from "@/data/galaxy";
import { useEffect, useState } from "react";

export function IntroSequence() {
  const { setIntroFinished } = useAppState();
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timer1 = setTimeout(() => setStage(1), 2000);
    const timer2 = setTimeout(() => setStage(2), 5000);
    const timer3 = setTimeout(() => setStage(3), 8000);
    const timer4 = setTimeout(() => {
      setIntroFinished(true);
    }, 11000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, [setIntroFinished]);

  return (
    <motion.div 
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 2, ease: "easeInOut" } }}
    >
      <div className="text-center relative">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
          animate={{ opacity: stage >= 1 ? 1 : 0, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 2 }}
          className="absolute inset-0 flex items-center justify-center -z-10"
        >
          <div className="w-[150%] h-[150%] bg-primary/20 blur-[100px] rounded-full" />
        </motion.div>

        <motion.h1 
          className="text-7xl md:text-9xl font-title font-bold text-glow tracking-[0.2em] mb-4 text-white"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: stage >= 0 ? 1 : 0, y: 0 }}
          transition={{ duration: 2, ease: "easeOut" }}
        >
          GALAXY
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: stage >= 1 ? 1 : 0 }}
          transition={{ duration: 1.5, delay: 0.5 }}
          className="space-y-2"
        >
          <p className="text-xl md:text-2xl font-display text-primary uppercase tracking-[0.3em]">
            The Universe of Ideas
          </p>
          <p className="text-lg md:text-xl font-display text-muted-foreground tracking-widest">
            {galaxyData.author.name}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: stage >= 2 ? 1 : 0, y: 0 }}
          transition={{ duration: 1.5 }}
          className="mt-12 grid grid-cols-3 gap-8 text-center"
        >
          <div>
            <div className="text-3xl font-mono text-white">{galaxyData.stats.totalPapers}</div>
            <div className="text-xs font-sans text-muted-foreground uppercase tracking-wider mt-1">Papers</div>
          </div>
          <div>
            <div className="text-3xl font-mono text-white">{galaxyData.stats.totalCitations.toLocaleString()}</div>
            <div className="text-xs font-sans text-muted-foreground uppercase tracking-wider mt-1">Citations</div>
          </div>
          <div>
            <div className="text-3xl font-mono text-white">{galaxyData.stats.yearsActive}</div>
            <div className="text-xs font-sans text-muted-foreground uppercase tracking-wider mt-1">Years Active</div>
          </div>
        </motion.div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: stage >= 3 ? 1 : 0 }}
          transition={{ duration: 1 }}
          onClick={() => setIntroFinished(true)}
          className="mt-16 px-8 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full font-display text-sm uppercase tracking-[0.2em] transition-all"
        >
          Enter the Universe
        </motion.button>
      </div>
    </motion.div>
  );
}
