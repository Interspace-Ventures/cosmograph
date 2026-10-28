// The far level of detail: a pre-rendered deep-zoom image pyramid of the whole
// world (islands, bowls, paper tiles, machines at rest, stars, overview marks),
// baked offline by rendering this same view's SVG at each level's zoom
// (scripts/bake-world.py), so every level looks exactly like v9 at that zoom:
// non-scaling strokes, planet tint and overview marks included.
//
// 256 px WebP tiles with alpha. Levels halve in scale from the finest (0.5 px per
// world unit). Tiles stream in on demand, nearest the centre first, through a
// small concurrent queue; a missing tile shows its nearest loaded ancestor
// (a sub-rect of a coarser tile) until it arrives. Decoded tiles live in one GPU
// texture array with an LRU, so memory is fixed however big the world is.
//
// A world made of copies of one layout (the #stress=N worlds) draws the same
// pyramid once per copy: tiles are shared, so a 20k-machine world streams no more
// bytes than the 341-machine one it is tiled from.

import type { GLWorld } from "./glWorld";
import { pyramidTileUrl } from "../assets";

export interface PyramidLevel {
  /** px per world unit */
  s: number;
  cols: number;
  rows: number;
  /** base64 bitset (row-major) of tiles that exist; absent tiles are empty space */
  has: string;
}

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

interface Slot {
  layer: number;
  ready: boolean;
  used: number;
  ctrl?: AbortController;
}

export interface PyramidStats {
  tilesResident: number;
  tilesFetched: number;
  bytesFetched: number;
  inflight: number;
  drawn: number;
  level: number;
}

const decodeBits = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export class PyramidLayer {
  private bits: Uint8Array[];
  private slots = new Map<number, Slot>();
  private free: number[] = [];
  private frame = 0;
  private inflight = 0;
  private uploads: { key: number; bmp: ImageBitmap }[] = [];
  private buf = new Float32Array(9 * 512);
  stats: PyramidStats = { tilesResident: 0, tilesFetched: 0, bytesFetched: 0, inflight: 0, drawn: 0, level: 0 };
  /** quality bias: 1 = level matched to device px, 0.5 = half resolution */
  bias = 1;

  constructor(
    private gl: GLWorld,
    readonly man: PyramidManifest,
    private opts: { concurrency: number; onLoad: () => void },
  ) {
    this.bits = man.levels.map((l) => decodeBits(l.has));
    for (let i = gl.tiles.layers - 1; i >= 0; i--) this.free.push(i);
  }

  private key(L: number, c: number, r: number) {
    return (L * 4096 + r) * 4096 + c;
  }
  private has(L: number, c: number, r: number): boolean {
    const lv = this.man.levels[L];
    if (!lv || c < 0 || r < 0 || c >= lv.cols || r >= lv.rows) return false;
    const i = r * lv.cols + c;
    return ((this.bits[L]![i >> 3]! >> (i & 7)) & 1) === 1;
  }

  /** The level for a zoom: the coarsest one still at least as sharp as the screen. */
  levelFor(zDev: number): number {
    const lv = this.man.levels;
    let L = 0;
    for (let i = 0; i < lv.length; i++) if (lv[i]!.s >= zDev * this.bias * 0.85) L = i;
    return L;
  }

  /** Request coarse levels up front so something always shows. */
  warm(maxTiles = 8) {
    const lv = this.man.levels;
    let n = 0;
    for (let L = lv.length - 1; L >= 0 && n < maxTiles; L--) {
      const l = lv[L]!;
      if (l.cols * l.rows > maxTiles - n) break;
      for (let r = 0; r < l.rows; r++)
        for (let c = 0; c < l.cols; c++)
          if (this.has(L, c, r)) {
            this.request(L, c, r, 100);
            n++;
          }
    }
  }

  private queue: { L: number; c: number; r: number; p: number }[] = [];

  private request(L: number, c: number, r: number, prio: number) {
    const k = this.key(L, c, r);
    const s = this.slots.get(k);
    if (s) {
      s.used = this.frame;
      return;
    }
    this.queue.push({ L, c, r, p: prio });
  }

  private alloc(): number | null {
    const f = this.free.pop();
    if (f !== undefined) return f;
    // evict the least recently used ready tile not used this frame
    let best: number | null = null;
    let bu = Infinity;
    for (const [k, s] of this.slots)
      if (s.ready && s.used < this.frame - 1 && s.used < bu) {
        bu = s.used;
        best = k;
      }
    if (best === null) return null;
    const s = this.slots.get(best)!;
    this.slots.delete(best);
    return s.layer;
  }

  private pump() {
    this.queue.sort((a, b) => b.p - a.p);
    while (this.inflight < this.opts.concurrency && this.queue.length) {
      const q = this.queue.shift()!;
      const k = this.key(q.L, q.c, q.r);
      if (this.slots.has(k)) continue;
      const layer = this.alloc();
      if (layer === null) break;
      const ctrl = new AbortController();
      const slot: Slot = { layer, ready: false, used: this.frame, ctrl };
      this.slots.set(k, slot);
      this.inflight++;
      fetch(pyramidTileUrl(this.man, q.L, q.c, q.r), { signal: ctrl.signal })
        .then((res) => {
          if (!res.ok) throw new Error(String(res.status));
          return res.blob();
        })
        .then((blob) => {
          this.stats.bytesFetched += blob.size;
          this.stats.tilesFetched++;
          return createImageBitmap(blob, { premultiplyAlpha: "premultiply" });
        })
        .then((bmp) => {
          if (this.slots.get(k) !== slot) {
            bmp.close();
            return;
          }
          this.uploads.push({ key: k, bmp });
          this.opts.onLoad();
        })
        .catch(() => {
          if (this.slots.get(k) === slot) {
            this.slots.delete(k);
            this.free.push(layer);
          }
        })
        .finally(() => {
          this.inflight--;
          this.pump();
        });
    }
    this.queue.length = 0;
  }

  /**
   * Build this frame's ground: for each copy of the layout on screen, the tiles
   * of the right level, or the nearest loaded ancestor's sub-rect. Returns
   * whether anything still loads (so the caller keeps drawing).
   */
  update(
    view: [number, number, number, number],
    zDev: number,
    copies: readonly [number, number][],
    centre: [number, number],
  ): boolean {
    this.frame++;
    // a few uploads per frame keeps texture uploads from stalling a frame
    for (let n = 0; n < 6 && this.uploads.length; n++) {
      const u = this.uploads.shift()!;
      const s = this.slots.get(u.key);
      if (s) {
        this.gl.upload(this.gl.tiles, s.layer, u.bmp);
        s.ready = true;
        s.ctrl = undefined;
      }
      u.bmp.close();
    }
    const man = this.man;
    const T = man.tile;
    const L = this.levelFor(zDev);
    this.stats.level = L;
    const nL = man.levels.length;
    let n = 0;
    const [ex0, ey0, ex1, ey1] = man.extent;
    for (const [ox, oy] of copies) {
      // view in this copy's own coordinates
      const vx0 = view[0] - ox;
      const vy0 = view[1] - oy;
      const vx1 = view[2] - ox;
      const vy1 = view[3] - oy;
      if (vx1 < ex0 || vx0 > ex1 || vy1 < ey0 || vy0 > ey1) continue;
      const lv = man.levels[L]!;
      const span = T / lv.s;
      const c0 = Math.max(0, Math.floor((vx0 - man.origin[0]) / span));
      const c1 = Math.min(lv.cols - 1, Math.floor((vx1 - man.origin[0]) / span));
      const r0 = Math.max(0, Math.floor((vy0 - man.origin[1]) / span));
      const r1 = Math.min(lv.rows - 1, Math.floor((vy1 - man.origin[1]) / span));
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          if (!this.has(L, c, r)) continue;
          const tx = man.origin[0] + c * span;
          const ty = man.origin[1] + r * span;
          const dx = tx + span / 2 + ox - centre[0];
          const dy = ty + span / 2 + oy - centre[1];
          this.request(L, c, r, -(dx * dx + dy * dy) / (span * span));
          // the tile itself, else the nearest loaded ancestor's sub-rect
          let drawn = false;
          for (let k = 0; L + k < nL && !drawn; k++) {
            const cc = c >> k;
            const rr = r >> k;
            const s = this.slots.get(this.key(L + k, cc, rr));
            if (!s || !s.ready) {
              // ask for the parent too, at a lower priority, so the fallback fills in fast
              if (k === 1) this.request(L + 1, cc, rr, -1e6);
              continue;
            }
            s.used = this.frame;
            const f = 1 / (1 << k);
            const u0 = (c - (cc << k)) * f;
            const v0 = (r - (rr << k)) * f;
            if (n * 9 + 9 > this.buf.length) {
              const nb = new Float32Array(this.buf.length * 2);
              nb.set(this.buf);
              this.buf = nb;
            }
            const b = this.buf;
            const o = n * 9;
            b[o] = tx + ox;
            b[o + 1] = ty + oy;
            b[o + 2] = span;
            b[o + 3] = span;
            b[o + 4] = u0;
            b[o + 5] = v0;
            b[o + 6] = u0 + f;
            b[o + 7] = v0 + f;
            b[o + 8] = s.layer;
            n++;
            drawn = true;
          }
        }
    }
    this.gl.setTiles(this.buf, n);
    this.stats.drawn = n;
    this.pump();
    let resident = 0;
    this.slots.forEach((s) => (resident += s.ready ? 1 : 0));
    this.stats.tilesResident = resident;
    this.stats.inflight = this.inflight;
    return this.inflight > 0 || this.uploads.length > 0;
  }

  dispose() {
    this.slots.forEach((s) => s.ctrl?.abort());
    this.slots.clear();
    this.uploads.forEach((u) => u.bmp.close());
    this.uploads = [];
  }
}
