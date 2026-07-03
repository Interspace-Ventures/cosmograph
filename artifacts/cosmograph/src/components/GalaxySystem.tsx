import React, { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import {
  galaxyData,
  papersByDomain,
  isFiltersActive,
  paperMatchesFilters,
} from "@/data/galaxy";
import { getStellarColor } from "@/lib/colors";
import { useAppState } from "@/lib/store";

const TEX = (f: string) => `${import.meta.env.BASE_URL}textures/${f}`;

const PLANET_TEXTURES = [
  "mercurymap.jpg",
  "venusmap.jpg",
  "earth_atmos_2048.jpg",
  "marsmap1k.jpg",
  "jupitermap.jpg",
  "saturnmap.jpg",
  "uranusmap.jpg",
  "neptunemap.jpg",
  "plutomap1k.jpg",
];
const EARTH_IDX = 2;
const SATURN_IDX = 5;
const URANUS_IDX = 6;
const NEPTUNE_IDX = 7;

// The nine real solar-system maps skew muted grey/tan, so at a glance the galaxy
// reads as only "red / off-white / blue". To widen the palette we synthesize a
// set of vivid-but-plausible exoplanet "biomes" on a canvas (deterministic,
// headless-safe — same approach as gasGiantTexture): molten, frozen, verdant,
// desert, ocean, carbon, and exotic-hued gas giants.
type ProcPlanet =
  | { kind: "gas"; palette: string[]; seed: number }
  | {
      kind: "terran";
      ocean: string;
      land: string[];
      cap?: string;
      seed: number;
    }
  | { kind: "lava"; seed: number };

const PROC_PLANETS: ProcPlanet[] = [
  // molten / basalt world with glowing magma veins
  { kind: "lava", seed: 211 },
  // verdant Earth-like — green continents, deep-blue ocean, ice caps
  {
    kind: "terran",
    ocean: "#0c3b63",
    land: ["#15663f", "#239b57", "#36b56e"],
    cap: "#eaf6ff",
    seed: 17,
  },
  // amber desert world
  {
    kind: "terran",
    ocean: "#6e3410",
    land: ["#b06a25", "#d7984a", "#ecc684"],
    cap: "#f4e3c4",
    seed: 29,
  },
  // turquoise ocean world
  {
    kind: "terran",
    ocean: "#06304f",
    land: ["#0e8a8c", "#19c2b4", "#7df0db"],
    cap: "#f0ffff",
    seed: 41,
  },
  // frozen ice world
  {
    kind: "terran",
    ocean: "#6fa9cf",
    land: ["#cfeefb", "#eef9ff", "#a9d6ee"],
    cap: "#ffffff",
    seed: 59,
  },
  // violet gas giant
  {
    kind: "gas",
    palette: ["#caa9ff", "#9b78ee", "#dccaff", "#7d54d6", "#b79bff"],
    seed: 83,
  },
  // rose gas giant
  {
    kind: "gas",
    palette: ["#ff9ec4", "#e85f9c", "#ffc6dd", "#c63f82", "#ff86ba"],
    seed: 97,
  },
  // emerald gas giant
  {
    kind: "gas",
    palette: ["#b6f2c0", "#5fcf86", "#dafbe0", "#37a865", "#8fe6a6"],
    seed: 109,
  },
  // carbon / obsidian rock world
  {
    kind: "terran",
    ocean: "#241f26",
    land: ["#46414c", "#6b6675", "#9a96a6"],
    seed: 127,
  },
];

const REAL_PLANET_COUNT = PLANET_TEXTURES.length;
const PLANET_TYPE_COUNT = REAL_PLANET_COUNT + PROC_PLANETS.length;
const LAVA_IDX = REAL_PLANET_COUNT; // first procedural slot
const LAVA_EMISSIVE = new THREE.Color("#ffd9b0");

// Rocky bodies get fake relief by reusing the colour map as a bump map.
const ROCKY = new Set([0, 1, 3, 8]);
// Gas giants stay smooth (atmospheric banding, no terrain).
const GAS = new Set([4, 5, 6, 7]);
// Classify the procedural biomes so bump/relief still applies: gas giants stay
// in GAS, everything terrestrial (terran + lava) gets rocky relief.
PROC_PLANETS.forEach((p, i) => {
  (p.kind === "gas" ? GAS : ROCKY).add(REAL_PLANET_COUNT + i);
});

// deterministic rng
const mulberry32 = (a: number) => () => {
  let t = (a += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
function hashString(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++)
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  return hash;
}

// Soft radial glow sprite for the stellar halo (canvas, runs in-browser).
let _glowTex: THREE.Texture | null = null;
function glowTexture(): THREE.Texture | null {
  if (_glowTex) return _glowTex;
  if (typeof document === "undefined") return null;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(255,255,255,0.7)");
  g.addColorStop(0.4, "rgba(255,244,214,0.28)");
  g.addColorStop(0.75, "rgba(255,238,200,0.06)");
  g.addColorStop(1, "rgba(255,238,200,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  _glowTex = t;
  return t;
}

// Real Uranus/Neptune photos are nearly featureless, so the shipped maps read as
// flat untextured spheres. We synthesize banded gas-giant detail deterministically
// on a canvas (no GLSL, headless-safe) so every planet visibly reads as textured.
function gasGiantTexture(
  palette: string[],
  seed: number,
): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const w = 1024;
  const h = 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const rng = mulberry32(seed);

  // Base vertical gradient through the palette.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  palette.forEach((col, i) => g.addColorStop(i / (palette.length - 1), col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Wavy latitudinal bands (alternating lighten/darken) for atmospheric flow.
  const nBands = 28;
  for (let b = 0; b < nBands; b++) {
    const yc = (b / nBands) * h + (rng() - 0.5) * 6;
    const bh = (h / nBands) * (0.55 + rng() * 1.0);
    const lighten = rng() > 0.5;
    ctx.globalAlpha = 0.12 + rng() * 0.2;
    ctx.fillStyle = lighten ? "rgb(255,255,255)" : "rgb(0,0,0)";
    const amp = 3 + rng() * 9;
    const freq = 1 + rng() * 3;
    const phase = rng() * Math.PI * 2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const yy = yc + Math.sin((x / w) * Math.PI * 2 * freq + phase) * amp;
      x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
    }
    for (let x = w; x >= 0; x -= 8) {
      const yy =
        yc + bh + Math.sin((x / w) * Math.PI * 2 * freq + phase + 1.3) * amp;
      ctx.lineTo(x, yy);
    }
    ctx.closePath();
    ctx.fill();
  }

  // A few oval storms for life.
  const storms = 3 + Math.floor(rng() * 3);
  for (let s = 0; s < storms; s++) {
    const sx = rng() * w;
    const sy = h * (0.28 + rng() * 0.44);
    const rx = 16 + rng() * 42;
    const ry = 7 + rng() * 15;
    ctx.globalAlpha = 0.2 + rng() * 0.22;
    ctx.fillStyle = rng() > 0.5 ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Terrestrial world: a base "ocean" colour with irregular continent blobs in the
// land palette, terrain speckle, and optional polar ice caps. Driving it purely
// by palette lets one routine paint verdant, desert, turquoise-ocean, frozen, and
// carbon worlds — far more hue variety than the muted real photos.
function terranTexture(
  spec: { ocean: string; land: string[]; cap?: string },
  seed: number,
): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const w = 1024;
  const h = 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const rng = mulberry32(seed);

  ctx.fillStyle = spec.ocean;
  ctx.fillRect(0, 0, w, h);

  // Subtle depth variation in the base layer.
  for (let i = 0; i < 60; i++) {
    ctx.globalAlpha = 0.04 + rng() * 0.05;
    ctx.fillStyle = rng() > 0.5 ? "#000000" : "#ffffff";
    const x = rng() * w;
    const y = rng() * h;
    const r = 30 + rng() * 120;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Continents: clusters of overlapping ellipses in the land palette.
  const continents = 7 + Math.floor(rng() * 6);
  for (let i = 0; i < continents; i++) {
    const baseX = rng() * w;
    const baseY = h * (0.15 + rng() * 0.7);
    const col = spec.land[Math.floor(rng() * spec.land.length)];
    const blobs = 14 + Math.floor(rng() * 20);
    for (let b = 0; b < blobs; b++) {
      ctx.globalAlpha = 0.5 + rng() * 0.4;
      ctx.fillStyle = col;
      const x = baseX + (rng() - 0.5) * 200;
      const y = baseY + (rng() - 0.5) * 110;
      const rx = 12 + rng() * 46;
      const ry = 10 + rng() * 34;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Fine terrain speckle for texture.
  for (let i = 0; i < 1400; i++) {
    const x = rng() * w;
    const y = rng() * h;
    ctx.globalAlpha = 0.05 + rng() * 0.08;
    ctx.fillStyle = rng() > 0.5 ? "#ffffff" : "#000000";
    ctx.fillRect(x, y, 1.6, 1.6);
  }

  // Polar ice caps fading toward the equator.
  if (spec.cap) {
    const capH = h * (0.06 + rng() * 0.05) * 1.8;
    const gTop = ctx.createLinearGradient(0, 0, 0, capH);
    gTop.addColorStop(0, spec.cap);
    gTop.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalAlpha = 1;
    ctx.fillStyle = gTop;
    ctx.fillRect(0, 0, w, capH);
    const gBot = ctx.createLinearGradient(0, h - capH, 0, h);
    gBot.addColorStop(0, "rgba(255,255,255,0)");
    gBot.addColorStop(1, spec.cap);
    ctx.fillStyle = gBot;
    ctx.fillRect(0, h - capH, w, capH);
  }

  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Molten world: dark basalt base, cooled crust plates, branching glowing magma
// veins, and a few bright hot pools. Used as both the colour map and (via the
// material's emissiveMap) a self-illumination map so the veins actually glow.
function lavaTexture(seed: number): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const w = 1024;
  const h = 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const rng = mulberry32(seed);

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#1b0f10");
  g.addColorStop(0.5, "#2a1213");
  g.addColorStop(1, "#160a0b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Cooled crust plates.
  for (let i = 0; i < 70; i++) {
    ctx.globalAlpha = 0.15 + rng() * 0.2;
    ctx.fillStyle = rng() > 0.5 ? "#000000" : "#3a2422";
    const x = rng() * w;
    const y = rng() * h;
    const r = 18 + rng() * 70;
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      r,
      r * (0.5 + rng() * 0.6),
      rng() * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  // Branching magma veins.
  for (let v = 0; v < 26; v++) {
    let x = rng() * w;
    let y = rng() * h;
    const steps = 18 + Math.floor(rng() * 30);
    ctx.strokeStyle = rng() > 0.5 ? "#ffd24a" : "#ff6a1f";
    ctx.globalAlpha = 0.5 + rng() * 0.4;
    ctx.lineWidth = 1 + rng() * 2.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    let ang = rng() * Math.PI * 2;
    for (let s = 0; s < steps; s++) {
      ang += (rng() - 0.5) * 1.0;
      x += Math.cos(ang) * (6 + rng() * 10);
      y += Math.sin(ang) * (6 + rng() * 10);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Bright hot pools.
  for (let i = 0; i < 16; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 6 + rng() * 22;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, "rgba(255,240,170,0.95)");
    rg.addColorStop(0.4, "rgba(255,120,30,0.6)");
    rg.addColorStop(1, "rgba(255,80,20,0)");
    ctx.globalAlpha = 1;
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// The shipped sunmap.jpg is a flat orange photo, so each sun reads as a plain
// bright orb and its warm tint fights the per-domain stellar colour. We instead
// synthesize a NEUTRAL luminance map of convective granulation + a few sunspots
// on a canvas (no GLSL, headless-safe, shared by every sun). Because it's neutral
// grey-white, the per-domain emissive colour still tints each sun cleanly while
// the surface now shows boiling granule cells instead of a featureless disc.
let _sunSurfaceTex: THREE.Texture | null = null;
function sunSurfaceTexture(): THREE.Texture | null {
  if (_sunSurfaceTex) return _sunSurfaceTex;
  if (typeof document === "undefined") return null;
  const w = 1024;
  const h = 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const rng = mulberry32(20260624);

  // Bright near-white base so the multiply by per-domain colour stays luminous.
  ctx.fillStyle = "rgb(214,214,214)";
  ctx.fillRect(0, 0, w, h);

  const blob = (x: number, y: number, r: number, col: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // Wrap blobs across the seam so granulation tiles around the sphere.
  const wrapBlob = (x: number, y: number, r: number, col: string) => {
    blob(x, y, r, col);
    if (x < 28) blob(x + w, y, r, col);
    else if (x > w - 28) blob(x - w, y, r, col);
  };

  // Hot granule centres (additive so cells glow brighter than the base).
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 2600; i++) {
    const a = (0.18 + rng() * 0.22).toFixed(3);
    wrapBlob(rng() * w, rng() * h, 4 + rng() * 11, `rgba(255,255,255,${a})`);
  }
  // Darker intergranular network between the cells.
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < 1500; i++) {
    const a = (0.1 + rng() * 0.16).toFixed(3);
    wrapBlob(rng() * w, rng() * h, 2 + rng() * 5, `rgba(0,0,0,${a})`);
  }
  // A handful of sunspots: dark umbra inside a softer penumbra.
  const spots = 4 + Math.floor(rng() * 4);
  for (let s = 0; s < spots; s++) {
    const sx = rng() * w;
    const sy = h * (0.22 + rng() * 0.56);
    const r = 12 + rng() * 24;
    wrapBlob(sx, sy, r * 1.9, "rgba(0,0,0,0.45)");
    wrapBlob(sx, sy, r, "rgba(0,0,0,0.82)");
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  _sunSurfaceTex = t;
  return t;
}

// THREE's RingGeometry maps a texture as a flat square the annulus is cut from,
// so the shipped saturnringcolor.jpg ends up smeared into a "weird texture in a
// ring shape". We instead bake a 1-D radial strip (inner edge → outer edge) of
// many fine ringlets, real gaps (incl. the Cassini division) carried in the
// alpha channel, and a slow cool↔warm colour drift. Paired with the radial UV
// remap in <SaturnRings>, the strip becomes concentric ringlets the right way.
let _ringStripTex: THREE.Texture | null = null;
function saturnRingTexture(): THREE.Texture | null {
  if (_ringStripTex) return _ringStripTex;
  if (typeof document === "undefined") return null;
  const w = 1024;
  const h = 8;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const rng = mulberry32(990077);
  const img = ctx.createImageData(w, h);
  const cool = [206, 214, 226];
  const warm = [198, 172, 132];
  // [centre, halfWidth, depth] along the inner→outer axis (0..1).
  const gaps: Array<[number, number, number]> = [
    [0.08, 0.012, 0.85],
    [0.31, 0.01, 0.55],
    [0.55, 0.032, 0.96], // Cassini division
    [0.63, 0.008, 0.5],
    [0.79, 0.013, 0.7],
  ];
  for (let x = 0; x < w; x++) {
    const f = x / (w - 1);
    let bright =
      0.56 +
      0.18 * Math.sin(f * 140 + 0.5) +
      0.12 * Math.sin(f * 330 + 1.7) +
      0.08 * Math.sin(f * 68 + 3.1) +
      (rng() - 0.5) * 0.12;
    let alpha =
      0.86 + 0.12 * Math.sin(f * 110 + 2) + 0.08 * Math.sin(f * 260 + 0.4);
    const mix = 0.5 + 0.5 * Math.sin(f * 18 + 1);
    for (const [gc, gw, gd] of gaps) {
      const d = Math.abs(f - gc) / gw;
      if (d < 1) {
        const k = (1 - d) * gd;
        alpha *= 1 - k;
        bright *= 1 - k * 0.5;
      }
    }
    // Fade both edges so the ring doesn't end on a hard rim.
    alpha *= Math.min(1, f / 0.05) * Math.min(1, (1 - f) / 0.04);
    bright = Math.max(0, Math.min(1, bright));
    alpha = Math.max(0, Math.min(1, alpha));
    const r = (cool[0] * (1 - mix) + warm[0] * mix) * bright;
    const g = (cool[1] * (1 - mix) + warm[1] * mix) * bright;
    const b = (cool[2] * (1 - mix) + warm[2] * mix) * bright;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = alpha * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  _ringStripTex = t;
  return t;
}

export interface OrbitParams {
  a: number;
  e: number;
  incl: number;
  node: number;
  initialAngle: number;
  speed: number;
  spin: number;
  spinPhase: number;
  axialTilt: number;
  planetRadius: number;
  texIndex: number;
}

export const domainPositions: Record<string, THREE.Vector3> = {};
export const sunRadii: Record<string, number> = {};
export const planetOrbits: Record<string, OrbitParams> = {};
export const planetRefs: Record<string, THREE.Object3D> = {};
export const sunRefs: Record<string, THREE.Object3D> = {};

// ----- galaxy distribution + planetary orbits (deterministic, per dataset) -----
// Domains are grouped into clusters by their broad research field, so two suns
// being near each other genuinely means "related science". Clusters are packed
// by each system's FULL orbital footprint (sun + the radius its planets orbit
// out to), not just sun size, so no two systems overlap and the map stays
// legible — like a word cloud built from solar systems.
type Dom = (typeof galaxyData.domains)[number];

const GAP_IN = 55; // padding between systems inside one field cluster
const GAP_CL = 130; // padding between field clusters

const sunRadiusFor = (paperCount: number) =>
  Math.max(8, Math.sqrt(paperCount) * 2.6);
// Full radius a domain's system occupies: sun + outermost planet orbit + margin.
const domainSpan = (d: Dom) => {
  const n = papersByDomain[d.id]?.length ?? d.paperCount;
  const innerR = sunRadiusFor(d.paperCount) + 14;
  const targetOuter = innerR + 50 + 13 * Math.sqrt(Math.max(1, n));
  return targetOuter + 25;
};

// The journey route is rebuilt alongside the layout; mutable so a dataset swap
// can replace it. Consumers read it as an ES-module live binding.
export let waypointRoute: string[] = [];

// Recompute the entire 3D layout for the ACTIVE dataset (galaxyData). Runs once
// at module load and again after applyDataset() swaps in a new scientist, so the
// suns/planets/route always match the current data. Clears prior singletons (and
// stale mesh refs) first so nothing from the previous dataset lingers.
export function rebuildLayout(): void {
  for (const k of Object.keys(domainPositions)) delete domainPositions[k];
  for (const k of Object.keys(sunRadii)) delete sunRadii[k];
  for (const k of Object.keys(planetOrbits)) delete planetOrbits[k];
  for (const k of Object.keys(planetRefs)) delete planetRefs[k];
  for (const k of Object.keys(sunRefs)) delete sunRefs[k];

  // Group domains by field.
  const fieldGroups = new Map<string, Dom[]>();
  for (const d of galaxyData.domains) {
    const arr = fieldGroups.get(d.field) ?? [];
    arr.push(d);
    fieldGroups.set(d.field, arr);
  }

  // Build each field cluster: largest system at its centre, the rest ringed
  // around it, spaced so no two orbital systems touch.
  const clusters = [...fieldGroups.entries()].map(([field, domsRaw]) => {
    const doms = [...domsRaw].sort((a, b) => domainSpan(b) - domainSpan(a));
    const spans = doms.map(domainSpan);
    const locals: Array<{ d: Dom; lx: number; lz: number }> = [
      { d: doms[0], lx: 0, lz: 0 },
    ];
    let footprint = spans[0];
    if (doms.length > 1) {
      const others = spans.slice(1);
      const maxRo = Math.max(...others);
      const m = others.length;
      const rho1 = spans[0] + maxRo + GAP_IN; // clear the centre system
      const rho2 = m > 1 ? (maxRo + GAP_IN / 2) / Math.sin(Math.PI / m) : 0; // clear neighbours
      const rho = Math.max(rho1, rho2);
      for (let k = 0; k < m; k++) {
        const a = (k * 2 * Math.PI) / m + 0.4;
        locals.push({
          d: doms[k + 1],
          lx: Math.cos(a) * rho,
          lz: Math.sin(a) * rho,
        });
      }
      footprint = rho + maxRo;
    }
    return { field, locals, footprint };
  });

  // Largest cluster anchors the galactic core; remaining clusters ring around
  // it, spaced so clusters don't overlap either.
  clusters.sort((a, b) => b.footprint - a.footprint);
  const clusterCenters: Array<[number, number]> = [[0, 0]];
  const ringClusters = clusters.slice(1);
  if (ringClusters.length > 0) {
    const maxOuterFp = Math.max(...ringClusters.map((c) => c.footprint));
    const M = ringClusters.length;
    const RR1 = clusters[0].footprint + maxOuterFp + GAP_CL; // clear the core cluster
    const RR2 = M > 1 ? (maxOuterFp + GAP_CL / 2) / Math.sin(Math.PI / M) : 0; // clear neighbours
    const RR = Math.max(RR1, RR2);
    for (let j = 0; j < M; j++) {
      const a = (j * 2 * Math.PI) / M + 0.7;
      clusterCenters.push([Math.cos(a) * RR, Math.sin(a) * RR]);
    }
  }

  clusters.forEach((c, ci) => {
    const [cx, cz] = clusterCenters[ci];
    for (const { d, lx, lz } of c.locals) {
      const rng = mulberry32(hashString(d.id));
      const y = (rng() - 0.5) * 60; // gentle vertical scatter for depth
      domainPositions[d.id] = new THREE.Vector3(cx + lx, y, cz + lz);
    }
  });

  galaxyData.domains.forEach((d) => {
    // Sun size encodes the breadth of the body of work in that domain — i.e. how
    // many papers orbit it — rather than citation count.
    const sunRadius = sunRadiusFor(d.paperCount);
    sunRadii[d.id] = sunRadius;

    const papers = [...(papersByDomain[d.id] || [])].sort(
      (a, b) => b.relevance - a.relevance,
    );
    const n = papers.length;
    const innerR = sunRadius + 14;
    const targetOuter = innerR + 50 + 13 * Math.sqrt(Math.max(1, n));

    papers.forEach((p, k) => {
      const prng = mulberry32(hashString(p.id));
      const f = n > 1 ? Math.pow(k / (n - 1), 0.82) : 0;
      const a = innerR + (targetOuter - innerR) * f + (prng() - 0.5) * 3;
      const e = 0.02 + prng() * 0.12;
      const incl = (prng() - 0.5) * 0.5;
      const node = prng() * Math.PI * 2;
      const initialAngle = prng() * Math.PI * 2;
      const speed = (0.4 + prng() * 0.5) / Math.sqrt(a);
      // Per-planet spin so same-type planets aren't synchronized clones: a random
      // start phase, a varied (mostly prograde) spin rate, and an axial tilt that
      // also tips any rings off the shared flat plane.
      const spinPhase = prng() * Math.PI * 2;
      const spin = (0.14 + prng() * 0.34) * (prng() < 0.2 ? -1 : 1);
      const axialTilt = (prng() - 0.5) * 0.6;
      const planetRadius = Math.min(
        8,
        Math.max(1.2, Math.sqrt(p.citations) * 0.16 + 1.2),
      );
      const texIndex = Math.abs(hashString(p.id)) % PLANET_TYPE_COUNT;
      planetOrbits[p.id] = {
        a,
        e,
        incl,
        node,
        initialAngle,
        speed,
        spin,
        spinPhase,
        axialTilt,
        planetRadius,
        texIndex,
      };
    });
  });

  // Waypoint journey route: a faint guided path threading the suns into one
  // continuous nearest-neighbour walk (proximity == relatedness), doubling as a
  // line to follow when flying. Rebuilt from the fresh sun positions above.
  const ids = galaxyData.domains
    .map((d) => d.id)
    .filter((id) => domainPositions[id]);
  if (ids.length <= 1) {
    waypointRoute = ids;
    return;
  }
  const remaining = new Set(ids);
  let current = ids[0];
  let best = Infinity;
  for (const id of ids) {
    const d = domainPositions[id].lengthSq();
    if (d < best) {
      best = d;
      current = id;
    }
  }
  const order: string[] = [current];
  remaining.delete(current);
  while (remaining.size > 0) {
    const from = domainPositions[current];
    let next = "";
    let nd = Infinity;
    for (const id of remaining) {
      const d = from.distanceToSquared(domainPositions[id]);
      if (d < nd) {
        nd = d;
        next = id;
      }
    }
    order.push(next);
    remaining.delete(next);
    current = next;
  }
  waypointRoute = order;
}

// Initialize the layout for the baked default dataset at module load.
rebuildLayout();

function ellipseR(a: number, e: number, theta: number) {
  return (a * (1 - e * e)) / (1 + e * Math.cos(theta));
}

const WAYPOINT_COLOR = new THREE.Color("#a388ee");

// The journey line is a navigation aid (not a celestial body), so it carries the
// single UI accent rather than a stellar colour — faint in orbit, a touch
// brighter while flying so it reads as a route to follow.
function WaypointPath() {
  const { cameraMode } = useAppState();

  const line = useMemo(() => {
    const pts = waypointRoute.map((id) => domainPositions[id]).filter(Boolean);
    if (pts.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.4);
    const samples = curve.getPoints(Math.max(64, pts.length * 16));
    const geo = new THREE.BufferGeometry().setFromPoints(samples);
    const mat = new THREE.LineDashedMaterial({
      color: WAYPOINT_COLOR,
      transparent: true,
      opacity: 0.2,
      dashSize: 24,
      gapSize: 18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const l = new THREE.Line(geo, mat);
    l.computeLineDistances();
    return l;
  }, []);

  const targetOpacity = cameraMode === "spaceship" ? 0.5 : 0.18;
  useFrame((s, d) => {
    const mat = line?.material as THREE.LineDashedMaterial | undefined;
    if (!mat) return;
    const pulse = 0.04 * Math.sin(s.clock.elapsedTime * 1.4);
    mat.opacity += (targetOpacity + pulse - mat.opacity) * Math.min(1, d * 2);
  });

  if (!line) return null;
  return <primitive object={line} />;
}

export function GalaxySystem() {
  const {
    galaxyTilt,
    selectedObject,
    setHoveredObject,
    setSelectedObject,
    filters,
  } = useAppState();

  const filtersActive = isFiltersActive(filters);

  const matchingIds = useMemo(() => {
    if (!filtersActive) return null;
    const s = new Set<string>();
    for (const p of galaxyData.papers) {
      if (paperMatchesFilters(p, filters)) s.add(p.id);
    }
    return s;
  }, [filters, filtersActive]);

  const planetTex = useTexture(PLANET_TEXTURES.map(TEX));
  const extra = useTexture({
    earthNormal: TEX("earth_normal_2048.jpg"),
    earthClouds: TEX("earth_clouds_1024.png"),
    sun: TEX("sunmap.jpg"),
    moon: TEX("moon_1024.jpg"),
    ring: TEX("saturnringcolor.jpg"),
  });

  useMemo(() => {
    // Colour maps must be sRGB; data maps (normals) must stay linear.
    [
      ...planetTex,
      extra.sun,
      extra.ring,
      extra.moon,
      extra.earthClouds,
    ].forEach((t) => {
      if (t) t.colorSpace = THREE.SRGBColorSpace;
    });
    if (extra.earthNormal) extra.earthNormal.colorSpace = THREE.NoColorSpace;
  }, [planetTex, extra]);

  // Procedural, headless-safe replacements (fall back to the shipped photos if a
  // canvas isn't available): a granulated neutral sun surface and a radially-banded
  // ring strip. Both read far more "tangible" than the flat shipped textures.
  const sunTexFinal = useMemo(
    () => sunSurfaceTexture() ?? extra.sun,
    [extra.sun],
  );
  const ringTexFinal = useMemo(
    () => saturnRingTexture() ?? extra.ring,
    [extra.ring],
  );

  // Swap the near-blank Uranus/Neptune maps for richly banded procedural ones so
  // every planet shows surface detail (the shipped photos are nearly featureless).
  const planetTexFinal = useMemo(() => {
    const arr = [...planetTex];
    const uranus = gasGiantTexture(
      ["#d6f0f4", "#a9dde6", "#dcf2f5", "#9ed3dd", "#c2eaef"],
      71,
    );
    const neptune = gasGiantTexture(
      ["#4f7ce4", "#2f5bc4", "#5d88ec", "#23459e", "#3e6cd6"],
      131,
    );
    if (uranus) arr[URANUS_IDX] = uranus;
    if (neptune) arr[NEPTUNE_IDX] = neptune;
    // Append the procedural exoplanet biomes (indices REAL_PLANET_COUNT..).
    // Fall back to a real map if a canvas isn't available so indices stay aligned.
    for (const spec of PROC_PLANETS) {
      let t: THREE.Texture | null = null;
      if (spec.kind === "gas") t = gasGiantTexture(spec.palette, spec.seed);
      else if (spec.kind === "lava") t = lavaTexture(spec.seed);
      else t = terranTexture(spec, spec.seed);
      arr.push(t ?? planetTex[0]);
    }
    return arr;
  }, [planetTex]);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    for (const id in planetRefs) {
      const ref = planetRefs[id];
      const o = planetOrbits[id];
      if (!ref || !o) continue;
      const theta = o.initialAngle + time * o.speed;
      const r = ellipseR(o.a, o.e, theta);
      ref.position.set(Math.cos(theta) * r, 0, Math.sin(theta) * r);
      // Absolute (not accumulated) so each planet's phase + rate stays distinct.
      ref.rotation.y = o.spinPhase + time * o.spin;
    }
  });

  return (
    <group rotation-x={galaxyTilt}>
      <WaypointPath />
      {galaxyData.domains.map((domain, i) => (
        <SolarSystem
          key={domain.id}
          domainId={domain.id}
          domainName={domain.name}
          index={i}
          position={domainPositions[domain.id]}
          sunRadius={sunRadii[domain.id]}
          sunTex={sunTexFinal}
          planetTex={planetTexFinal}
          earthNormalTex={extra.earthNormal}
          earthCloudsTex={extra.earthClouds}
          moonTex={extra.moon}
          ringTex={ringTexFinal}
          selectedObject={selectedObject}
          setHoveredObject={setHoveredObject}
          setSelectedObject={setSelectedObject}
          filtersActive={filtersActive}
          matchingIds={matchingIds}
        />
      ))}
    </group>
  );
}

interface SolarSystemProps {
  domainId: string;
  domainName: string;
  index: number;
  position: THREE.Vector3;
  sunRadius: number;
  sunTex: THREE.Texture;
  planetTex: THREE.Texture[];
  earthNormalTex: THREE.Texture;
  earthCloudsTex: THREE.Texture;
  moonTex: THREE.Texture;
  ringTex: THREE.Texture;
  selectedObject: { type: string; id: string } | null;
  setHoveredObject: (o: any) => void;
  setSelectedObject: (o: any) => void;
  filtersActive: boolean;
  matchingIds: Set<string> | null;
}

// All of a domain's orbit rings merged into ONE lineSegments draw call. They
// used to be one LineLoop per planet (~1 draw call + raycast target per paper);
// merging cuts hundreds of draw calls to one per sun, and disabling raycast
// stops every mouse-move from hit-testing hundreds of line strips. The rings
// are static per layout (ellipse shape + inclination never animate), so the
// merged geometry only rebuilds when the paper set changes (dataset swap).
const OrbitLines = React.memo(function OrbitLines({
  paperIds,
}: {
  paperIds: string[];
}) {
  const geometry = useMemo(() => {
    const SEG = 96;
    const euler = new THREE.Euler();
    const v = new THREE.Vector3();
    const positions = new Float32Array(paperIds.length * SEG * 2 * 3);
    let ptr = 0;
    for (const id of paperIds) {
      const o = planetOrbits[id];
      if (!o) continue;
      // Match the per-planet group rotation exactly: rotation={[incl, node, 0]}.
      euler.set(o.incl, o.node, 0);
      let fx = 0,
        fy = 0,
        fz = 0,
        px = 0,
        py = 0,
        pz = 0;
      for (let i = 0; i < SEG; i++) {
        const th = (i / SEG) * Math.PI * 2;
        const r = ellipseR(o.a, o.e, th);
        v.set(Math.cos(th) * r, 0, Math.sin(th) * r).applyEuler(euler);
        if (i === 0) {
          fx = v.x;
          fy = v.y;
          fz = v.z;
        } else {
          positions[ptr++] = px;
          positions[ptr++] = py;
          positions[ptr++] = pz;
          positions[ptr++] = v.x;
          positions[ptr++] = v.y;
          positions[ptr++] = v.z;
        }
        px = v.x;
        py = v.y;
        pz = v.z;
      }
      // Close the loop.
      positions[ptr++] = px;
      positions[ptr++] = py;
      positions[ptr++] = pz;
      positions[ptr++] = fx;
      positions[ptr++] = fy;
      positions[ptr++] = fz;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(positions.subarray(0, ptr), 3),
    );
    return geo;
  }, [paperIds]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry} raycast={() => null} frustumCulled={false}>
      <lineBasicMaterial color={0x8b8fa3} transparent opacity={0.13} />
    </lineSegments>
  );
});

const SolarSystem = React.memo(function SolarSystem({
  domainId,
  domainName,
  index,
  position,
  sunRadius,
  sunTex,
  planetTex,
  earthNormalTex,
  earthCloudsTex,
  moonTex,
  ringTex,
  selectedObject,
  setHoveredObject,
  setSelectedObject,
  filtersActive,
  matchingIds,
}: SolarSystemProps) {
  const color = useMemo(() => getStellarColor(index), [index]);
  const papers = papersByDomain[domainId] || [];
  const paperIds = useMemo(() => papers.map((p) => p.id), [papers]);

  const domainHasMatch =
    !filtersActive || !matchingIds || papers.some((p) => matchingIds.has(p.id));
  const sunDimmed = filtersActive && !domainHasMatch;

  return (
    <group
      position={position}
      ref={(el) => {
        if (el) sunRefs[domainId] = el;
      }}
    >
      <Sun
        radius={sunRadius}
        color={color}
        tex={sunTex}
        dimmed={sunDimmed}
        onSelect={() => setSelectedObject({ type: "sun", id: domainId })}
        onOver={() =>
          setHoveredObject({ type: "sun", id: domainId, name: domainName })
        }
        onOut={() => setHoveredObject(null)}
      />
      <OrbitLines paperIds={paperIds} />
      {papers.map((p) => {
        const isSelected =
          selectedObject?.type === "planet" && selectedObject.id === p.id;
        const dimmed =
          filtersActive &&
          !!matchingIds &&
          !matchingIds.has(p.id) &&
          !isSelected;
        const highlighted = filtersActive && !dimmed;
        return (
          <PlanetSystem
            key={p.id}
            paperId={p.id}
            paperTitle={p.title}
            coAuthors={p.coAuthors}
            color={color}
            planetTex={planetTex}
            earthNormalTex={earthNormalTex}
            earthCloudsTex={earthCloudsTex}
            moonTex={moonTex}
            ringTex={ringTex}
            isSelected={isSelected}
            dimmed={dimmed}
            highlighted={highlighted}
            setHoveredObject={setHoveredObject}
            setSelectedObject={setSelectedObject}
          />
        );
      })}
    </group>
  );
});

function Sun({
  radius,
  color,
  tex,
  dimmed,
  onSelect,
  onOver,
  onOut,
}: {
  radius: number;
  color: THREE.Color;
  tex: THREE.Texture;
  dimmed: boolean;
  onSelect: () => void;
  onOver: () => void;
  onOut: () => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const churn = useRef<THREE.Mesh>(null);
  const coreMat = useRef<THREE.MeshStandardMaterial>(null);
  const glow = useMemo(() => glowTexture(), []);
  // Warm-shift the halo toward white-hot so the corona reads as plasma, not flat tint.
  const halo = useMemo(
    () => color.clone().lerp(new THREE.Color("#fff6e6"), 0.45),
    [color],
  );
  const baseIntensity = dimmed ? 0.15 : 1.6;

  useFrame((s, d) => {
    if (ref.current) ref.current.rotation.y += d * 0.02;
    if (churn.current) churn.current.rotation.y -= d * 0.035;
    if (coreMat.current && !dimmed) {
      coreMat.current.emissiveIntensity =
        baseIntensity + Math.sin(s.clock.elapsedTime * 1.3) * 0.18;
    }
  });

  return (
    <group>
      {/* Core */}
      <mesh
        ref={ref}
        onClick={(e) => {
          // Ignore "clicks" that were really drags (orbit pan / fly mouse-look).
          if (e.delta > 8) return;
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onOver();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onOut();
          document.body.style.cursor = "auto";
        }}
      >
        <sphereGeometry args={[radius, 48, 48]} />
        <meshStandardMaterial
          ref={coreMat}
          map={tex}
          emissiveMap={tex}
          emissive={color}
          emissiveIntensity={baseIntensity}
          color={color}
          transparent={dimmed}
          opacity={dimmed ? 0.25 : 1}
          toneMapped={false}
        />
      </mesh>

      {/* Churning plasma shell — counter-rotates for a living surface */}
      {!dimmed && (
        <mesh ref={churn} scale={1.015}>
          <sphereGeometry args={[radius, 32, 32]} />
          <meshBasicMaterial
            map={tex}
            color={halo}
            transparent
            opacity={0.35}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* decay=0 is required: at this scene scale (planets 50-200+ units out)
          any decay >= 1 makes the sun light effectively zero and planets go black. */}
      <pointLight
        color={color}
        intensity={dimmed ? 0.15 : 2.0}
        distance={radius * 140}
        decay={0}
      />

      {/* Inner corona */}
      <mesh scale={1.18}>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshBasicMaterial
          color={halo}
          transparent
          opacity={dimmed ? 0.03 : 0.22}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* Outer corona */}
      {!dimmed && (
        <mesh scale={1.55}>
          <sphereGeometry args={[radius, 32, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.08}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* Billboarded glow halo */}
      {!dimmed && glow && (
        <sprite scale={[radius * 7, radius * 7, 1]}>
          <spriteMaterial
            map={glow}
            color={halo}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            opacity={0.9}
            toneMapped={false}
          />
        </sprite>
      )}
    </group>
  );
}

interface PlanetSystemProps {
  paperId: string;
  paperTitle: string;
  coAuthors: string[];
  color: THREE.Color;
  planetTex: THREE.Texture[];
  earthNormalTex: THREE.Texture;
  earthCloudsTex: THREE.Texture;
  moonTex: THREE.Texture;
  ringTex: THREE.Texture;
  isSelected: boolean;
  dimmed: boolean;
  highlighted: boolean;
  setHoveredObject: (o: any) => void;
  setSelectedObject: (o: any) => void;
}

const PlanetSystem = React.memo(function PlanetSystem({
  paperId,
  paperTitle,
  coAuthors,
  color,
  planetTex,
  earthNormalTex,
  earthCloudsTex,
  moonTex,
  ringTex,
  isSelected,
  dimmed,
  highlighted,
  setHoveredObject,
  setSelectedObject,
}: PlanetSystemProps) {
  const o = planetOrbits[paperId];
  const tex = planetTex[o.texIndex];
  const isSaturn = o.texIndex === SATURN_IDX;
  const isEarth = o.texIndex === EARTH_IDX;
  const isLava = o.texIndex === LAVA_IDX;
  const isRocky = ROCKY.has(o.texIndex);
  const isGas = GAS.has(o.texIndex);

  return (
    <group rotation={[o.incl, o.node, 0]}>
      <mesh
        rotation-x={o.axialTilt}
        ref={(el: THREE.Mesh | null) => {
          if (el) planetRefs[paperId] = el;
        }}
        onClick={(e) => {
          // Ignore "clicks" that were really drags (orbit pan / fly mouse-look).
          if (e.delta > 8) return;
          e.stopPropagation();
          setSelectedObject({ type: "planet", id: paperId });
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHoveredObject({ type: "planet", id: paperId, name: paperTitle });
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHoveredObject(null);
          document.body.style.cursor = "auto";
        }}
      >
        <sphereGeometry args={[o.planetRadius, 20, 20]} />
        <meshStandardMaterial
          map={tex}
          normalMap={isEarth ? earthNormalTex : undefined}
          normalScale={isEarth ? new THREE.Vector2(0.85, 0.85) : undefined}
          bumpMap={isRocky || isGas ? tex : undefined}
          bumpScale={isGas ? 0.05 : isRocky ? 0.04 : 0}
          roughness={isGas ? 0.72 : 0.92}
          metalness={0.0}
          emissive={isLava ? LAVA_EMISSIVE : color}
          emissiveMap={isLava ? tex : undefined}
          emissiveIntensity={
            isLava ? (dimmed ? 0.12 : 0.7) : highlighted ? 0.5 : 0.05
          }
          transparent={dimmed}
          opacity={dimmed ? 0.12 : 1}
        />

        {/* Earth: drifting cloud deck + atmospheric rim */}
        {isEarth && !dimmed && (
          <>
            <CloudLayer tex={earthCloudsTex} radius={o.planetRadius} />
            <mesh scale={1.035}>
              <sphereGeometry args={[o.planetRadius, 20, 20]} />
              <meshBasicMaterial
                color="#5b8bd6"
                transparent
                opacity={0.16}
                side={THREE.BackSide}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          </>
        )}

        {isSaturn && (
          <SaturnRings
            planetRadius={o.planetRadius}
            tex={ringTex}
            dimmed={dimmed}
            seed={paperId}
          />
        )}
        {isSelected &&
          coAuthors.map((a, i) => (
            <Moon
              key={i}
              tex={moonTex}
              index={i}
              total={coAuthors.length}
              planetRadius={o.planetRadius}
              seed={a}
            />
          ))}
      </mesh>
    </group>
  );
});

// Plausible ring tints (icy, golden, dusty, grey, faint rose) so ringed planets
// aren't carbon copies. Multiplied onto the shared ring strip.
const RING_TINTS = ["#efe6d2", "#d8e0ee", "#ead0b4", "#dcd7d0", "#e9d8e6"];

// Saturn-style rings: a RingGeometry whose UVs are remapped so the radial axis
// samples the 1-D ring strip (concentric ringlets), not the default flat-square
// projection. The strip's baked alpha carries the gaps, so the material just
// rides its transparency. Width, roll, tint, and opacity are all seeded per
// planet so two ringed worlds never look identical.
function SaturnRings({
  planetRadius,
  tex,
  dimmed,
  seed,
}: {
  planetRadius: number;
  tex: THREE.Texture;
  dimmed: boolean;
  seed: string;
}) {
  const { geo, tint, baseOpacity, roll } = useMemo(() => {
    const rng = mulberry32(hashString(seed) ^ 0x5a17);
    const inner = planetRadius * (1.26 + rng() * 0.2);
    const outer = inner + planetRadius * (0.7 + rng() * 1.4);
    const g = new THREE.RingGeometry(inner, outer, 128, 1);
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const r = v.length();
      const u = (r - inner) / (outer - inner);
      const ang = (Math.atan2(v.y, v.x) + Math.PI) / (Math.PI * 2);
      uv.setXY(i, u, ang);
    }
    uv.needsUpdate = true;
    return {
      geo: g,
      tint: new THREE.Color(RING_TINTS[Math.floor(rng() * RING_TINTS.length)]),
      baseOpacity: 0.78 + rng() * 0.2,
      roll: (rng() - 0.5) * 0.8,
    };
  }, [planetRadius, seed]);

  useEffect(() => () => geo.dispose(), [geo]);

  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2.3, 0, roll]}>
      <meshBasicMaterial
        map={tex}
        color={tint}
        side={THREE.DoubleSide}
        transparent
        opacity={dimmed ? 0.12 : baseOpacity}
        depthWrite={false}
      />
    </mesh>
  );
}

function CloudLayer({ tex, radius }: { tex: THREE.Texture; radius: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, d) => {
    if (ref.current) ref.current.rotation.y += d * 0.012;
  });
  return (
    <mesh ref={ref} scale={1.012}>
      <sphereGeometry args={[radius, 20, 20]} />
      <meshStandardMaterial
        map={tex}
        transparent
        opacity={0.9}
        depthWrite={false}
        roughness={1}
        metalness={0}
      />
    </mesh>
  );
}

function Moon({
  tex,
  index,
  total,
  planetRadius,
  seed,
}: {
  tex: THREE.Texture;
  index: number;
  total: number;
  planetRadius: number;
  seed: string;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const { dist, speed, init, incl } = useMemo(() => {
    const r = mulberry32(hashString(seed + index));
    return {
      dist: planetRadius + 1.0 + r() * 1.8,
      speed: 0.4 + r() * 1.0,
      init: (index / Math.max(1, total)) * Math.PI * 2 + r(),
      incl: (r() - 0.5) * 0.9,
    };
  }, [index, total, planetRadius, seed]);

  useFrame((s) => {
    if (!ref.current) return;
    const a = init + s.clock.elapsedTime * speed;
    ref.current.position.set(
      Math.cos(a) * dist,
      Math.sin(a) * Math.sin(incl) * dist * 0.5,
      Math.sin(a) * dist,
    );
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[Math.max(0.14, planetRadius * 0.2), 16, 16]} />
      <meshStandardMaterial
        map={tex}
        bumpMap={tex}
        bumpScale={0.02}
        roughness={0.95}
      />
    </mesh>
  );
}
