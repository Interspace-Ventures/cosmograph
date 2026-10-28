// The mid level of detail: every machine on screen plays a tiny pre-recorded
// loop. Each machine was baked offline (scripts/bake-world.py) from its real
// live module in headless Chrome: frame 0 is its rest state, then a few frames
// stepped through its own test animation, 96 x 64 px each, packed into WebP
// atlas pages. Pages load on demand for the machines on screen and sit in one
// GPU texture array with an LRU; the frame shown is picked in the vertex shader
// from time and a per-instance phase, so playback costs no CPU at all.
//
// Under each playing sprite an "eraser" instance paints the machine's rest
// silhouette in the island's ground colour first: the pyramid underneath holds
// the same machine at rest, and the eraser keeps moving parts from ghosting.

import type { GLWorld } from "./glWorld";
import { flipPageUrl } from "../assets";

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

interface Page {
  layer: number;
  ready: boolean;
  used: number;
}

export class FlipLayer {
  private pages = new Map<number, Page>();
  private free: number[] = [];
  private frame = 0;
  private inflight = 0;
  private uploads: { page: number; bmp: ImageBitmap }[] = [];
  bytesFetched = 0;
  pagesFetched = 0;

  constructor(
    private gl: GLWorld,
    readonly man: FlipManifest,
    layers: number,
    private onLoad: () => void,
  ) {
    gl.ensureFlip(man.page[0], man.page[1], layers);
    for (let i = layers - 1; i >= 0; i--) this.free.push(i);
  }

  get cells(): [number, number, number, number] {
    return [this.man.cols, this.man.rows, this.man.frames, this.man.fps];
  }

  slot(slug: string): [number, number] | undefined {
    return this.man.slots[slug];
  }

  /** Start of a frame: upload at most one decoded page (1 MP) per frame. */
  tick() {
    this.frame++;
    const u = this.uploads.shift();
    if (u) {
      const p = this.pages.get(u.page);
      if (p && this.gl.flip) {
        this.gl.upload(this.gl.flip, p.layer, u.bmp);
        p.ready = true;
      }
      u.bmp.close();
    }
  }

  /** GPU layer holding a page, or -1 (and the page is requested). */
  layerOf(page: number): number {
    const p = this.pages.get(page);
    if (p) {
      p.used = this.frame;
      return p.ready ? p.layer : -1;
    }
    this.load(page);
    return -1;
  }

  private load(page: number) {
    if (this.inflight >= 2) return;
    let layer = this.free.pop();
    if (layer === undefined) {
      let best = -1;
      let bu = Infinity;
      for (const [k, p] of this.pages)
        if (p.ready && p.used < this.frame - 1 && p.used < bu) {
          bu = p.used;
          best = k;
        }
      if (best < 0) return;
      layer = this.pages.get(best)!.layer;
      this.pages.delete(best);
    }
    const entry: Page = { layer, ready: false, used: this.frame };
    this.pages.set(page, entry);
    this.inflight++;
    fetch(flipPageUrl(this.man, page))
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.blob();
      })
      .then((b) => {
        this.bytesFetched += b.size;
        this.pagesFetched++;
        return createImageBitmap(b, { premultiplyAlpha: "premultiply" });
      })
      .then((bmp) => {
        if (this.pages.get(page) !== entry) return bmp.close();
        this.uploads.push({ page, bmp });
        this.onLoad();
      })
      .catch(() => {
        if (this.pages.get(page) === entry) {
          this.pages.delete(page);
          this.free.push(layer!);
        }
      })
      .finally(() => {
        this.inflight--;
      });
  }

  get resident(): number {
    let n = 0;
    this.pages.forEach((p) => (n += p.ready ? 1 : 0));
    return n;
  }
}
