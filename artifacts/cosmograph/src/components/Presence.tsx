import { useFrame, useThree } from "@react-three/fiber";
import { useRef, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import { presence } from "@/lib/presence";
import { useAppState } from "@/lib/store";
import { shipLookFromSeed } from "@/lib/shipLook";
import { ShipModel, SHIP_FORWARD } from "./Ship";

const X_AXIS = new THREE.Vector3(1, 0, 0);
// Ship model is normalized to a 1-unit longest axis, so these scales are roughly
// the ship's size in world units (kept deliberately small).
const PEER_SCALE = 7;
// Hide a peer ship once it's closer than this to the camera, so a passing
// cosmonaut never balloons into a giant orb filling the view.
const NEAR_CULL = 60;
// Third-person chase: in Fly mode the viewer's own ship rides at a fixed offset
// ahead of and just below the camera, so they steer it from behind and can see
// (and show off) their ship. Both are in camera space; the camera flies, the
// ship is locked to its view.
const FLY_SHIP_SCALE = 8;
const FLY_SHIP_OFFSET = new THREE.Vector3(0, -3, -24);

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
  const thrust = useRef(0);
  const phase = useRef(hashId(id) * Math.PI * 2);
  // Each cosmonaut's ship look is derived from the seed they broadcast (their
  // saved/local ship), falling back to their stable presence id when absent.
  // Tracked in state so a peer who saves a new ship mid-session re-skins live.
  const [seed, setSeed] = useState<string | undefined>(
    () => presence.peers.get(id)?.seed,
  );
  const look = useMemo(() => shipLookFromSeed(seed || id), [seed, id]);
  const camera = useThree((s) => s.camera);

  useFrame((_, dt) => {
    const peer = presence.peers.get(id);
    const g = ref.current;
    if (!peer || !g) return;
    // Re-skin only when the broadcast seed actually changes (rare) — cheap.
    if (peer.seed !== seed) setSeed(peer.seed);

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
    const moveLen = _dir.length();
    if (moveLen > 0.01) {
      _dir.normalize();
      _q.setFromUnitVectors(SHIP_FORWARD, _dir);
      heading.current.slerp(_q, Math.min(1, dt * 4));
    }
    g.quaternion.copy(heading.current);

    // Throttle glow: brighten the thrusters when this peer is actually moving.
    thrust.current = THREE.MathUtils.clamp(moveLen / Math.max(dt, 1e-3) / 240, 0, 1);

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
      <ShipModel variant="peer" look={look} glow thrustRef={thrust} />
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
// The model nose is local +Z while the camera looks down -Z; this 180° flip
// about Y maps the nose onto the view direction when copying camera orientation.
const _flipY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

/**
 * The viewer's OWN ship, shown in Fly mode as a fully-opaque third-person chase
 * craft riding just ahead of and below the camera, banking into turns — so the
 * player sees and steers their own ship. In Orbit mode it's hidden entirely
 * (the god/planetarium view has no ship).
 */
export function SelfShip() {
  const { cameraMode, introFinished, tourActive, shipSeed } = useAppState();
  const camera = useThree((s) => s.camera);
  const ref = useRef<THREE.Group>(null);
  const roll = useRef(0);
  const prevAz = useRef<number | null>(null);
  const appear = useRef(0);
  const thrust = useRef(0);
  const prevCam = useRef(new THREE.Vector3());
  // The viewer's own ship look, derived from the store seed so it updates live
  // when they shuffle or load a saved ship.
  const look = useMemo(() => shipLookFromSeed(shipSeed), [shipSeed]);

  const active = introFinished && !tourActive && cameraMode === "spaceship";

  // Reset the bank/appear state whenever it (re)activates so it eases back in.
  useEffect(() => {
    if (active) {
      appear.current = 0;
      roll.current = 0;
      prevAz.current = null;
      thrust.current = 0;
      prevCam.current.copy(camera.position);
    }
  }, [active, camera]);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g || !active) return;

    // Position: fixed offset in camera space — ahead and below — so the ship
    // always rides in the lower-center of the frame as the chase target.
    _offset
      .copy(FLY_SHIP_OFFSET)
      .applyQuaternion(camera.quaternion)
      .add(camera.position);
    g.position.copy(_offset);

    // Heading: copy the camera's full orientation (flipped 180° about Y so the
    // model's +Z nose aligns with the view's -Z forward). Deriving from the
    // whole quaternion — not just the forward vector — keeps "up" stable, so
    // pitching up/down no longer induces a phantom sideways roll. On-screen
    // pitch/yaw now track the controls 1:1.
    camera.getWorldDirection(_camDir);
    _baseQ.copy(camera.quaternion).multiply(_flipY);

    // Throttle glow: drive the rear thrusters from how fast the camera moves.
    const speed = camera.position.distanceTo(prevCam.current) / Math.max(dt, 1e-3);
    prevCam.current.copy(camera.position);
    thrust.current = THREE.MathUtils.clamp(speed / 240, 0, 1);

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
    g.scale.setScalar(FLY_SHIP_SCALE * look.scale * easeOut(appear.current));
  });

  if (!active) return null;

  return (
    <group ref={ref} scale={0.001} renderOrder={10}>
      <ShipModel variant="peer" look={look} glow={false} thrustRef={thrust} />
    </group>
  );
}

/** Streams this explorer's camera pose to the server (no visual output). */
export function PresenceBroadcaster() {
  const { galaxyTilt, cameraMode, datasetVersion, shipSeed } = useAppState();
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
    presence.sendPose(
      _target.x,
      _target.y,
      _target.z,
      cameraMode === "spaceship" ? 1 : 0,
      shipSeed,
    );
  });

  return null;
}
