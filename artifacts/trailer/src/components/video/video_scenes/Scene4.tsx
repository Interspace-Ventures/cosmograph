import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1200),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      <video
        className="absolute inset-0 w-full h-full object-cover opacity-90"
        src={`${import.meta.env.BASE_URL}videos/planet_orbit.mp4`}
        autoPlay
        muted
        playsInline
      />

      <div className="absolute inset-0 flex items-center p-24 justify-end">
        <motion.div 
          className="w-[500px] instrument-panel p-8 bg-[#08080e]/90 flex flex-col gap-6"
          initial={{ opacity: 0, x: 100, rotateY: 20 }}
          animate={phase >= 1 ? { opacity: 1, x: 0, rotateY: 0 } : { opacity: 0, x: 100, rotateY: 20 }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
          style={{ perspective: "1000px" }}
        >
          <div className="flex justify-between items-center text-[#9da0ab] border-b border-white/10 pb-4">
            <span className="text-sm">TARGET ACQUIRED</span>
            <span className="text-sm text-[#a388ee]">YEAR 2004</span>
          </div>

          <motion.div 
            className="flex flex-col gap-2"
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.5 }}
          >
            <h3 className="text-2xl font-display font-bold leading-tight">
              SOX2, a Persistent Marker for Multipotential Neural Stem Cells Derived from Embryonic Stem Cells, the Embryo or the Adult
            </h3>
            <div className="flex gap-4 mt-4">
              <div className="bg-[#a388ee]/20 text-[#a388ee] px-3 py-1 text-sm border border-[#a388ee]/30">
                749 CITATIONS
              </div>
              <div className="bg-white/5 text-white/80 px-3 py-1 text-sm border border-white/10">
                12 CO-AUTHORS
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
