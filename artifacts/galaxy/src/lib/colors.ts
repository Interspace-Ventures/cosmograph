import * as THREE from 'three';

const domainColors = [
  '#00f0ff', // Cyan
  '#ff0055', // Magenta
  '#7000ff', // Purple
  '#00ff66', // Emerald
  '#ffbb00', // Gold
  '#ff3300', // Orange
  '#0066ff', // Green-blue
  '#cc00ff', // Violet
  '#ff00aa', // Pink
  '#00aaff', // Light blue
  '#aaff00', // Yellow-green
  '#ff5500', // Red-orange
];

export function getDomainColor(index: number): THREE.Color {
  return new THREE.Color(domainColors[index % domainColors.length]);
}

export function getDomainColorStr(index: number): string {
  return domainColors[index % domainColors.length];
}
