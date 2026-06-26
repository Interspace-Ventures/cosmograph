import { useFrame, useThree } from "@react-three/fiber";
import { useRef, useEffect, useMemo, useSyncExternalStore } from "react";
import * as THREE from "three";
import { presence } from "@/lib/presence";
import { useAppState } from "@/lib/store";
import { shipLookFromSeed, getSelfSeed } from "@/lib/shipLook";
import { ShipModel, SHIP_FORWARD } from "./Ship";

const X_AXIS = new THREE.Vector3(1, 0, 0);
// Ship model is normalized to a 1-unit longest axis, so these scales are roughly
// the ship's size in world units (kept deliberately small).
const PEER_SCALE = 7;
// Hide a peer ship once it's closer than this to the camera, so a passing
// cosmonaut never balloons into a giant orb filling the view.
const NEAR_CULL = 60;
// The viewer's own ship rides at a fixed (zoom-independent) distance ahead of the
// camera, so this is a constant apparent size — small, like a distant cosmonaut.
const SELF_SCALE = 4.5;
const SELF_OFFSET = new THREE.Vector3(0, -12, -78);

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h % 1000) / 1000;
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

const _target = new THREE.Vector3();
const _world = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const EMPTY: string[] = [];

// One other explorer, drawn as a small ship that points the way it's flying and
// fades in (scales up) the first time it appears.
function PeerShip({ id }: { id: string }) {
  const ref = useRef<THREE.Group>(null);
  const smoothed = useRef(new THREE.Vector3());
  const prev = useRef(new THREE.Vector3());
  const heading = useRef(new THREE.Quaternion());
  const initialized = useRef(false);
  const appear = useRef(0);
  const phase = useRef(hashId(id) * Math.PI * 2);
  // Each cosmonaut's ship look is derived deterministically from their stable
  // presence id, so every peer reads as a distinct craft with no extra wire data.
  const look = useMemo(() => shipLookFromSeed(id), [id]);
  const camera = useThree((s) => s.camera);

  useFrame((_, dt) => {
    const peer = presence.peers.get(id);
    const g = ref.current;
    if (!peer || !g) return;

    _target.set(peer.x, peer.y, peer.z);
    if (!initialized.current) {
      smoothed.current.copy(_target);
      prev.current.copy(_target);
      initialized.current = true;
    } else {
      smoothed.current.lerp(_target, Math.min(1, dt * 6));
    }
    g.position.copy(smoothed.current);

    // Heading: face along recent movement; hold the last heading when idle.
    _dir.copy(smoothed.current).sub(prev.current);
    prev.current.copy(smoothed.current);
    if (_dir.lengthSq() > 1e-4) {
      _dir.normalize();
      _q.setFromUnitVectors(SHIP_FORWARD, _dir);
      heading.current.slerp(_q, Math.min(1, dt * 4));
    }
    g.quaternion.copy(heading.current);

    // Cull when too close so a peer near the camera doesn't fill the frame.
    g.getWorldPosition(_world);
    if (_world.distanceTo(camera.position) < NEAR_CULL) {
      g.visible = false;
      return;
    }
    g.visible = true;

    appear.current = Math.min(1, appear.current + dt / 0.9);
    const pulse = 1 + Math.sin(performance.now() * 0.002 + phase.current) * 0.05;
    g.scale.setScalar(PEER_SCALE * look.scale * easeOut(appear.current) * pulse);
  });

  return (
    <group ref={ref} scale={0.001}>
      <ShipModel variant="peer" look={look} glow />
    </group>
  );
}

/** Renders ships for every other explorer, in galaxy-local space. */
export function PresencePeers() {
  const { galaxyTilt, datasetVersion } = useAppState();
  const ids = useSyncExternalStore(
    presence.subscribe,
    presence.getPeerIds,
    () => EMPTY,
  );
  const revealed = useSyncExternalStore(
    presence.subscribe,
    presence.getRevealed,
    () => false,
  );

  // Live presence runs only on the canonical default galaxy (datasetVersion 0),
  // and only after the post-arrival grace period.
  if (datasetVersion !== 0) return null;
  if (!revealed) return null;

  return (
    <group rotation-x={galaxyTilt}>
      {ids.map((id) => (
        <PeerShip key={id} id={id} />
      ))}
    </group>
  );
}

const _camDir = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _rollQ = new THREE.Quaternion();
const _baseQ = new THREE.Quaternion();

/**
 * The viewer's OWN ship, shown in Orbit mode as a semi-transparent chase craft
 * just ahead and below the camera, banking into turns. In Fly mode you're in the
 * cockpit, so it's hidden (you'd be sitting inside it).
 */
export function SelfShip() {
  const { cameraMode, introFinished, tourActive, showSelfShip } = useAppState();
  const camera = useThree((s) => s.camera);
  const ref = useRef<THREE.Group>(null);
  const roll = useRef(0);
  const prevAz = useRef<number | null>(null);
  const appear = useRef(0);
  // The viewer's own ship look, stable per-browser (and, once accounts can save
  // a ship, overridable from the saved config).
  const look = useMemo(() => shipLookFromSeed(getSelfSeed()), []);

  const active =
    introFinished && !tourActive && cameraMode === "god" && showSelfShip;

  // Reset the bank/appear state whenever it (re)activates so it eases back in.
  useEffect(() => {
    if (active) {
      appear.current = 0;
      roll.current = 0;
      prevAz.current = null;
    }
  }, [active]);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g || !active) return;

    // Position: fixed offset in camera space — ahead and below — so the ship
    // always rides in the lower-center of the frame as a small distant sprite.
    _offset
      .copy(SELF_OFFSET)
      .applyQuaternion(camera.quaternion)
      .add(camera.position);
    g.position.copy(_offset);

    // Heading: nose follows the camera's forward direction (world -Z).
    camera.getWorldDirection(_camDir);
    _baseQ.setFromUnitVectors(SHIP_FORWARD, _camDir);

    // Bank into horizontal turns for a game-y chase feel.
    const az = Math.atan2(_camDir.x, _camDir.z);
    let dAz = prevAz.current === null ? 0 : az - prevAz.current;
    prevAz.current = az;
    if (dAz > Math.PI) dAz -= Math.PI * 2;
    if (dAz < -Math.PI) dAz += Math.PI * 2;
    const targetRoll = THREE.MathUtils.clamp(
      (dAz / Math.max(dt, 1e-3)) * 0.12,
      -0.6,
      0.6,
    );
    roll.current = THREE.MathUtils.lerp(roll.current, targetRoll, Math.min(1, dt * 5));
    _rollQ.setFromAxisAngle(_camDir, roll.current);
    g.quaternion.copy(_baseQ).premultiply(_rollQ);

    appear.current = Math.min(1, appear.current + dt / 0.5);
    g.scale.setScalar(SELF_SCALE * look.scale * easeOut(appear.current));
  });

  if (!active) return null;

  return (
    <group ref={ref} scale={0.001} renderOrder={10}>
      <ShipModel variant="self" look={look} glow />
    </group>
  );
}

/** Streams this explorer's camera pose to the server (no visual output). */
export function PresenceBroadcaster() {
  const { galaxyTilt, cameraMode, datasetVersion } = useAppState();
  const camera = useThree((s) => s.camera);

  // Presence (and its server cost) is scoped to the canonical default galaxy
  // only. Exploring another scientist live never opens a presence socket.
  const presenceEnabled = datasetVersion === 0;

  useEffect(() => {
    if (!presenceEnabled) return;
    presence.start();
    return () => presence.stop();
  }, [presenceEnabled]);

  useFrame(() => {
    if (!presenceEnabled) return;
    _target.copy(camera.position);
    if (galaxyTilt) _target.applyAxisAngle(X_AXIS, -galaxyTilt);
    presence.sendPose(_target.x, _target.y, _target.z, cameraMode === "spaceship" ? 1 : 0);
  });

  return null;
}
