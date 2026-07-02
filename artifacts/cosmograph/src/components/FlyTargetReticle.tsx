import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useAppState } from "@/lib/store";
import { sunRefs, planetRefs } from "./GalaxySystem";
import { galaxyData, getDomain } from "@/data/galaxy";

const _target = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _toTarget = new THREE.Vector3();

/**
 * Fly-mode targeting HUD: when a planet or sun is selected while flying, a
 * corner-bracket reticle locks onto it and tracks it as it orbits (and as the
 * ship moves). Rendered inside the Canvas as an Html overlay so it inherits
 * the object's projected screen position for free every frame; hidden when the
 * target swings behind the camera.
 */
export function FlyTargetReticle() {
  const { cameraMode, selectedObject, tourActive, introFinished } =
    useAppState();
  const groupRef = useRef<THREE.Group>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const active =
    introFinished &&
    !tourActive &&
    cameraMode === "spaceship" &&
    !!selectedObject;

  useFrame(({ camera }) => {
    if (!active || !selectedObject) return;
    const group = groupRef.current;
    if (!group) return;
    const obj =
      selectedObject.type === "sun"
        ? sunRefs[selectedObject.id]
        : planetRefs[selectedObject.id];
    if (!obj) {
      // Ref not (re)populated yet — e.g. mid dataset-swap remount. Hide rather
      // than flash the reticle at a stale position or the origin.
      if (boxRef.current) boxRef.current.style.visibility = "hidden";
      return;
    }
    obj.getWorldPosition(_target);
    group.position.copy(_target);
    // Hide the marker while the target is behind the ship (Html would
    // otherwise mirror it onto the screen).
    if (boxRef.current) {
      camera.getWorldDirection(_camDir);
      _toTarget.copy(_target).sub(camera.position);
      const behind = _camDir.dot(_toTarget) <= 0;
      boxRef.current.style.visibility = behind ? "hidden" : "visible";
    }
  });

  if (!active || !selectedObject) return null;

  const name =
    selectedObject.type === "sun"
      ? getDomain(selectedObject.id)?.name
      : galaxyData.papers.find((p) => p.id === selectedObject.id)?.title;

  return (
    <group ref={groupRef}>
      <Html center zIndexRange={[3, 1]} style={{ pointerEvents: "none" }}>
        <div ref={boxRef} className="pointer-events-none select-none">
          <div className="relative mx-auto h-14 w-14 animate-[pulse_2.4s_ease-in-out_infinite]">
            <div className="absolute left-0 top-0 h-3.5 w-3.5 border-l-2 border-t-2 border-accent" />
            <div className="absolute right-0 top-0 h-3.5 w-3.5 border-r-2 border-t-2 border-accent" />
            <div className="absolute bottom-0 left-0 h-3.5 w-3.5 border-b-2 border-l-2 border-accent" />
            <div className="absolute bottom-0 right-0 h-3.5 w-3.5 border-b-2 border-r-2 border-accent" />
            <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
          </div>
          {name && (
            <div className="mt-1.5 max-w-[200px] truncate whitespace-nowrap text-center font-mono text-[10px] uppercase tracking-wider text-accent [text-shadow:0_0_8px_rgba(3,3,10,0.9)]">
              {name}
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}
