// Manifests of the baked GPU assets (compiled into the world chunk from
// src/world/data/{pyramid,flip}.json; URLs are resolved in ../assets.ts).

export interface PyramidLevel {
  /** px per world unit */
  s: number;
  cols: number;
  rows: number;
  /** base64 bitset (row-major) of tiles that exist; absent tiles are empty space */
  has: string;
}

/** The deep-zoom pyramid: 256 px WebP tiles, levels halving in scale from the finest. */
export interface PyramidManifest {
  schema: 1;
  tile: number;
  /** world coords of pixel (0, 0) of every level */
  origin: [number, number];
  /** world extent covered (x0, y0, x1, y1) */
  extent: [number, number, number, number];
  fingerprint: string;
  /** content hash of the whole bake (cache key on every tile URL) */
  v: string;
  base?: string | null;
  /** finest first */
  levels: PyramidLevel[];
  bytes?: number;
  tiles?: number;
}

/** Flipbooks: a few frames per machine packed into WebP atlas pages. */
export interface FlipManifest {
  schema: 1;
  cell: [number, number];
  frames: number;
  fps: number;
  cols: number;
  rows: number;
  page: [number, number];
  pages: { file: string; v: string; bytes?: number }[];
  /** slug -> [page, first cell] */
  slots: Record<string, [number, number]>;
  base?: string | null;
  bytes?: number;
}
