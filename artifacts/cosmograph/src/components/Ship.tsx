import { useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { type ShipLook } from "../lib/shipLook";

// A real low-poly spaceship model (CC0, "Spaceship" by Quaternius via Poly Pizza,
// https://poly.pizza/m/Jqfed124pQ). The model's nose points local +Z, which lets
// callers orient it with `quaternion.setFromUnitVectors(FORWARD, dir)`.
export const SHIP_FORWARD = new THREE.Vector3(0, 0, 1);

const MODEL_URL = `${import.meta.env.BASE_URL}models/ship.glb`;
const MESH_NAME = "Spaceship_FernandoTheFlamingo";
const MATERIAL_NAME = "Atlas";

// Soft radial glow sprite for the engine plume / distance halo.
let glowTexture: THREE.Texture | null = null;
export function getGlowTexture(): THREE.Texture {
  if (glowTexture) return glowTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

// Self ship is "essentially transparent" so the viewer's own chase craft reads
// as a faint glassy hint and never occludes the galaxy or UI behind it.
const SELF_OPACITY = 0.16;

// Per-hull material cache. The galaxy is very dark, so we self-illuminate the
// texture (emissiveMap) a touch to keep ships readable. The hull tint multiplies
// the baked texture atlas to vary each cosmonaut's color. Materials are cached by
// (variant, hull) so 60 peers drawing from an 8-color palette only ever allocate
// a handful of materials.
const matCache = new Map<string, THREE.MeshStandardMaterial>();
function getShipMaterial(
  base: THREE.MeshStandardMaterial,
  variant: "peer" | "self",
  hull: string,
): THREE.MeshStandardMaterial {
  const key = `${variant}|${hull}`;
  const cached = matCache.get(key);
  if (cached) return cached;
  const m = base.clone();
  m.color = new THREE.Color(hull);
  m.emissiveMap = base.map;
  m.emissive = new THREE.Color("#ffffff");
  m.emissiveIntensity = 0.35;
  if (variant === "self") {
    m.transparent = true;
    m.opacity = SELF_OPACITY;
    m.depthWrite = false;
  }
  matCache.set(key, m);
  return m;
}

/**
 * Twin rear engine thrusters that brighten and stretch with throttle. The
 * parent reports thrust (0..1) via a ref so this animates per-frame without
 * re-rendering the ship. Mounted at the model's tail (local -Z, since the nose
 * is +Z) and additively blended so they read as hot engine plumes.
 */
function Thrusters({
  look,
  thrustRef,
  self,
}: {
  look: ShipLook;
  thrustRef: MutableRefObject<number>;
  self: boolean;
}) {
  const left = useRef<THREE.Sprite>(null);
  const right = useRef<THREE.Sprite>(null);
  const matL = useRef<THREE.SpriteMaterial>(null);
  const matR = useRef<THREE.SpriteMaterial>(null);
  const cur = useRef(0);

  useFrame((_, dt) => {
    const target = THREE.MathUtils.clamp(thrustRef.current, 0, 1);
    // Ease toward the target so the glow swells/fades smoothly instead of
    // popping, and so a one-frame speed spike on (re)entry doesn't flash.
    cur.current = THREE.MathUtils.lerp(cur.current, target, Math.min(1, dt * 8));
    const t = cur.current;
    const opacity = (self ? 0.55 : 0.95) * t;
    // Small, tight nozzle flare (was a broad soft halo) so it reads as a focused
    // space thruster rather than a fuzzy glow.
    const s = 0.07 + t * 0.13;
    if (matL.current) matL.current.opacity = opacity;
    if (matR.current) matR.current.opacity = opacity;
    if (left.current) left.current.scale.setScalar(s);
    if (right.current) right.current.scale.setScalar(s);
  });

  return (
    <>
      <sprite ref={left} position={[-0.1, 0, -0.5]} scale={[0.0001, 0.0001, 0.0001]}>
        <spriteMaterial
          ref={matL}
          map={getGlowTexture()}
          color={look.glow}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={right} position={[0.1, 0, -0.5]} scale={[0.0001, 0.0001, 0.0001]}>
        <spriteMaterial
          ref={matR}
          map={getGlowTexture()}
          color={look.glow}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
    </>
  );
}

/**
 * One spaceship. Normalized so its longest dimension is 1 unit and centered at
 * the origin, so callers can size it purely via the parent group's scale and
 * rotate it about its own center. `variant="self"` is the translucent own-ship.
 * `look` drives per-cosmonaut variety: hull tint and engine glow. When a
 * `thrustRef` is supplied, rear thrusters glow in proportion to its 0..1 value.
 */
export function ShipModel({
  variant = "peer",
  look,
  glow = true,
  thrustRef,
}: {
  variant?: "peer" | "self";
  look: ShipLook;
  glow?: boolean;
  thrustRef?: MutableRefObject<number>;
}) {
  const { nodes, materials } = useGLTF(MODEL_URL) as unknown as {
    nodes: Record<string, THREE.Mesh>;
    materials: Record<string, THREE.MeshStandardMaterial>;
  };

  const meshNode = nodes[MESH_NAME];
  const baseMaterial = materials[MATERIAL_NAME];
  if (!meshNode || !baseMaterial) {
    throw new Error(
      `Ship GLB is missing expected node "${MESH_NAME}" or material "${MATERIAL_NAME}" — the model at ${MODEL_URL} may have changed.`,
    );
  }

  const geometry = meshNode.geometry;
  const material = getShipMaterial(baseMaterial, variant, look.hull);
  const self = variant === "self";

  // Normalize: scale so the longest axis is 1, and offset so the model is
  // centered on the origin. The geometry is shared across every ship, so only
  // the first mount computes the bounding box; later mounts reuse it.
  const norm = useMemo(() => {
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const k = 1 / Math.max(size.x, size.y, size.z);
    return {
      k,
      offset: [-center.x * k, -center.y * k, -center.z * k] as const,
    };
  }, [geometry]);

  return (
    <group>
      <mesh
        geometry={geometry}
        material={material}
        scale={norm.k}
        position={norm.offset}
      />
      {glow && (
        <sprite position={[0, 0, -0.55]} scale={[1, 1, 1]}>
          <spriteMaterial
            map={getGlowTexture()}
            color={look.glow}
            transparent
            opacity={self ? 0.35 : 0.8}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
      )}
      {/* Rear engine thrusters — glow in proportion to throttle when moving. */}
      {thrustRef && <Thrusters look={look} thrustRef={thrustRef} self={self} />}
    </group>
  );
}

useGLTF.preload(MODEL_URL);
