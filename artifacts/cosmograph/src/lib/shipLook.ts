// Procedural per-cosmonaut ship variety. Every explorer's ship look is derived
// deterministically from a seed (a peer's stable presence id, or the viewer's
// own persisted seed) so each cosmonaut reads as a distinct craft without any
// extra data crossing the wire. The palettes are hand-tuned so every random
// draw still looks like a believable sci-fi hull rather than a noisy hue.

export interface ShipLook {
  /** Overall hull tint — multiplied over the model's baked texture atlas. */
  hull: string;
  /** Accent color for glow-tinted procedural parts (fins/pods running lights). */
  glow: string;
  /** Nose running-light accent color (front sprite). */
  accent: string;
  /** Size multiplier, ~0.82..1.24, so ships vary subtly in mass. */
  scale: number;
}

// Light, muted metallics — kept bright so multiplying the texture never darkens
// the ship into a muddy blob.
const HULLS = [
  "#aebfd6",
  "#c9bca0",
  "#b6a6c9",
  "#9ec9c0",
  "#c9a6a6",
  "#a9c0a6",
  "#b0b6c2",
  "#cbc3d2",
];

const GLOWS = [
  "#6ec6ff",
  "#8affc1",
  "#ffd27a",
  "#c79bff",
  "#7affff",
  "#ff8f8f",
  "#aaff7a",
  "#9ec5ff",
];

const ACCENTS = [
  "#ff4d4d",
  "#4dff9e",
  "#ffd24d",
  "#4dd2ff",
  "#ff4dd2",
  "#9eff4d",
  "#4d6bff",
  "#ff924d",
];

// FNV-1a — stable, fast, well-distributed across short ids.
function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function shipLookFromSeed(seed: string): ShipLook {
  const h = hash32(seed);
  return {
    hull: HULLS[h % HULLS.length],
    glow: GLOWS[(h >>> 3) % GLOWS.length],
    accent: ACCENTS[(h >>> 7) % ACCENTS.length],
    scale: 0.82 + (((h >>> 11) % 100) / 100) * 0.42,
  };
}

const SELF_SEED_KEY = "cosmograph.shipSeed";

// The viewer's own ship seed is persisted per-browser so "your ship" stays the
// same across visits even before sign-in. Once accounts can save a ship, the
// stored seed/config simply overrides this local default.
export function getSelfSeed(): string {
  try {
    let s = localStorage.getItem(SELF_SEED_KEY);
    if (!s) {
      s = randomSeed();
      localStorage.setItem(SELF_SEED_KEY, s);
    }
    return s;
  } catch {
    return "self";
  }
}

// Persist a new local default seed. Used when shuffling to a new look, or when a
// signed-in account's saved seed is loaded so it sticks on this browser too.
export function setSelfSeed(seed: string): void {
  try {
    localStorage.setItem(SELF_SEED_KEY, seed);
  } catch {
    // ignore (private mode / storage disabled)
  }
}

// A fresh random ship seed (short alphanumeric, matching the server's sanitize).
export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

const SELF_TYPE_KEY = "cosmograph.shipType";

// The viewer's equipped ship TYPE id, persisted per-browser so it sticks across
// visits before sign-in (defaults to the free "scout"). A signed-in account's
// saved type overrides this local default once loaded.
export function getSelfType(): string {
  try {
    return localStorage.getItem(SELF_TYPE_KEY) || "scout";
  } catch {
    return "scout";
  }
}

export function setSelfType(typeId: string): void {
  try {
    localStorage.setItem(SELF_TYPE_KEY, typeId);
  } catch {
    // ignore (private mode / storage disabled)
  }
}
