import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 3200),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.8 }}
    >
      {/* Background Video */}
      <video
        className="absolute inset-0 w-full h-full object-cover opacity-80"
        src={`${import.meta.env.BASE_URL}videos/galaxy_fly.mp4`}
        autoPlay
        muted
        playsInline
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#08080e] via-transparent to-[#08080e]/50" />

      {/* Content */}
      <div className="relative z-20 w-full max-w-6xl mx-auto px-12 flex flex-col items-start gap-8 mt-40">
        <motion.div 
          className="instrument-panel px-6 py-2 text-sm text-[#9da0ab]"
          initial={{ opacity: 0, x: -30 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
        >
          SYS.NAV :: ORBIT
        </motion.div>

        <h2 className="text-5xl font-bold leading-tight max-w-4xl drop-shadow-2xl">
          <motion.span 
            className="block text-[#a388ee] mb-2"
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
          >
            Every sun is a field they helped shape.
          </motion.span>
          <motion.span 
            className="block text-white mb-2"
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
          >
            Every planet a paper they published.
          </motion.span>
          <motion.span 
            className="block text-[#9da0ab]"
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
          >
            Every moon a collaborator.
          </motion.span>
        </h2>
      </div>
    </motion.div>
  );
}
