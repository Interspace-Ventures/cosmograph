// Ship TYPES ("skins"). One base GLB hull (see Ship.tsx) is shared by every
// type; a type adds a small set of declarative, procedurally-rendered PARTS
// (wings, fins, pods, cannons, a canopy…) on top of that hull so each craft
// reads as a genuinely different ship without shipping a separate model. Colors
// still come from the per-cosmonaut ShipLook seed and are free on any owned
// type; the TYPE itself is the purchasable unit (the free "scout" is the
// default everyone flies; the rest are member-included or $1 one-time).

export type ColorRole = "hull" | "accent" | "glow";
export type PartKind = "box" | "cone" | "cylinder" | "sphere" | "torus";

export interface ShipPart {
  kind: PartKind;
  /** Geometry constructor args, forwarded to the matching three geometry. */
  args: number[];
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  /** Which ShipLook color tints this part. */
  color: ColorRole;
  /** Also render this part mirrored across X (for symmetric wings/pods). */
  mirrorX?: boolean;
  /** Self-illuminated running light / engine bit (additive, ignores tone map). */
  emissive?: boolean;
}

export interface ShipType {
  id: string;
  name: string;
  tagline: string;
  /** false = the free default everyone flies; true = must be owned. */
  premium: boolean;
  /** Uniform scale applied to the whole craft so silhouettes vary in mass. */
  bodyScale: number;
  parts: ShipPart[];
}

// The hull GLB is normalized to longest-axis = 1, centered at the origin, nose
// pointing +Z (see Ship.tsx). All part transforms below are in that space:
// roughly [-0.5, 0.5] per axis, +Z forward, -Z tail, +Y up.

const SCOUT: ShipType = {
  id: "scout",
  name: "Scout",
  tagline: "The standard-issue cosmonaut hull. Light, clean, free.",
  premium: false,
  bodyScale: 1,
  parts: [],
};

const FIGHTER: ShipType = {
  id: "fighter",
  name: "Fighter",
  tagline: "Swept attack wings and forward ion cannons.",
  premium: true,
  bodyScale: 1,
  parts: [
    // Swept-back wings.
    {
      kind: "box",
      args: [0.45, 0.02, 0.22],
      position: [0.32, -0.02, -0.06],
      rotation: [0, 0.38, -0.16],
      color: "hull",
      mirrorX: true,
    },
    // Wingtip running lights.
    {
      kind: "cylinder",
      args: [0.018, 0.018, 0.07, 8],
      position: [0.54, -0.01, -0.16],
      rotation: [Math.PI / 2, 0, 0],
      color: "glow",
      emissive: true,
      mirrorX: true,
    },
    // Forward cannons.
    {
      kind: "cylinder",
      args: [0.022, 0.022, 0.4, 8],
      position: [0.18, -0.04, 0.24],
      rotation: [Math.PI / 2, 0, 0],
      color: "accent",
      mirrorX: true,
    },
  ],
};

const HAULER: ShipType = {
  id: "hauler",
  name: "Hauler",
  tagline: "Bulky twin cargo pods and a dorsal stabilizer.",
  premium: true,
  bodyScale: 1.12,
  parts: [
    // Side cargo pods.
    {
      kind: "cylinder",
      args: [0.12, 0.12, 0.46, 12],
      position: [0.3, -0.05, -0.04],
      rotation: [Math.PI / 2, 0, 0],
      color: "hull",
      mirrorX: true,
    },
    // Pod nose caps (accent rings read as hatches).
    {
      kind: "cylinder",
      args: [0.13, 0.13, 0.04, 12],
      position: [0.3, -0.05, 0.19],
      rotation: [Math.PI / 2, 0, 0],
      color: "accent",
      mirrorX: true,
    },
    // Dorsal stabilizer fin.
    {
      kind: "box",
      args: [0.03, 0.2, 0.24],
      position: [0, 0.2, -0.18],
      color: "accent",
    },
  ],
};

const INTERCEPTOR: ShipType = {
  id: "interceptor",
  name: "Interceptor",
  tagline: "A lean nose spike and twin canted tail fins.",
  premium: true,
  bodyScale: 1,
  parts: [
    // Nose spike (cone tip points +Z after the X rotation).
    {
      kind: "cone",
      args: [0.05, 0.32, 12],
      position: [0, 0, 0.52],
      rotation: [Math.PI / 2, 0, 0],
      color: "accent",
    },
    // Twin canted tail fins.
    {
      kind: "box",
      args: [0.02, 0.24, 0.18],
      position: [0.1, 0.13, -0.32],
      rotation: [0, 0, 0.22],
      color: "hull",
      mirrorX: true,
    },
    // Tail-fin tip lights.
    {
      kind: "sphere",
      args: [0.03, 8, 8],
      position: [0.14, 0.25, -0.32],
      color: "glow",
      emissive: true,
      mirrorX: true,
    },
  ],
};

export const SHIP_TYPES: ShipType[] = [SCOUT, FIGHTER, HAULER, INTERCEPTOR];

export const DEFAULT_SHIP_TYPE_ID = SCOUT.id;

const BY_ID = new Map(SHIP_TYPES.map((t) => [t.id, t]));

/** Resolve a (possibly null/unknown) type id to a real type, defaulting to scout. */
export function getShipType(id: string | null | undefined): ShipType {
  return (id && BY_ID.get(id)) || SCOUT;
}

/** SKU stored in ship_unlocks for an owned type (future: `color:<pack>`). */
export function shipTypeSku(id: string): string {
  return `type:${id}`;
}
