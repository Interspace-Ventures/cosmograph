import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import logoWhite from '@assets/cosmograph-mark-white_1782673393029.svg';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 600),
      setTimeout(() => setPhase(2), 1500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-[#08080e]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      <motion.div 
        className="flex flex-col items-center text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      >
        <h2 className="text-5xl font-display font-bold text-white mb-6">
          Point it at <span className="text-[#a388ee]">any researcher</span>.
        </h2>
        <p className="text-xl text-[#9da0ab] max-w-2xl">
          It rebuilds the entire galaxy from public data. <br/>
          Open source on GitHub.
        </p>
      </motion.div>

      <motion.div 
        className="mt-16 flex flex-col items-center gap-6"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
      >
        <img src={logoWhite} alt="Cosmograph" className="w-16 h-16 opacity-80" />
        <div className="instrument-panel px-8 py-4 bg-white/5 text-2xl font-bold tracking-widest text-white border-white/20">
          cosmograph.space
        </div>
      </motion.div>
    </motion.div>
  );
}
