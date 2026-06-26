import { useMemo } from "react";
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
 * One spaceship. Normalized so its longest dimension is 1 unit and centered at
 * the origin, so callers can size it purely via the parent group's scale and
 * rotate it about its own center. `variant="self"` is the translucent own-ship.
 * `look` drives per-cosmonaut variety: hull tint, engine glow, and nose accent.
 */
export function ShipModel({
  variant = "peer",
  look,
  glow = true,
}: {
  variant?: "peer" | "self";
  look: ShipLook;
  glow?: boolean;
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
      {/* Nose running light — a small accent spark that varies per cosmonaut. */}
      <sprite position={[0, 0.04, 0.5]} scale={[0.32, 0.32, 0.32]}>
        <spriteMaterial
          map={getGlowTexture()}
          color={look.accent}
          transparent
          opacity={self ? 0.4 : 0.95}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

useGLTF.preload(MODEL_URL);
