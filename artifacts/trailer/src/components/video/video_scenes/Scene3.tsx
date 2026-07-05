import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 600),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 z-10"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      {/* Background Video */}
      <video
        className="absolute inset-0 w-full h-full object-cover"
        src={`${import.meta.env.BASE_URL}videos/sun_orbit.mp4`}
        autoPlay
        muted
        playsInline
      />
      <div className="absolute inset-0 bg-[#08080e]/30 shadow-[inset_0_0_200px_rgba(8,8,14,1)]" />

      {/* Fly Mode Cockpit UI Overlay */}
      <div className="absolute inset-0 pointer-events-none p-12 flex flex-col justify-between">
        
        {/* Top HUD */}
        <div className="flex justify-between items-start">
          <motion.div 
            className="instrument-panel px-6 py-3 bg-[#08080e]/80"
            initial={{ opacity: 0, y: -20 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
          >
            <div className="text-xs text-[#9da0ab] mb-1">MODE</div>
            <div className="text-xl text-white">FLY</div>
          </motion.div>

          <motion.div 
            className="instrument-panel px-6 py-3 bg-[#08080e]/80 text-right"
            initial={{ opacity: 0, y: -20 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
          >
            <div className="text-xs text-[#9da0ab] mb-1">DRIVE</div>
            <div className="text-xl text-[#a388ee]">ENGAGED</div>
          </motion.div>
        </div>

        {/* Reticle / Center UI */}
        <motion.div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
          animate={phase >= 2 ? { opacity: 1, scale: 1, rotate: 0 } : { opacity: 0, scale: 0.5, rotate: -45 }}
          transition={{ duration: 1, ease: "easeOut" }}
        >
          <div className="w-64 h-64 border border-white/20 rounded-full flex items-center justify-center relative">
            <div className="w-1/2 h-[1px] bg-white/40 absolute left-0" />
            <div className="w-1/2 h-[1px] bg-white/40 absolute right-0" />
            <div className="w-[1px] h-1/2 bg-white/40 absolute top-0" />
            <div className="w-[1px] h-1/2 bg-white/40 absolute bottom-0" />
            <div className="w-4 h-4 border border-[#a388ee] rounded-sm" />
          </div>
        </motion.div>

        {/* Bottom HUD */}
        <motion.div 
          className="flex flex-col items-center"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        >
          <h2 className="text-4xl font-display font-bold text-white mb-4 drop-shadow-lg">
            Pilot a ship through the stars.
          </h2>
        </motion.div>

      </div>
    </motion.div>
  );
}
