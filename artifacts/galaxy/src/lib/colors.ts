import * as THREE from "three";

// Realistic stellar colors by temperature class (blue-white -> white -> yellow -> orange -> red).
// Used to tint each domain's "sun" so domains stay distinguishable while looking like real stars.
const stellarColors = [
  "#bcd2ff", // blue-white (O/B)
  "#dfe9ff", // white-blue (A)
  "#ffffff", // white (A/F)
  "#fff6e8", // yellow-white (F/G)
  "#ffe9b8", // warm yellow (G)
  "#ffd98a", // golden (G/K)
  "#ffc06a", // amber (K)
  "#ffac5a", // orange (K)
  "#ff9d6b", // orange-red (K/M)
  "#ff8a5c", // red-orange (M)
  "#d8c4ff", // exotic violet-white
  "#aee1ff", // pale cyan-white
];

export function getStellarColor(index: number): THREE.Color {
  return new THREE.Color(stellarColors[index % stellarColors.length]);
}

export function getStellarColorStr(index: number): string {
  return stellarColors[index % stellarColors.length];
}

// Kept for UI accents that reference a domain's star color (e.g. a small dot/label).
export function getDomainColorStr(index: number): string {
  return stellarColors[index % stellarColors.length];
}
