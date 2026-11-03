// Isometric projection and plan helpers for the world view. Same camera as the
// approved mockup's iso kit (azimuth 45°, elevation 30°, unit sqrt(1.6)), so the
// curated machine drawings line up with the world grid exactly.

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

const A = (45 * Math.PI) / 180;
const E = (30 * Math.PI) / 180;
const SIN_A = Math.sin(A);
const COS_A = Math.cos(A);
const SIN_E = Math.sin(E);
const COS_E = Math.cos(E);
export const ISO_K = Math.sqrt(1.6);

/** World plan + height -> screen (world svg units). */
export function at([x, y, z]: Vec3): Vec2 {
  return [
    (x * SIN_A - y * COS_A) * ISO_K,
    ((x * COS_A + y * SIN_A) * SIN_E - z * COS_E) * ISO_K,
  ];
}

/** Larger = nearer the viewer. */
export function depth(x: number, y: number): number {
  return (x * COS_A + y * SIN_A) * COS_E;
}

// grid
export const PITCH = 330;
export const PLATE_H = 12;
export const FOOT_H = 5;
export const ISLAND_Z = -17;
/** Every machine's plate bottom sits on its tile. */
export const MZ0 = ISLAND_Z + PLATE_H + FOOT_H;

// The machines' own projection: machine units -> one tile, and the plate origin
// in machine units (from the mockup's fitProjection).
export const MACHINE_S0 = 0.848727;
export const MACHINE_PO: Vec2 = [300.0, 239.781];
/** Machine drawing size and visual centre, in its own units. */
export const MACHINE_W = 640;
export const MACHINE_H = 430;
export const MACHINE_C: Vec2 = [300, 214];
/** Thumbnails cover the 600x376 machine viewBox plus a 40-unit margin. */
export const THUMB_BOX = { x: -40, y: -8, w: 680, h: 456 };
export const THUMB_PX = 360;

export const f1 = (n: number) => Math.round(n * 10) / 10;
export const pts = (list: Vec2[]) =>
  list.map(([x, y]) => `${f1(x)},${f1(y)}`).join(" ");

export function machineTransform(cx: number, cy: number, z = MZ0): string {
  const [sx, sy] = at([cx, cy, z]);
  return `translate(${f1(sx)} ${f1(sy)}) scale(${MACHINE_S0.toFixed(5)}) translate(${(-MACHINE_PO[0]).toFixed(3)} ${(-MACHINE_PO[1]).toFixed(3)})`;
}

/** Rounded plan rectangle at height z, projected, as an svg path. */
export function planOutline(
  plan: { x: number; y: number; w: number; d: number; r: number },
  z: number,
  steps = 6,
): string {
  const { x, y, w, d } = plan;
  const r = Math.max(0, Math.min(plan.r, w / 2, d / 2));
  const corners: [number, number, number][] = [
    [x + w - r, y + r, -90],
    [x + w - r, y + d - r, 0],
    [x + r, y + d - r, 90],
    [x + r, y + r, 180],
  ];
  const out: Vec2[] = [];
  for (const [cx, cy, a0] of corners) {
    for (let s = 0; s <= steps; s++) {
      const a = ((a0 + (90 * s) / steps) * Math.PI) / 180;
      out.push(at([cx + r * Math.cos(a), cy + r * Math.sin(a), z]));
    }
  }
  return "M" + out.map(([px, py]) => `${f1(px)} ${f1(py)}`).join("L") + "Z";
}

/** Ring cells around a 3x3 centre (cells -1..1): ring r spans -(r+1)..r+1. */
export function ringCells(r: number): Vec2[] {
  const a = -(r + 1);
  const b = r + 1;
  const out: Vec2[] = [];
  for (let i = a; i <= b; i++) out.push([i, a]);
  for (let j = a + 1; j <= b; j++) out.push([b, j]);
  for (let i = b - 1; i >= a; i--) out.push([i, b]);
  for (let j = b - 1; j > a; j--) out.push([a, j]);
  return out;
}

export function convexHull(P: Vec2[]): Vec2[] {
  const p = [...P].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: Vec2, a: Vec2, b: Vec2) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Vec2[] = [];
  const up: Vec2[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (const q of p.reverse()) {
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** Separating-axis test for two convex polygons. */
export function convexOverlap(A2: Vec2[], B2: Vec2[]): boolean {
  for (const P of [A2, B2]) {
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      const q = P[(i + 1) % P.length];
      const nx = q[1] - p[1];
      const ny = p[0] - q[0];
      let a0 = Infinity;
      let a1 = -Infinity;
      let b0 = Infinity;
      let b1 = -Infinity;
      for (const r of A2) {
        const v = r[0] * nx + r[1] * ny;
        a0 = Math.min(a0, v);
        a1 = Math.max(a1, v);
      }
      for (const r of B2) {
        const v = r[0] * nx + r[1] * ny;
        b0 = Math.min(b0, v);
        b1 = Math.max(b1, v);
      }
      if (a1 < b0 || b1 < a0) return false;
    }
  }
  return true;
}
