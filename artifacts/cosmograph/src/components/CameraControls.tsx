import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useAppState } from "@/lib/store";
import { planetRefs, sunRefs, planetOrbits, sunRadii, domainPositions } from "./GalaxySystem";
import { getTourStops } from "@/lib/tour";

// Resting overview after the intro flight (and god-mode home). Kept close and
// low to the galactic plane so the spiral arms sweep across and past the frame
// edges — the corpus should feel vast and sprawling, not a small distant disk.
const HOME_POS = new THREE.Vector3(0, 430, 1120);
export const INTRO_START = new THREE.Vector3(0, 2600, 13000);

// Where the spaceship "dives" to when entering Fly mode: low in the galactic
// plane, just outside the core, so the perspective flips from a distant god
// view to being immersed among the stars looking inward.
const FLY_START = new THREE.Vector3(0, 70, 780);
const FLY_ENTER_DUR = 1.4;

// Orbit/god uses a normal lens; Fly narrows the lens (aperture) so planets read
// at a believable scale instead of making the viewer feel larger than them.
const BASE_FOV = 55;
const FLY_FOV = 42;

// Reusable scratch objects for the per-frame camera loop. Allocating fresh
// Vector3/Euler every frame (at 60fps) creates needless GC pressure; the god,
// tour, and fly branches are mutually exclusive within a frame, so they can
// safely share these.
const _worldPos = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const _move = new THREE.Vector3();
const _euler = new THREE.Euler();

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function CameraController({ captureTopDown = false }: { captureTopDown?: boolean }) {
  const { cameraMode, selectedObject, tourActive, tourStopIndex, introFinished, introProgressRef } = useAppState();
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const orbitRef = useRef<any>(null);
  // Recomputed per mount; CameraController remounts on a dataset swap so tour
  // targets/captions track the active scientist (see key={datasetVersion}).
  const tourStops = useMemo(() => getTourStops(), []);

  // Overhead vantage for the share-card capture: a near-top-down look at the
  // whole disk. Height is derived from the galaxy's actual footprint (farthest
  // system + outermost planet orbit) so any scientist's galaxy is framed fully,
  // then pulled back with margin so the cover-fit crop of the card never clips
  // the spiral. Recomputed per mount; the layout is built before this runs.
  const captureHeight = useMemo(() => {
    let maxR = 200;
    for (const id in domainPositions) {
      const p = domainPositions[id];
      const r = Math.hypot(p.x, p.z) + (sunRadii[id] ?? 0);
      if (r > maxR) maxR = r;
    }
    let maxReach = 0;
    for (const id in planetOrbits) {
      const o = planetOrbits[id];
      const reach = o.a * (1 + o.e);
      if (reach > maxReach) maxReach = reach;
    }
    const radius = maxR + maxReach;
    const halfFov = (BASE_FOV / 2) * (Math.PI / 180);
    return (radius / Math.tan(halfFov)) * 1.5;
  }, []);

  const targetPosition = useRef(new THREE.Vector3().copy(HOME_POS));
  const targetLookAt = useRef(new THREE.Vector3());

  // Fly-to animation runs only briefly after a selection changes; afterwards we
  // hand control back to OrbitControls so scroll-to-zoom and orbit work freely.
  const focusing = useRef(false);
  const focusElapsed = useRef(0);

  // Entering Orbit/god: restore the saved orbit vantage if we have one, else
  // fall back to the home overview. Also reset the lens to the normal FOV.
  useEffect(() => {
    if (cameraMode !== "god") return;
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = BASE_FOV;
      camera.updateProjectionMatrix();
    }
    if (savedGod.current.has) {
      focusing.current = false;
      camera.position.copy(savedGod.current.pos);
      const o = orbitRef.current;
      if (o) {
        o.target.copy(savedGod.current.target);
        o.enabled = true;
        o.update();
      }
    } else {
      focusing.current = true;
      focusElapsed.current = 0;
      if (orbitRef.current) orbitRef.current.enabled = false;
    }
  }, [cameraMode, camera]);

  // Selecting an object while already in Orbit re-frames it (fly-to focus).
  useEffect(() => {
    if (cameraMode !== "god") return;
    focusing.current = true;
    focusElapsed.current = 0;
    if (orbitRef.current) orbitRef.current.enabled = false;
  }, [selectedObject?.type, selectedObject?.id]);

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

  const keys = useRef({ forward: false, backward: false, left: false, right: false, up: false, down: false, lookLeft: false, lookRight: false, lookUp: false, lookDown: false, rollLeft: false, rollRight: false });
  const velocity = useRef(new THREE.Vector3());

  // Drag-to-look orientation for fly mode (no pointer lock, cursor stays visible).
  const yaw = useRef(0);
  const pitch = useRef(0);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  // Cinematic dive-in: when entering Fly mode, remember where we came from and
  // animate down into the galactic plane to a first-person spaceship vantage.
  const flyEntering = useRef(false);
  const flyElapsed = useRef(0);
  const flyFromPos = useRef(new THREE.Vector3());
  const flyFromQuat = useRef(new THREE.Quaternion());
  const flyTargetQuat = useRef(new THREE.Quaternion());
  const roll = useRef(0);

  // Per-mode camera memory: each mode records its latest vantage every frame so
  // switching out and back restores where you were instead of resetting.
  const savedGod = useRef<{ pos: THREE.Vector3; target: THREE.Vector3; has: boolean }>({
    pos: new THREE.Vector3(),
    target: new THREE.Vector3(),
    has: false,
  });
  const savedFly = useRef<{ pos: THREE.Vector3; yaw: number; pitch: number; has: boolean }>({
    pos: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    has: false,
  });

  useEffect(() => {
    if (cameraMode !== "spaceship") return;
    // Narrow the lens for Fly so the scale reads correctly.
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = FLY_FOV;
      camera.updateProjectionMatrix();
    }
    velocity.current.set(0, 0, 0);
    roll.current = 0;
    keys.current = { forward: false, backward: false, left: false, right: false, up: false, down: false, lookLeft: false, lookRight: false, lookUp: false, lookDown: false, rollLeft: false, rollRight: false };

    if (savedFly.current.has) {
      // Returning to Fly: restore the exact vantage we left, skip the dive-in.
      flyEntering.current = false;
      camera.position.copy(savedFly.current.pos);
      yaw.current = savedFly.current.yaw;
      pitch.current = savedFly.current.pitch;
      camera.quaternion.setFromEuler(new THREE.Euler(pitch.current, yaw.current, 0, "YXZ"));
      return;
    }

    // First Fly entry: cinematic dive-in toward the galactic plane.
    flyEntering.current = true;
    flyElapsed.current = 0;
    flyFromPos.current.copy(camera.position);
    flyFromQuat.current.copy(camera.quaternion);
    // Target orientation: look from the dive vantage toward the galactic core.
    const m = new THREE.Matrix4().lookAt(FLY_START, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
    flyTargetQuat.current.setFromRotationMatrix(m);
  }, [cameraMode, camera]);

  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (cameraMode !== "spaceship" || isTyping()) return;
      switch (e.code) {
        case "KeyW": keys.current.forward = true; break;
        case "KeyA": keys.current.left = true; break;
        case "KeyS": keys.current.backward = true; break;
        case "KeyD": keys.current.right = true; break;
        case "ArrowLeft": keys.current.lookLeft = true; e.preventDefault(); break;
        case "ArrowRight": keys.current.lookRight = true; e.preventDefault(); break;
        case "ArrowUp": keys.current.lookUp = true; e.preventDefault(); break;
        case "ArrowDown": keys.current.lookDown = true; e.preventDefault(); break;
        case "KeyQ": keys.current.rollLeft = true; break;
        case "KeyE": keys.current.rollRight = true; break;
        case "Space": keys.current.up = true; e.preventDefault(); break;
        case "ShiftLeft":
        case "ShiftRight": keys.current.down = true; break;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (cameraMode !== "spaceship") return;
      switch (e.code) {
        case "KeyW": keys.current.forward = false; break;
        case "KeyA": keys.current.left = false; break;
        case "KeyS": keys.current.backward = false; break;
        case "KeyD": keys.current.right = false; break;
        case "ArrowLeft": keys.current.lookLeft = false; break;
        case "ArrowRight": keys.current.lookRight = false; break;
        case "ArrowUp": keys.current.lookUp = false; break;
        case "ArrowDown": keys.current.lookDown = false; break;
        case "KeyQ": keys.current.rollLeft = false; break;
        case "KeyE": keys.current.rollRight = false; break;
        case "Space": keys.current.up = false; break;
        case "ShiftLeft":
        case "ShiftRight": keys.current.down = false; break;
      }
    };
    // Release all thrust if the window loses focus mid-press (otherwise a key
    // held during an alt-tab would be stuck on).
    const releaseAll = () => {
      keys.current = { forward: false, backward: false, left: false, right: false, up: false, down: false, lookLeft: false, lookRight: false, lookUp: false, lookDown: false, rollLeft: false, rollRight: false };
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", releaseAll);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", releaseAll);
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
    if (captureTopDown) {
      // Force a fixed near-overhead frame for the off-screen share-card capture,
      // overriding intro/tour/god/fly so the card always shows the disk top-down.
      if (state.camera instanceof THREE.PerspectiveCamera && state.camera.fov !== BASE_FOV) {
        state.camera.fov = BASE_FOV;
        state.camera.updateProjectionMatrix();
      }
      // A small Z keeps lookAt off the vertical singularity and adds a hint of
      // perspective so the spiral reads as a disk rather than a flat ring.
      state.camera.up.set(0, 1, 0);
      state.camera.position.set(0, captureHeight, captureHeight * 0.12);
      state.camera.lookAt(0, 0, 0);
      return;
    }

    if (!introFinished) {
      const p = easeInOutCubic(THREE.MathUtils.clamp(introProgressRef.current, 0, 1));
      state.camera.position.copy(INTRO_START).lerp(HOME_POS, p);
      state.camera.lookAt(0, 0, 0);
      return;
    }

    if (tourActive) {
      const stop = tourStops[tourStopIndex];
      const worldPos = _worldPos.set(0, 0, 0);
      let hasTarget = false;
      const offset = _offset.set(0, 40, 110);

      if (stop && stop.target.type !== "overview") {
        if (stop.target.type === "sun") {
          const sun = sunRefs[stop.target.id];
          if (sun) {
            sun.getWorldPosition(worldPos);
            hasTarget = worldPos.lengthSq() > 0;
          }
          const r = sunRadii[stop.target.id] || 20;
          offset.set(0, r * 4 + 30, r * 9 + 60);
        } else {
          const planet = planetRefs[stop.target.id];
          if (planet) {
            planet.getWorldPosition(worldPos);
            hasTarget = worldPos.lengthSq() > 0;
          }
          const pr = planetOrbits[stop.target.id]?.planetRadius || 1;
          offset.set(0, pr * 6 + 8, pr * 16 + 16);
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
      const worldPos = _worldPos.set(0, 0, 0);
      let hasTarget = false;
      const offset = _offset.set(0, 30, 60);

      if (selectedObject) {
        if (selectedObject.type === "sun") {
          const sun = sunRefs[selectedObject.id];
          if (sun) {
            sun.getWorldPosition(worldPos);
            hasTarget = worldPos.lengthSq() > 0;
          }
          const r = sunRadii[selectedObject.id] || 20;
          offset.set(0, r * 4 + 30, r * 9 + 60);
        } else if (selectedObject.type === "planet") {
          const planet = planetRefs[selectedObject.id];
          if (planet) {
            planet.getWorldPosition(worldPos);
            hasTarget = worldPos.lengthSq() > 0;
          }
          const pr = planetOrbits[selectedObject.id]?.planetRadius || 1;
          offset.set(0, pr * 6 + 8, pr * 16 + 16);
        }
      }

      const lookAt = hasTarget ? worldPos : _lookAt.set(0, 0, 0);

      if (focusing.current) {
        // Brief fly-to: drive both camera and pivot toward the framed target.
        targetLookAt.current.copy(lookAt);
        if (hasTarget) targetPosition.current.copy(worldPos).add(offset);
        else targetPosition.current.copy(HOME_POS);
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

      // Remember this vantage so leaving and returning to Orbit restores it.
      savedGod.current.pos.copy(state.camera.position);
      if (orbit) savedGod.current.target.copy(orbit.target);
      savedGod.current.has = true;
    } else if (cameraMode === "spaceship") {
      // Cinematic dive-in: sweep from the prior view down into the plane before
      // handing control to the player.
      if (flyEntering.current) {
        flyElapsed.current += delta;
        const t = THREE.MathUtils.clamp(flyElapsed.current / FLY_ENTER_DUR, 0, 1);
        const e = easeInOutCubic(t);
        state.camera.position.copy(flyFromPos.current).lerp(FLY_START, e);
        state.camera.quaternion.copy(flyFromQuat.current).slerp(flyTargetQuat.current, e);
        if (t >= 1) {
          flyEntering.current = false;
          const eu = new THREE.Euler().setFromQuaternion(state.camera.quaternion, "YXZ");
          yaw.current = eu.y;
          pitch.current = eu.x;
        }
        return;
      }

      // Keyboard look: arrow keys turn (yaw) and tilt (pitch), matching the
      // mouse-drag range so the two input methods stay interchangeable.
      const lookLimit = Math.PI / 2 - 0.05;
      const yawInput = Number(keys.current.lookLeft) - Number(keys.current.lookRight);
      const pitchInput = Number(keys.current.lookUp) - Number(keys.current.lookDown);
      yaw.current += yawInput * 1.6 * delta;
      pitch.current += pitchInput * 1.3 * delta;
      pitch.current = Math.max(-lookLimit, Math.min(lookLimit, pitch.current));

      // Bank into strafes (auto) plus manual Q/E roll, then apply look angles.
      const strafe = Number(keys.current.right) - Number(keys.current.left);
      const rollInput = Number(keys.current.rollLeft) - Number(keys.current.rollRight);
      roll.current = THREE.MathUtils.lerp(
        roll.current,
        -strafe * 0.22 + rollInput * 0.6,
        Math.min(1, delta * 4),
      );
      state.camera.quaternion.setFromEuler(
        _euler.set(pitch.current, yaw.current, roll.current, "YXZ"),
      );

      // Momentum-based 6DOF flight. Forward/strafe follow the look direction;
      // vertical uses world up so ascend/descend stay intuitive while pitched.
      const accel = 900 * delta;
      const maxSpeed = 520;

      const move = _move.set(
        Number(keys.current.right) - Number(keys.current.left),
        0,
        Number(keys.current.backward) - Number(keys.current.forward),
      );
      if (move.lengthSq() > 0) {
        move.normalize().applyQuaternion(state.camera.quaternion);
        velocity.current.addScaledVector(move, accel);
      }
      const vertical = Number(keys.current.up) - Number(keys.current.down);
      if (vertical !== 0) velocity.current.y += vertical * accel;

      if (velocity.current.length() > maxSpeed) velocity.current.setLength(maxSpeed);
      state.camera.position.addScaledVector(velocity.current, delta);
      velocity.current.multiplyScalar(1 - Math.min(1, delta * 2.4));

      // Remember this vantage so leaving and returning to Fly restores it.
      savedFly.current.pos.copy(state.camera.position);
      savedFly.current.yaw = yaw.current;
      savedFly.current.pitch = pitch.current;
      savedFly.current.has = true;
    }
  });

  if (captureTopDown) {
    return null;
  }

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
