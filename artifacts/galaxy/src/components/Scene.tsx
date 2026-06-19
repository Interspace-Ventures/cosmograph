import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { Preload, Stars } from "@react-three/drei";
import { EffectComposer, Bloom, Noise } from "@react-three/postprocessing";
import { GalaxySystem } from "./GalaxySystem";
import { CameraController } from "./CameraControls";
import { useAppState } from "@/lib/store";

export function Scene() {
  const { setSelectedObject } = useAppState();
  
  return (
    <div className="absolute inset-0 z-0">
      <Canvas
        camera={{ position: [0, 400, 400], fov: 60, near: 0.1, far: 50000 }}
        gl={{ antialias: false, alpha: false, stencil: false }}
        dpr={[1, 1.5]}
        onPointerMissed={() => setSelectedObject(null)}
      >
        <color attach="background" args={['#020205']} />
        <fog attach="fog" args={['#020205', 500, 4000]} />
        
        <ambientLight intensity={0.1} />

        <Suspense fallback={null}>
          <Stars radius={100} depth={50} count={10000} factor={4} saturation={1} fade speed={1} />
          
          <GalaxySystem />
          <CameraController />
          
          <EffectComposer enableNormalPass={false}>
            <Bloom 
              luminanceThreshold={1.5} 
              mipmapBlur 
              intensity={1.5} 
              radius={0.8}
            />
            <Noise opacity={0.03} />
          </EffectComposer>
        </Suspense>
        
        <Preload all />
      </Canvas>
    </div>
  );
}
