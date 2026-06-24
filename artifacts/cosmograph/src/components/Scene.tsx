import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect } from "react";
import { Preload, Stars, useTexture } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { GalaxySystem } from "./GalaxySystem";
import { CameraController, INTRO_START } from "./CameraControls";
import { PresenceBroadcaster, PresenceWisps } from "./Presence";
import { useAppState } from "@/lib/store";
import { setGalaxyCanvas } from "@/lib/share";

function Background() {
  const tex = useTexture(
    `${import.meta.env.BASE_URL}textures/galaxy_starfield.png`,
  );
  tex.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={[16000, 60, 40]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} depthWrite={false} />
    </mesh>
  );
}

// Mounts only after the surrounding <Suspense> resolves (i.e. once the
// background texture and any other suspending scene assets have loaded), so its
// effect is a reliable "the scene content is now present" signal. Used by the
// share-card capture so it never snapshots a still-blank frame.
function SceneReady({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  return null;
}

export function Scene({
  captureTopDown = false,
  onReady,
}: {
  captureTopDown?: boolean;
  onReady?: () => void;
}) {
  const { setSelectedObject, introFinished } = useAppState();

  return (
    <div className="absolute inset-0 z-0">
      <Canvas
        camera={{
          position: [INTRO_START.x, INTRO_START.y, INTRO_START.z],
          fov: 55,
          near: 0.1,
          far: 60000,
        }}
        gl={{
          antialias: true,
          alpha: false,
          stencil: false,
          preserveDrawingBuffer: true,
        }}
        dpr={[1, 1.5]}
        // Debounce the WebGL buffer resize so neither a window resize NOR the
        // console push (the canvas is confined to the space left of the console,
        // so opening/closing it changes the canvas width) triggers a per-frame
        // renderer + camera-aspect + bloom-target recompute. The debounce coalesces
        // the whole 450ms push transition into a single snap once the layout settles.
        resize={{ debounce: 150 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
          // Expose the live canvas so the Share button can snapshot the current view.
          setGalaxyCanvas(gl.domElement);
        }}
        onPointerMissed={() => setSelectedObject(null)}
      >
        <color attach="background" args={["#03030a"]} />

        {/* Low fill so the sun pointLights (decay=0) carve day/night terminators,
            but enough floor that dark sides keep visible texture instead of going black */}
        <ambientLight intensity={0.32} />
        <hemisphereLight args={["#2a3050", "#070710", 0.3]} />

        <Suspense fallback={null}>
          <Background />
          <Stars
            radius={6000}
            depth={1500}
            count={6000}
            factor={20}
            saturation={0}
            fade
            speed={0.4}
          />

          <GalaxySystem />
          <CameraController captureTopDown={captureTopDown} />
          <SceneReady onReady={onReady} />

          {introFinished && (
            <>
              <PresenceBroadcaster />
              <PresenceWisps />
            </>
          )}

          <EffectComposer enableNormalPass={false}>
            <Bloom
              luminanceThreshold={0.9}
              luminanceSmoothing={0.03}
              mipmapBlur
              intensity={1.15}
              radius={0.85}
            />
          </EffectComposer>
        </Suspense>

        <Preload all />
      </Canvas>
    </div>
  );
}
