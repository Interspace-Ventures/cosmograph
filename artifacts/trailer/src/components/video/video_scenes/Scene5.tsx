import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 1600),
      setTimeout(() => setPhase(4), 2200),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const stats = [
    { label: "PAPERS", value: "364", phase: 1 },
    { label: "CITATIONS", value: "28,860", phase: 2 },
    { label: "CO-AUTHORS", value: "1,191", phase: 3 },
    { label: "DOMAINS", value: "12", phase: 4 },
  ];

  return (
    <motion.div 
      className="absolute inset-0 z-10 bg-[#08080e]"
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, filter: "blur(20px)" }}
      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(circle at center, #a388ee 0%, transparent 60%)' }} />

      <div className="relative z-20 h-full flex flex-col items-center justify-center p-12">
        <motion.div 
          className="text-center mb-16"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="text-xl text-[#9da0ab] tracking-widest mb-4">CORPUS SUMMARY</div>
          <h2 className="text-6xl font-display font-bold">Mahendra S. Rao</h2>
          <div className="text-[#a388ee] mt-4 font-mono">30 YEARS ACTIVE (1994–2024)</div>
        </motion.div>

        <div className="grid grid-cols-4 gap-8 w-full max-w-6xl">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              className="instrument-panel flex flex-col items-center justify-center p-8 bg-[#1f2028]/60"
              initial={{ opacity: 0, y: 40, rotateX: -30 }}
              animate={phase >= stat.phase ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 40, rotateX: -30 }}
              transition={{ type: "spring", stiffness: 150, damping: 15 }}
            >
              <div className="text-[#9da0ab] text-sm mb-4">{stat.label}</div>
              <div className="text-5xl font-bold text-white font-display">{stat.value}</div>
            </motion.div>
          ))}
        </div>
        
        <motion.div
          className="mt-12 flex gap-8 font-mono text-sm text-white/50"
          initial={{ opacity: 0 }}
          animate={phase >= 4 ? { opacity: 1 } : { opacity: 0 }}
        >
          <span>H-INDEX: 90</span>
          <span>I10-INDEX: 278</span>
          <span>1.4M+ WORDS WRITTEN</span>
        </motion.div>
      </div>
    </motion.div>
  );
}
