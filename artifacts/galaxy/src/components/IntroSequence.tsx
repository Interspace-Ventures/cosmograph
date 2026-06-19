import { motion } from "framer-motion";
import { useAppState } from "@/lib/store";
import { galaxyData } from "@/data/galaxy";
import { useEffect, useState } from "react";

export function IntroSequence() {
  const { setIntroFinished } = useAppState();
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 2000),
      setTimeout(() => setStage(2), 5000),
      setTimeout(() => setStage(3), 8000),
      setTimeout(() => setIntroFinished(true), 11000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [setIntroFinished]);

  return (
    <motion.div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black pointer-events-auto"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 2, ease: "easeInOut" } }}
    >
      <div className="text-center relative px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
          animate={{ opacity: stage >= 1 ? 1 : 0, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 2 }}
          className="absolute inset-0 flex items-center justify-center -z-10"
        >
          <div className="w-[150%] h-[150%] bg-accent/20 blur-[100px] rounded-full" />
        </motion.div>

        <motion.h1
          className="text-7xl md:text-9xl font-display font-extrabold tracking-tight mb-4 text-ink"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
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
          <p className="text-lg md:text-2xl font-display font-semibold text-accent uppercase tracking-[0.3em]">
            The Universe of Ideas
          </p>
          <p className="text-base md:text-xl font-mono text-ink-dim tracking-widest">
            {galaxyData.author.name}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: stage >= 2 ? 1 : 0, y: 0 }}
          transition={{ duration: 1.5 }}
          className="mt-12 grid grid-cols-3 gap-6 md:gap-10 text-center"
        >
          <IntroStat value={String(galaxyData.stats.totalPapers)} label="Papers" />
          <IntroStat value={galaxyData.stats.totalCitations.toLocaleString()} label="Citations" />
          <IntroStat value={String(galaxyData.stats.yearsActive)} label="Years Active" />
        </motion.div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: stage >= 3 ? 1 : 0 }}
          transition={{ duration: 1 }}
          onClick={() => setIntroFinished(true)}
          className="glass-panel glass-panel-interactive mt-16 px-8 py-3 bg-accent text-accent-foreground font-display text-sm uppercase tracking-[0.2em]"
        >
          Enter the Universe
        </motion.button>
      </div>
    </motion.div>
  );
}

function IntroStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl md:text-3xl font-mono text-ink">{value}</div>
      <div className="mt-1 font-mono text-[10px] text-ink-dim uppercase tracking-widest">{label}</div>
    </div>
  );
}
