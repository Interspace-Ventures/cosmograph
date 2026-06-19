import { useAppState } from "@/lib/store";
import { motion } from "framer-motion";
import { MousePointer2, Orbit, Compass, Move } from "lucide-react";

export function ControlsHelp() {
  const { cameraMode, setCameraMode, hoveredObject, galaxyTilt, setGalaxyTilt } = useAppState();

  return (
    <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end pointer-events-none">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="pointer-events-auto flex items-center gap-2 p-1.5 glass-panel rounded-full"
      >
        <button
          onClick={() => setCameraMode('god')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-display uppercase tracking-wider transition-all ${
            cameraMode === 'god' 
              ? 'bg-primary text-primary-foreground shadow-[0_0_15px_rgba(0,240,255,0.4)]' 
              : 'text-muted-foreground hover:text-white'
          }`}
        >
          <Orbit size={14} />
          Planetarium
        </button>
        <button
          onClick={() => setCameraMode('spaceship')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-display uppercase tracking-wider transition-all ${
            cameraMode === 'spaceship' 
              ? 'bg-primary text-primary-foreground shadow-[0_0_15px_rgba(0,240,255,0.4)]' 
              : 'text-muted-foreground hover:text-white'
          }`}
        >
          <Compass size={14} />
          Spaceship
        </button>
      </motion.div>

      <div className="flex flex-col items-end gap-4 pointer-events-auto">
        {hoveredObject && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel px-4 py-2 rounded-lg text-sm text-white/80 max-w-sm text-right pointer-events-none"
          >
            <span className="text-xs uppercase tracking-wider text-primary mr-2">
              {hoveredObject.type === 'sun' ? 'Domain' : 'Paper'}
            </span>
            {hoveredObject.name}
          </motion.div>
        )}

        <div className="glass-panel px-4 py-3 rounded-xl flex flex-col gap-3 text-xs text-muted-foreground min-w-[220px]">
          {cameraMode === 'god' ? (
            <>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-white/80 font-display uppercase tracking-wider">Galaxy Tilt</span>
                  <span className="text-white/50">{Math.round((galaxyTilt * 180) / Math.PI)}°</span>
                </div>
                <input 
                  type="range" 
                  min={-Math.PI / 2} 
                  max={Math.PI / 2} 
                  step={0.01} 
                  value={galaxyTilt}
                  onChange={(e) => setGalaxyTilt(parseFloat(e.target.value))}
                  className="w-full accent-primary h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              <div className="w-full h-[1px] bg-white/10" />
              <div className="flex flex-col gap-2 pointer-events-none">
                <div className="flex items-center gap-3">
                  <Orbit size={14} className="text-white/50" />
                  <span>Drag to Orbit</span>
                </div>
                <div className="flex items-center gap-3">
                  <MousePointer2 size={14} className="text-white/50" />
                  <span>Scroll to Zoom</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2 pointer-events-none">
              <div className="flex items-center gap-3">
                <MousePointer2 size={14} className="text-white/50" />
                <span>Click to Lock Pointer</span>
              </div>
              <div className="flex items-center gap-3">
                <Move size={14} className="text-white/50" />
                <span>WASD / Arrows to Fly</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
