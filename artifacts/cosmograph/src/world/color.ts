// Colour helpers for the world view.

export type RGB = [number, number, number];

/** Planet tint: how far an island's glass leans toward its domain accent (luminance kept).
 *  Approved at 30% (a literal 15% luminance-kept mix was invisible). */
export const TINT_S = 0.3;

export const hex2rgb = (h: string): RGB =>
  [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;

export const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

export function hslRgb(h: number, s: number, l: number): RGB {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}

export function tintKeepLum(c: RGB, accent: string, t = TINT_S): RGB {
  const a = hex2rgb(accent);
  const L = lum(c) / Math.max(1e-6, lum(a));
  return c.map((v, i) => v * (1 - t) + a[i] * L * t) as RGB;
}

export const rgbCss = (c: RGB) =>
  "#" +
  c
    .map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0"))
    .join("");

/** Mix a hex colour toward white. */
export const mixWhite = (hex: string, t: number) =>
  "#" +
  [1, 3, 5]
    .map((i) =>
      Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - t) + 255 * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

export const rgba = (hex: string, a: number) =>
  `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",")},${a})`;

/** Cool blue-grey/teal hues for the glass; nothing toward violet (>=225), which is
 *  reserved for selection and the HUD. */
export const GLASS_HUES = [205, 212, 196, 188, 208, 182, 200, 214, 192, 184, 210, 198, 186, 202, 190, 194];

/** Accent palette for researchers without a curated overlay. Same family as the
 *  approved domain accents; no purple (#a388ee is selection/HUD only). */
export const FALLBACK_ACCENTS = [
  "#5fe39b", "#5a98ff", "#f2b24c", "#ff4d6d", "#2fd6c0", "#ece04a", "#ff7ab8", "#4fc3f7",
  "#ff6a3d", "#a6e05a", "#e45bd6", "#a0f0ff", "#ffa070", "#3fbfc9", "#e3830d", "#f3e6c4",
];
export const FALLBACK_MARKS = ["sq", "ci", "di", "tr"] as const;
