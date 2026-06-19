import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { Preload, Stars, useTexture } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { GalaxySystem } from "./GalaxySystem";
import { CameraController } from "./CameraControls";
import { useAppState } from "@/lib/store";

function Background() {
  const tex = useTexture(`${import.meta.env.BASE_URL}textures/galaxy_starfield.png`);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={[16000, 60, 40]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} depthWrite={false} />
    </mesh>
  );
}

export function Scene() {
  const { setSelectedObject } = useAppState();

  return (
    <div className="absolute inset-0 z-0">
      <Canvas
        camera={{ position: [0, 1100, 1700], fov: 55, near: 0.1, far: 60000 }}
        gl={{ antialias: true, alpha: false, stencil: false }}
        dpr={[1, 1.5]}
        onPointerMissed={() => setSelectedObject(null)}
      >
        <color attach="background" args={["#03030a"]} />

        <ambientLight intensity={0.35} />
        <hemisphereLight args={["#3a3f5a", "#0a0a14", 0.35]} />

        <Suspense fallback={null}>
          <Background />
          <Stars radius={6000} depth={1500} count={6000} factor={20} saturation={0} fade speed={0.4} />

          <GalaxySystem />
          <CameraController />

          <EffectComposer enableNormalPass={false}>
            <Bloom luminanceThreshold={1.0} mipmapBlur intensity={0.9} radius={0.7} />
          </EffectComposer>
        </Suspense>

        <Preload all />
      </Canvas>
    </div>
  );
}
