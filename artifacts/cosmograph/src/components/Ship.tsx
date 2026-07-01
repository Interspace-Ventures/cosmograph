import { useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { type ShipLook } from "../lib/shipLook";
import {
  getShipType,
  type ShipPart,
  type PartKind,
} from "../lib/shipTypes";

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

// Cached, open-ended cones for the engine flame, translated so the wide base
// sits at the origin (the nozzle) and the point trails along +local-Y. Scaling a
// mesh's local Y therefore lengthens the flame *away* from the nozzle instead of
// growing symmetrically. Shared across every ship so the whole fleet's flames
// allocate two geometries total.
const flameGeoCache = new Map<string, THREE.BufferGeometry>();
function getFlameCone(radius: number, height: number): THREE.BufferGeometry {
  const key = `${radius}|${height}`;
  const cached = flameGeoCache.get(key);
  if (cached) return cached;
  const g = new THREE.ConeGeometry(radius, height, 14, 1, true);
  g.translate(0, height / 2, 0);
  flameGeoCache.set(key, g);
  return g;
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

// Cached geometries for procedural type parts, keyed by kind+args so identical
// parts across many ships allocate a single buffer geometry.
const partGeoCache = new Map<string, THREE.BufferGeometry>();
function getPartGeometry(kind: PartKind, args: number[]): THREE.BufferGeometry {
  const key = `${kind}|${args.join(",")}`;
  const cached = partGeoCache.get(key);
  if (cached) return cached;
  let g: THREE.BufferGeometry;
  switch (kind) {
    case "box":
      g = new THREE.BoxGeometry(...(args as [number, number, number]));
      break;
    case "cone":
      g = new THREE.ConeGeometry(...(args as [number, number, number]));
      break;
    case "cylinder":
      g = new THREE.CylinderGeometry(
        ...(args as [number, number, number, number]),
      );
      break;
    case "sphere":
      g = new THREE.SphereGeometry(...(args as [number, number, number]));
      break;
    case "torus":
      g = new THREE.TorusGeometry(...(args as [number, number, number, number]));
      break;
  }
  partGeoCache.set(key, g);
  return g;
}

// Cached solid materials for type parts, keyed by (variant, color, emissive).
const partMatCache = new Map<string, THREE.MeshStandardMaterial>();
function getPartMaterial(
  variant: "peer" | "self",
  color: string,
  emissive: boolean,
): THREE.MeshStandardMaterial {
  const key = `${variant}|${color}|${emissive ? 1 : 0}`;
  const cached = partMatCache.get(key);
  if (cached) return cached;
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color) });
  m.emissive = new THREE.Color(color);
  if (emissive) {
    // Self-illuminated running light / engine bit — pops in the dark scene.
    m.emissiveIntensity = 1.4;
    m.toneMapped = false;
  } else {
    // Structural part — slight self-illumination so it stays readable, plus a
    // touch of metalness to match the hull's sci-fi look.
    m.emissiveIntensity = 0.25;
    m.metalness = 0.3;
    m.roughness = 0.6;
  }
  if (variant === "self") {
    m.transparent = true;
    m.opacity = SELF_OPACITY;
    m.depthWrite = false;
  }
  partMatCache.set(key, m);
  return m;
}

// Renders one declarative type part (and its X-mirror, for symmetric wings/pods)
// in the hull's normalized, origin-centered frame. Colors come from the ship's
// ShipLook so parts always match the cosmonaut's chosen palette.
function ShipPartMeshes({
  part,
  look,
  variant,
}: {
  part: ShipPart;
  look: ShipLook;
  variant: "peer" | "self";
}) {
  const color =
    part.color === "hull"
      ? look.hull
      : part.color === "accent"
        ? look.accent
        : look.glow;
  const material = getPartMaterial(variant, color, !!part.emissive);
  const geometry = getPartGeometry(part.kind, part.args);
  const rot = part.rotation ?? [0, 0, 0];
  const scl = part.scale ?? [1, 1, 1];
  return (
    <>
      <mesh
        geometry={geometry}
        material={material}
        position={part.position}
        rotation={rot}
        scale={scl}
      />
      {part.mirrorX && (
        <mesh
          geometry={geometry}
          material={material}
          position={[-part.position[0], part.position[1], part.position[2]]}
          rotation={[rot[0], -rot[1], -rot[2]]}
          scale={scl}
        />
      )}
    </>
  );
}

// Fiery rocket-exhaust palette — a white-hot core wrapped in an orange plume.
// Fixed (not per-cosmonaut) so every engine reads as real combustion rather than
// a colored glow; ship identity still comes from the hull tint and nose accent.
const FLAME_CORE = "#fff0b8";
const FLAME_OUTER = "#ff5a1e";

/**
 * One rear engine flame: two additively-blended, open-ended cones (a bright
 * inner jet inside a broader orange plume) that point straight back from the
 * nozzle. Because the cones' bases are anchored at the nozzle (see
 * getFlameCone), scaling their local Y stretches the flame *backward* — so it
 * lengthens with throttle and flickers like real combustion instead of
 * ballooning. The apex points along -Z (the tail), so the plume correctly
 * recedes away from a chase camera instead of billboarding toward it.
 */
function Flame({ x, self }: { x: number; self: boolean }) {
  return (
    <group position={[x, 0, -0.5]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* outer plume */}
      <mesh geometry={getFlameCone(0.09, 0.62)} scale={[0.0001, 0.0001, 0.0001]}>
        <meshBasicMaterial
          color={FLAME_OUTER}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      {/* inner white-hot jet */}
      <mesh geometry={getFlameCone(0.042, 0.42)} scale={[0.0001, 0.0001, 0.0001]}>
        <meshBasicMaterial
          color={FLAME_CORE}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/**
 * Twin rear engine thrusters that brighten and stretch with throttle. The
 * parent reports thrust (0..1) via a ref so this animates per-frame without
 * re-rendering the ship. Mounted at the model's tail (local -Z, since the nose
 * is +Z).
 */
function Thrusters({
  thrustRef,
  self,
}: {
  thrustRef: MutableRefObject<number>;
  self: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const cur = useRef(0);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const target = THREE.MathUtils.clamp(thrustRef.current, 0, 1);
    // Ease toward the target so the flame swells/fades smoothly instead of
    // popping, and so a one-frame speed spike on (re)entry doesn't flash.
    cur.current = THREE.MathUtils.lerp(cur.current, target, Math.min(1, dt * 8));
    const t = cur.current;
    // Fast, always-positive flicker so the flame looks alive (turbulent) rather
    // than a static cone.
    const time = state.clock.elapsedTime;
    const flick = 0.82 + 0.18 * Math.abs(Math.sin(time * 37) * Math.sin(time * 19.7));
    // Idle engines keep a small pilot flame so a stationary ship still reads as
    // powered; throttle grows and lengthens it.
    const drive = 0.18 + 0.82 * t;
    const len = (0.55 + 1.05 * t) * flick;
    const wid = 0.7 + 0.45 * t;
    const outerOp = (self ? 0.32 : 0.7) * drive * flick;
    const coreOp = (self ? 0.5 : 1.0) * drive * flick;
    for (const flame of g.children) {
      const outer = flame.children[0] as THREE.Mesh | undefined;
      const core = flame.children[1] as THREE.Mesh | undefined;
      if (outer) {
        outer.scale.set(wid, len, wid);
        (outer.material as THREE.MeshBasicMaterial).opacity = outerOp;
      }
      if (core) {
        core.scale.set(wid * 0.8, len * 0.82, wid * 0.8);
        (core.material as THREE.MeshBasicMaterial).opacity = coreOp;
      }
    }
  });

  return (
    <group ref={group}>
      <Flame x={-0.1} self={self} />
      <Flame x={0.1} self={self} />
    </group>
  );
}

/**
 * One spaceship. Normalized so its longest dimension is 1 unit and centered at
 * the origin, so callers can size it purely via the parent group's scale and
 * rotate it about its own center. `variant="self"` is the translucent own-ship.
 * `look` drives per-cosmonaut variety: hull tint and glow-tinted parts. When a
 * `thrustRef` is supplied, the fiery rear flames grow with its 0..1 value.
 */
export function ShipModel({
  variant = "peer",
  look,
  glow = true,
  thrustRef,
  typeId,
}: {
  variant?: "peer" | "self";
  look: ShipLook;
  glow?: boolean;
  thrustRef?: MutableRefObject<number>;
  /** Which ship TYPE to render (procedural parts + body scale). Defaults to scout. */
  typeId?: string;
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
  const shipType = getShipType(typeId);

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
    <group scale={shipType.bodyScale}>
      <mesh
        geometry={geometry}
        material={material}
        scale={norm.k}
        position={norm.offset}
      />
      {/* Type-specific procedural parts (wings/fins/pods…) on the shared hull. */}
      {shipType.parts.map((part, i) => (
        <ShipPartMeshes key={i} part={part} look={look} variant={variant} />
      ))}
      {glow && (
        // Small warm bloom at the nozzle: softens the base of the flame cones
        // and acts as a distance marker so an idle ship still reads from afar.
        // Deliberately tiny (was a ship-sized halo that looked like a colored
        // orb) and warm to match the exhaust rather than tint it.
        <sprite position={[0, 0, -0.5]} scale={[0.34, 0.34, 0.34]}>
          <spriteMaterial
            map={getGlowTexture()}
            color={FLAME_OUTER}
            transparent
            opacity={self ? 0.22 : 0.55}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
      )}
      {/* Rear engine flames — brighten and stretch in proportion to throttle. */}
      {thrustRef && <Thrusters thrustRef={thrustRef} self={self} />}
    </group>
  );
}

useGLTF.preload(MODEL_URL);
