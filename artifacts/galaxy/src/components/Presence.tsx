import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useSyncExternalStore } from "react";
import * as THREE from "three";
import { presence } from "@/lib/presence";
import { useAppState } from "@/lib/store";

const X_AXIS = new THREE.Vector3(1, 0, 0);
const WISP_SCALE = 26;

// Soft radial glow sprite shared by every wisp.
let wispTexture: THREE.Texture | null = null;
function getWispTexture(): THREE.Texture {
  if (wispTexture) return wispTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  wispTexture = new THREE.CanvasTexture(canvas);
  wispTexture.colorSpace = THREE.SRGBColorSpace;
  return wispTexture;
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h % 1000) / 1000;
}

const _target = new THREE.Vector3();

function Wisp({ id }: { id: string }) {
  const ref = useRef<THREE.Group>(null);
  const smoothed = useRef(new THREE.Vector3());
  const initialized = useRef(false);
  const phase = useRef(hashId(id) * Math.PI * 2);
  const color = presence.peers.get(id)?.color ?? "#8ab4ff";

  useFrame((_, dt) => {
    const peer = presence.peers.get(id);
    const g = ref.current;
    if (!peer || !g) return;
    _target.set(peer.x, peer.y, peer.z);
    if (!initialized.current) {
      smoothed.current.copy(_target);
      initialized.current = true;
    } else {
      smoothed.current.lerp(_target, Math.min(1, dt * 6));
    }
    g.position.copy(smoothed.current);
    const pulse = 1 + Math.sin(performance.now() * 0.003 + phase.current) * 0.14;
    g.scale.setScalar(WISP_SCALE * pulse);
  });

  return (
    <group ref={ref}>
      <sprite>
        <spriteMaterial
          map={getWispTexture()}
          color={color}
          transparent
          opacity={0.85}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

/** Renders faint glowing wisps for every other explorer, in galaxy-local space. */
export function PresenceWisps() {
  const { galaxyTilt } = useAppState();
  const ids = useSyncExternalStore(presence.subscribe, presence.getPeerIds, () => EMPTY);

  return (
    <group rotation-x={galaxyTilt}>
      {ids.map((id) => (
        <Wisp key={id} id={id} />
      ))}
    </group>
  );
}

const EMPTY: string[] = [];

/** Streams this explorer's camera pose to the server (no visual output). */
export function PresenceBroadcaster() {
  const { galaxyTilt, cameraMode } = useAppState();
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    presence.start();
    return () => presence.stop();
  }, []);

  useFrame(() => {
    _target.copy(camera.position);
    if (galaxyTilt) _target.applyAxisAngle(X_AXIS, -galaxyTilt);
    presence.sendPose(_target.x, _target.y, _target.z, cameraMode === "spaceship" ? 1 : 0);
  });

  return null;
}
