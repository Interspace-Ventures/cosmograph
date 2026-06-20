import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useAppState } from "@/lib/store";
import { planetRefs, sunRefs, planetOrbits, sunRadii } from "./GalaxySystem";
import { tourStops } from "@/lib/tour";

const HOME_POS = new THREE.Vector3(0, 1100, 1700);
export const INTRO_START = new THREE.Vector3(0, 2600, 13000);

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function CameraController() {
  const { cameraMode, selectedObject, tourActive, tourStopIndex, introFinished, introProgressRef } = useAppState();
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const orbitRef = useRef<any>(null);

  const targetPosition = useRef(new THREE.Vector3().copy(HOME_POS));
  const targetLookAt = useRef(new THREE.Vector3());

  // Fly-to animation runs only briefly after a selection changes; afterwards we
  // hand control back to OrbitControls so scroll-to-zoom and orbit work freely.
  const focusing = useRef(false);
  const focusElapsed = useRef(0);

  useEffect(() => {
    if (cameraMode !== "god") return;
    focusing.current = true;
    focusElapsed.current = 0;
    if (orbitRef.current) orbitRef.current.enabled = false;
  }, [cameraMode, selectedObject?.type, selectedObject?.id]);

  // When the intro flight ends, hand off to god/orbit at the galaxy overview.
  useEffect(() => {
    if (!introFinished) return;
    focusing.current = true;
    focusElapsed.current = 0;
    if (orbitRef.current) {
      orbitRef.current.target.set(0, 0, 0);
      orbitRef.current.enabled = false;
    }
  }, [introFinished]);

  const keys = useRef({ forward: false, backward: false, left: false, right: false });
  const velocity = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());

  // Drag-to-look orientation for fly mode (no pointer lock, cursor stays visible).
  const yaw = useRef(0);
  const pitch = useRef(0);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  // Seed look angles from the current camera orientation when entering fly mode.
  useEffect(() => {
    if (cameraMode !== "spaceship") return;
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    yaw.current = e.y;
    pitch.current = e.x;
    velocity.current.set(0, 0, 0);
  }, [cameraMode, camera]);

  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (cameraMode !== "spaceship" || isTyping()) return;
      switch (e.code) {
        case "ArrowUp":
        case "KeyW": keys.current.forward = true; break;
        case "ArrowLeft":
        case "KeyA": keys.current.left = true; break;
        case "ArrowDown":
        case "KeyS": keys.current.backward = true; break;
        case "ArrowRight":
        case "KeyD": keys.current.right = true; break;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (cameraMode !== "spaceship") return;
      switch (e.code) {
        case "ArrowUp":
        case "KeyW": keys.current.forward = false; break;
        case "ArrowLeft":
        case "KeyA": keys.current.left = false; break;
        case "ArrowDown":
        case "KeyS": keys.current.backward = false; break;
        case "ArrowRight":
        case "KeyD": keys.current.right = false; break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [cameraMode]);

  // Mouse-drag look for fly mode.
  useEffect(() => {
    if (cameraMode !== "spaceship") return;
    const el = gl.domElement;
    const sens = 0.0025;
    const limit = Math.PI / 2 - 0.05;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging.current = true;
      last.current = { x: e.clientX, y: e.clientY };
      el.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      yaw.current -= dx * sens;
      pitch.current -= dy * sens;
      pitch.current = Math.max(-limit, Math.min(limit, pitch.current));
    };
    const onUp = () => {
      dragging.current = false;
      el.style.cursor = "grab";
    };

    el.style.cursor = "grab";
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      el.style.cursor = "";
      dragging.current = false;
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [cameraMode, gl]);

  useFrame((state, delta) => {
    if (!introFinished) {
      const p = easeInOutCubic(THREE.MathUtils.clamp(introProgressRef.current, 0, 1));
      state.camera.position.copy(INTRO_START).lerp(HOME_POS, p);
      state.camera.lookAt(0, 0, 0);
      return;
    }

    if (tourActive) {
      const stop = tourStops[tourStopIndex];
      const worldPos = new THREE.Vector3();
      let hasTarget = false;
      let offset = new THREE.Vector3(0, 40, 110);

      if (stop && stop.target.type !== "overview") {
        if (stop.target.type === "sun") {
          const sun = sunRefs[stop.target.id];
          if (sun) {
            sun.getWorldPosition(worldPos);
            hasTarget = worldPos.lengthSq() > 0;
          }
          const r = sunRadii[stop.target.id] || 20;
          offset = new THREE.Vector3(0, r * 4 + 30, r * 9 + 60);
        } else {
          const planet = planetRefs[stop.target.id];
          if (planet) {
            planet.getWorldPosition(worldPos);
            hasTarget = worldPos.lengthSq() > 0;
          }
          const pr = planetOrbits[stop.target.id]?.planetRadius || 1;
          offset = new THREE.Vector3(0, pr * 6 + 8, pr * 16 + 16);
        }
      }

      if (hasTarget) {
        targetLookAt.current.copy(worldPos);
        targetPosition.current.copy(worldPos).add(offset);
      } else {
        targetLookAt.current.set(0, 0, 0);
        targetPosition.current.copy(HOME_POS);
      }

      state.camera.position.lerp(targetPosition.current, delta * 1.5);
      if (orbitRef.current) {
        orbitRef.current.target.lerp(targetLookAt.current, delta * 1.5);
      }
      return;
    }

    if (cameraMode === "god") {
      const orbit = orbitRef.current;
      const worldPos = new THREE.Vector3();
      let hasTarget = false;
      let offset = new THREE.Vector3(0, 30, 60);

      if (selectedObject) {
        if (selectedObject.type === "sun") {
          const sun = sunRefs[selectedObject.id];
          if (sun) {
            sun.getWorldPosition(worldPos);
            hasTarget = worldPos.lengthSq() > 0;
          }
          const r = sunRadii[selectedObject.id] || 20;
          offset = new THREE.Vector3(0, r * 4 + 30, r * 9 + 60);
        } else if (selectedObject.type === "planet") {
          const planet = planetRefs[selectedObject.id];
          if (planet) {
            planet.getWorldPosition(worldPos);
            hasTarget = worldPos.lengthSq() > 0;
          }
          const pr = planetOrbits[selectedObject.id]?.planetRadius || 1;
          offset = new THREE.Vector3(0, pr * 6 + 8, pr * 16 + 16);
        }
      }

      const lookAt = hasTarget ? worldPos : new THREE.Vector3(0, 0, 0);

      if (focusing.current) {
        // Brief fly-to: drive both camera and pivot toward the framed target.
        targetLookAt.current.copy(lookAt);
        targetPosition.current.copy(hasTarget ? worldPos.clone().add(offset) : HOME_POS);
        state.camera.position.lerp(targetPosition.current, delta * 3);
        if (orbit) orbit.target.lerp(targetLookAt.current, delta * 3);
        focusElapsed.current += delta;
        if (focusElapsed.current > 1.3) {
          focusing.current = false;
          if (orbit) orbit.enabled = true;
        }
      } else if (hasTarget && orbit) {
        // Keep the selected object centered, but let the user zoom/orbit freely.
        orbit.target.lerp(lookAt, delta * 2);
      }
      if (orbit) orbit.update();
    } else if (cameraMode === "spaceship") {
      // Apply drag-look orientation.
      state.camera.quaternion.setFromEuler(
        new THREE.Euler(pitch.current, yaw.current, 0, "YXZ"),
      );

      const speed = 600.0 * delta;

      direction.current.z = Number(keys.current.forward) - Number(keys.current.backward);
      direction.current.x = Number(keys.current.right) - Number(keys.current.left);
      direction.current.normalize();

      if (keys.current.forward || keys.current.backward) velocity.current.z -= direction.current.z * speed;
      if (keys.current.left || keys.current.right) velocity.current.x += direction.current.x * speed;

      state.camera.translateZ(velocity.current.z);
      state.camera.translateX(velocity.current.x);

      velocity.current.multiplyScalar(0.9);
    }
  });

  if (cameraMode === "spaceship" && !tourActive) {
    return null;
  }

  return (
    <OrbitControls
      ref={orbitRef}
      makeDefault
      enabled={introFinished && !tourActive}
      enableDamping
      dampingFactor={0.05}
      enablePan
      maxDistance={9000}
      minDistance={12}
      maxPolarAngle={Math.PI / 1.4}
      mouseButtons={{
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      }}
      touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
    />
  );
}
