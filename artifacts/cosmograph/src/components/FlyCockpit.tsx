import { useRef } from "react";
import { useAppState } from "@/lib/store";
import { Cockpit } from "./Cockpit";

// Renders the cockpit canopy during free-fly. Mounted as its own layer between
// the 3D Scene (z-0) and the Overlay UI (z-10) so the canopy always sits above
// the canvas yet below the interactive controls. The galaxy is full-bleed now
// (the side rail is gone), so the canopy spans the whole viewport; the Dashboard
// bar floats above it at the bottom.
export function FlyCockpit() {
  const { cameraMode, tourActive, introFinished } = useAppState();
  const warpRef = useRef<HTMLDivElement>(null);
  const active = introFinished && !tourActive && cameraMode === "spaceship";
  if (!active) return null;
  return (
    <div className="absolute inset-0 z-[5]">
      <Cockpit warpRef={warpRef} className="z-0" />
    </div>
  );
}
