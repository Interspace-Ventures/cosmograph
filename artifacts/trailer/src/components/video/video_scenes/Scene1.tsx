import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import logoTwotone from '@assets/cosmograph-mark-twotone_1782673395435.svg';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 3500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, filter: "blur(20px)", scale: 1.2 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex items-center gap-6 mb-8">
        <motion.img 
          src={logoTwotone} 
          alt="Cosmograph" 
          className="w-24 h-24"
          initial={{ rotate: -90, scale: 0 }}
          animate={phase >= 1 ? { rotate: 0, scale: 1 } : { rotate: -90, scale: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        />
        <motion.h1 
          className="text-8xl font-black tracking-tight leading-none text-white font-display"
          initial={{ opacity: 0, x: -50 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
        >
          COSMOGRAPH
        </motion.h1>
      </div>

      <motion.div
        className="instrument-panel px-8 py-3 bg-[#1f2028]/80 text-[#a388ee] tracking-[0.2em] text-xl"
        initial={{ opacity: 0, y: 30 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        RESEARCH AT GALACTIC SCALE
      </motion.div>
    </motion.div>
  );
}
