// Glue between the world view and the GPU layer: owns the WebGL2 canvas, the
// deep-zoom pyramid, the flipbook sprites, the auras and adaptive quality.
//
//   far  (machine < 34 css px)  : pyramid tiles + auras. Nothing per machine.
//   mid  (34 .. ~200 device px) : + each machine on screen plays its flipbook
//                                 (one instanced draw for all of them)
//   near (> 276 device px)      : the pyramid shows machines at rest and the
//                                 closest few fade in as real SVG drawings on the
//                                 DOM layer above; a tapped one runs live
//
// Per frame the CPU only writes a camera uniform and the list of visible ground
// tiles; the sprite list is rebuilt at most ~15 times a second as the view moves.

import { GLWorld, type GLCam } from "./glWorld";
import { PyramidLayer, type PyramidManifest } from "./pyramid";
import { FlipLayer, type FlipManifest } from "./flipbook";
import { Quality, type QualitySettings } from "./quality";
import { at, ISLAND_Z, MACHINE_PO, MACHINE_S0, MACHINE_W, MZ0, THUMB_BOX, type Vec2 } from "../iso";
import { hex2rgb, hslRgb, mixWhite, tintKeepLum } from "../color";
import type { WMachine, WorldModel } from "../model";
import type { MachineGrid } from "../machineLayer";

const MID_PX = 34;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface GpuStats {
  renderer: "webgl2";
  quality: number;
  scale: number;
  sprites: number;
  erasers: number;
  tilesDrawn: number;
  tilesResident: number;
  tilesFetched: number;
  tileBytes: number;
  pyramidLevel: number;
  flipPagesResident: number;
  flipPagesFetched: number;
  flipBytes: number;
  gpuTexMB: number;
}

export class GpuTier {
  readonly gl: GLWorld;
  readonly pyramid: PyramidLayer;
  readonly flip: FlipLayer | null;
  readonly quality: Quality;
  private copies: [number, number][];
  private spriteBuf = new Float32Array(12 * 1024);
  private nSprites = 0;
  private nErase = 0;
  private phase: Float32Array;
  private ground = new Map<number, [number, number, number]>();
  private groundTint = -1;
  private dirty = true;
  private loading = true;
  private q: QualitySettings;
  private t0 = performance.now();
  onQuality: ((s: QualitySettings) => void) | null = null;

  static create(
    canvas: HTMLCanvasElement,
    model: WorldModel,
    grid: MachineGrid,
    pyr: PyramidManifest,
    flip: FlipManifest | null,
    o: { phone: boolean; dpr: number; reduced: boolean; pinQuality: number | null; requestFrame: () => void },
  ): GpuTier | null {
    const gl = GLWorld.create(canvas, o.phone ? 72 : 160);
    if (!gl) return null;
    return new GpuTier(gl, model, grid, pyr, flip, o);
  }

  private constructor(
    gl: GLWorld,
    private model: WorldModel,
    private grid: MachineGrid,
    pyr: PyramidManifest,
    flip: FlipManifest | null,
    private o: { phone: boolean; dpr: number; reduced: boolean; pinQuality: number | null; requestFrame: () => void },
  ) {
    this.gl = gl;
    const wake = () => {
      this.dirty = true;
      o.requestFrame();
    };
    this.pyramid = new PyramidLayer(gl, pyr, { concurrency: o.phone ? 4 : 6, onLoad: wake });
    this.pyramid.warm();
    this.flip = flip && flip.pages.length ? new FlipLayer(gl, flip, o.phone ? 4 : 8, wake) : null;
    this.quality = new Quality(o.dpr, o.phone ? 24 : 40, o.reduced, o.pinQuality);
    this.q = this.quality.settings;
    this.pyramid.bias = this.q.bias;
    this.copies = (model.copies?.length ? model.copies : [[0, 0]]).map((c) => [c[0], c[1]] as [number, number]);
    // a stable per-machine phase so neighbours never animate in lockstep
    this.phase = new Float32Array(model.machines.length);
    model.machines.forEach((m, i) => {
      let h = 2166136261;
      for (let k = 0; k < m.key.length; k++) h = Math.imul(h ^ m.key.charCodeAt(k), 16777619);
      this.phase[i] = ((h >>> 0) % 1000) / 1000;
    });
    this.buildAuras();
  }

  /** One aura per island, on its centre machine (v9). */
  private buildAuras() {
    const centres: { m: WMachine; n: number }[] = [];
    let n = 0;
    for (const d of this.model.domains) {
      const ms = d.machines.filter((m) => m.ring === 0);
      if (!ms.length) continue;
      for (const m of ms) centres.push({ m, n });
      n++;
    }
    const buf = new Float32Array(centres.length * 11);
    centres.forEach(({ m, n: k }, i) => {
      const b = at([m.cx, m.cy, ISLAND_Z]);
      const t = at([m.cx, m.cy, MZ0 + 150]);
      const ed = hex2rgb(mixWhite(this.model.domains[m.d]!.accent, 0.45));
      const dacc = hex2rgb(this.model.domains[m.d]!.accent);
      const o = i * 11;
      buf.set([b[0], b[1], t[0], t[1]], o);
      // v9 staggers each island's pulse by n * 0.37 s of a 3.2 s cycle
      buf.set([dacc[0], dacc[1], dacc[2], ((k * 0.37) % 3.2) / 3.2], o + 4);
      buf.set([ed[0], ed[1], ed[2]], o + 8);
    });
    this.gl.setAuras(buf, centres.length);
  }

  markDirty() {
    this.dirty = true;
  }

  /** Island ground colour (the eraser paints with it), following v9's zoom tint. */
  private groundOf(d: number, tint: number): [number, number, number] {
    if (tint !== this.groundTint) {
      this.ground.clear();
      this.groundTint = tint;
    }
    let g = this.ground.get(d);
    if (!g) {
      const dom = this.model.domains[d]!;
      const base = hslRgb(dom.hue, 6, 16.5);
      const tn = tintKeepLum(base, dom.accent);
      g = [0, 1, 2].map((i) => base[i]! + (tn[i]! - base[i]!) * tint) as [number, number, number];
      this.ground.set(d, g);
    }
    return g;
  }

  /**
   * Rebuild the sprite list for the current view (throttled by the caller).
   * `live` machines (running or enlarged) get an eraser even up close, so their
   * moving parts never show the resting copy baked into the pyramid.
   */
  rebuild(cam: GLCam, W: number, H: number, live: Set<string>, shown: Set<string>) {
    const flip = this.flip;
    this.nSprites = 0;
    this.nErase = 0;
    if (!flip) return;
    const dpr = this.o.dpr;
    const px = MACHINE_S0 * MACHINE_W * cam.z;
    const fadeIn = smooth(MID_PX - 6, MID_PX + 8, px);
    // past ~2x the flipbook's own resolution the crisp pyramid takes over
    const fadeOut = 1 - smooth(170, 240, px * dpr);
    const spriteA = this.q.sprites ? fadeIn * fadeOut : 0;
    const tnRaw = Math.max(0, Math.min(1, (0.5 - cam.z) / 0.42));
    const tint = Math.round(tnRaw * tnRaw * (3 - 2 * tnRaw) * 40) / 40;
    const hw = W / 2 / cam.z;
    const hh = H / 2 / cam.z;
    const mx = 320;
    const idx: number[] = [];
    if (spriteA > 0.01) this.grid.query(cam.x - hw - mx, cam.y - hh - 80, cam.x + hw + mx, cam.y + hh + 420, idx);
    for (const k of live) {
      const m = this.model.machineByKey[k];
      if (m) idx.push(this.model.machines.indexOf(m));
    }
    const ms = this.model.machines;
    const uniq = [...new Set(idx)];
    idx.length = 0;
    idx.push(...uniq);
    idx.sort((a, b) => ms[a]!.cx + ms[a]!.cy - (ms[b]!.cx + ms[b]!.cy));
    const kx = MACHINE_S0;
    const need = idx.length * 2 * 12;
    if (need > this.spriteBuf.length) this.spriteBuf = new Float32Array(need * 1.5);
    const b = this.spriteBuf;
    let n = 0;
    for (const i of idx) {
      const m = ms[i]!;
      const sl = flip.slot(m.slug);
      if (!sl) continue;
      const layer = flip.layerOf(sl[0]);
      if (layer < 0) continue;
      const isLive = live.has(m.key);
      const a = isLive ? 0 : shown.has(m.key) ? 0 : spriteA;
      if (!isLive && a <= 0.01) continue;
      const x = m.b[0] + kx * (THUMB_BOX.x - MACHINE_PO[0]);
      const y = m.b[1] + kx * (THUMB_BOX.y - MACHINE_PO[1]);
      const w = kx * THUMB_BOX.w;
      const h = kx * THUMB_BOX.h;
      const g = this.groundOf(m.d, tint);
      // eraser (rest silhouette in ground colour), only where motion could ghost
      if (isLive || (this.q.anim && a > 0.01)) {
        b.set([x, y, w, h, layer, sl[1], 0, isLive ? 1 : a, g[0], g[1], g[2], 1], n * 12);
        n++;
        this.nErase++;
      }
      if (!isLive) {
        b.set([x, y, w, h, layer, sl[1], this.phase[i]!, a, 0, 0, 0, 0], n * 12);
        n++;
        this.nSprites++;
      }
    }
    this.gl.setSprites(b, n);
    this.dirty = true;
  }

  /** Every animation frame. Returns false when nothing needed drawing. */
  frame(t: number, cam: GLCam, W: number, H: number, camMoved: boolean): boolean {
    if (this.quality.frame(t)) {
      this.q = this.quality.settings;
      this.pyramid.bias = this.q.bias;
      this.onQuality?.(this.q);
      this.dirty = true;
    }
    this.flip?.tick();
    this.gl.resize(W, H, this.q.scale);
    const aura = Math.round(Math.max(0, Math.min(1, (0.2 - cam.z) / 0.1)) * 40) / 40;
    const animating = (this.q.anim && this.nSprites > 0) || (this.q.pulse && aura > 0);
    if (!camMoved && !this.dirty && !this.loading && !animating) return false;
    this.dirty = false;
    const hw = W / 2 / cam.z;
    const hh = H / 2 / cam.z;
    this.loading = this.pyramid.update(
      [cam.x - hw, cam.y - hh, cam.x + hw, cam.y + hh],
      cam.z * this.q.scale,
      this.copies,
      [cam.x, cam.y],
    );
    this.gl.draw(cam, (t - this.t0) / 1000, {
      aura,
      pulse: this.q.pulse,
      anim: this.q.anim,
      cells: this.flip ? this.flip.cells : [1, 1, 1, 1],
    });
    return true;
  }

  get settings(): QualitySettings {
    return this.q;
  }

  stats(): GpuStats {
    const p = this.pyramid.stats;
    return {
      renderer: "webgl2",
      quality: this.q.level,
      scale: this.q.scale,
      sprites: this.nSprites,
      erasers: this.nErase,
      tilesDrawn: p.drawn,
      tilesResident: p.tilesResident,
      tilesFetched: p.tilesFetched,
      tileBytes: p.bytesFetched,
      pyramidLevel: p.level,
      flipPagesResident: this.flip?.resident ?? 0,
      flipPagesFetched: this.flip?.pagesFetched ?? 0,
      flipBytes: this.flip?.bytesFetched ?? 0,
      gpuTexMB: Math.round((this.gl.texBytes / 1048576) * 10) / 10,
    };
  }

  dispose() {
    this.pyramid.dispose();
    const ext = this.gl.gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  }
}

export type { Vec2 };
