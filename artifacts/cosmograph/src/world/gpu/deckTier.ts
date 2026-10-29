// The world's GPU tier, on deck.gl (lazy-loaded: only /world with a baked
// pyramid ever downloads it). deck.gl does the generic work this view used to
// hand-roll in raw WebGL2 (glWorld / pyramid / flipbook / grid picking):
//
//   ground    : TileLayer + BitmapLayer over the baked deep-zoom pyramid
//               (on-demand fetch, request cap + abort, parent/child fallback
//               while loading, tile cache, viewport culling). One TileLayer per
//               copy of the layout on screen (the #stress=N worlds).
//   sprites   : IconLayer per flipbook page; the frame comes from getIcon with
//               an updateTrigger on a quarter-frame clock. Mask-mode IconLayers
//               paint each playing machine's rest silhouette in the island's
//               ground colour first (the "eraser"), so motion never ghosts over
//               the resting copy baked into the pyramid.
//   close-up  : BitmapLayer per machine: a one-time raster of its rest drawing.
//               Only the tapped / running machine is live SVG on the DOM layer.
//   picking   : deck's GPU picking on a transparent per-machine hit layer
//               (frontmost body wins because instances are drawn back to front).
//   auras     : the one genuinely custom piece: v9's island aura (pool, beam,
//               core, iso ring, pulse) as a ~100-line custom layer, screen-blended.
//
// Camera: an OrthographicView (y down) driven from the world view's own camera;
// deck's controller is off because the world view owns gestures.

import {
  Deck,
  Layer,
  OrthographicView,
  project32,
  type UpdateParameters,
} from "@deck.gl/core";
import { BitmapLayer, IconLayer, SolidPolygonLayer } from "@deck.gl/layers";
import { TileLayer } from "@deck.gl/geo-layers";
import { Geometry, Model } from "@luma.gl/engine";
import { Quality, type QualitySettings } from "./quality";
import type { FlipManifest, PyramidManifest } from "./manifests";
import {
  at,
  ISLAND_Z,
  MACHINE_PO,
  MACHINE_S0,
  MACHINE_W,
  MZ0,
  THUMB_BOX,
} from "../iso";
import { hex2rgb, hslRgb, mixWhite, tintKeepLum } from "../color";
import { flipPageUrl, pyramidTileUrl } from "../assets";
import { loadDrawing } from "../machineRuntime";
import type { WMachine, WorldModel } from "../model";
import type { MachineGrid } from "../machineLayer";

const MID_PX = 34;
const BG: [number, number, number, number] = [0x15, 0x16, 0x1c, 255];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface GLCam {
  x: number;
  y: number;
  /** CSS px per world unit */
  z: number;
}

export interface GpuStats {
  renderer: "webgl2";
  engine: "deck.gl";
  quality: number;
  scale: number;
  sprites: number;
  erasers: number;
  snapshots: number;
  layers: number;
  tilesDrawn: number;
  tilesResident: number;
  tilesFetched: number;
  tileBytes: number;
  flipPagesResident: number;
  flipPagesFetched: number;
  flipBytes: number;
  gpuTexMB: number;
}

// ---------------- the aura: the one custom layer ----------------

interface Aura {
  base: [number, number];
  top: [number, number];
  col: [number, number, number, number];
  ed: [number, number, number];
}

// luma.gl parses uniform blocks one field per line
const AURA_BLOCK = `layout(std140) uniform auraUniforms {
  float time;
  float fade;
  float pulse;
  float zoom;
} aura;
`;

const auraUniforms = {
  name: "aura",
  vs: AURA_BLOCK,
  fs: AURA_BLOCK,
  uniformTypes: { time: "f32", fade: "f32", pulse: "f32", zoom: "f32" },
} as const;

const AURA_VS = `#version 300 es
#define SHADER_NAME cgw-aura-vs
in vec3 positions;
in vec2 instanceBase;
in vec2 instanceTop;
in vec4 instanceCol;
in vec3 instanceEd;
out vec2 vW;
flat out vec2 vBase;
flat out vec2 vTop;
flat out vec4 vCol;
flat out vec3 vEd;
void main(){
  // box covering pool (560 x 320 around the base) and beam (300 x 3000 above the top)
  vec2 lo = vec2(min(instanceBase.x - 560.0, instanceTop.x - 150.0), instanceTop.y - 3000.0);
  vec2 hi = vec2(max(instanceBase.x + 560.0, instanceTop.x + 150.0), instanceBase.y + 320.0);
  vec2 w = mix(lo, hi, positions.xy);
  geometry.worldPosition = vec3(w, 0.0);
  gl_Position = project_position_to_clipspace(vec3(w, 0.0), vec3(0.0), vec3(0.0), geometry.position);
  vW = w; vBase = instanceBase; vTop = instanceTop; vCol = instanceCol; vEd = instanceEd;
}`;

const AURA_FS = `#version 300 es
#define SHADER_NAME cgw-aura-fs
precision highp float;
in vec2 vW;
flat in vec2 vBase;
flat in vec2 vTop;
flat in vec4 vCol;
flat in vec3 vEd;
out vec4 fragColor;
vec4 grad(float t, float a0, float m, float a1){
  t = clamp(t, 0.0, 1.0);
  vec3 c; float a;
  if (t < m) { float k = t / m; c = mix(vEd, vCol.rgb, k); a = mix(a0, a1, k); }
  else { float k = (t - m) / (1.0 - m); c = vCol.rgb; a = mix(a1, 0.0, k); }
  return vec4(c * a, a);
}
void main(){
  vec2 p = vW;
  vec2 q = (p - vBase) / vec2(560.0, 320.0);
  vec4 col = grad(length(q), 0.5, 0.45, 0.2) * 0.9;
  vec2 b = p - vTop;
  if (b.y <= 0.0) {
    if (abs(b.x) < 150.0 && b.y > -3000.0) {
      vec4 g = grad(length(vec2(b.x / 150.0, b.y / 3000.0)), 0.55, 0.3, 0.22);
      col = col + g * (1.0 - col.a);
    }
    if (abs(b.x) < 24.0 && b.y > -2400.0) {
      vec4 g = grad(length(vec2(b.x / 24.0, b.y / 2400.0)), 0.9, 0.35, 0.35);
      col = col + g * (1.0 - col.a);
    }
  }
  vec2 r = abs(p - vBase);
  float hx = 300.5, hy = 150.3;
  float dd = (r.x / hx + r.y / hy - 1.0) * (hx * hy / length(vec2(hx, hy))) * aura.zoom;
  float ring = (1.0 - smoothstep(1.0, 2.0, abs(dd))) * 0.85;
  col = col + vec4(vCol.rgb * ring, ring) * (1.0 - col.a);
  float pulse = mix(1.0, 0.81 + 0.19 * sin(6.2831853 * (aura.time / 3.2 + vCol.a)), aura.pulse);
  fragColor = col * aura.fade * pulse;
}`;

interface AuraLayerProps {
  data: Aura[];
  time: number;
  fade: number;
  pulse: number;
  zoom: number;
}

class AuraLayer extends Layer<AuraLayerProps> {
  static layerName = "CgwAuraLayer";
  static defaultProps = { time: 0, fade: 1, pulse: 0, zoom: 1 };
  declare state: { model?: Model };

  getShaders() {
    return super.getShaders({
      vs: AURA_VS,
      fs: AURA_FS,
      modules: [project32, auraUniforms],
    });
  }
  initializeState() {
    this.getAttributeManager()!.addInstanced({
      instanceBase: { size: 2, accessor: "getBase" },
      instanceTop: { size: 2, accessor: "getTop" },
      instanceCol: { size: 4, accessor: "getCol" },
      instanceEd: { size: 3, accessor: "getEd" },
    });
  }
  updateState(params: UpdateParameters<this>) {
    super.updateState(params);
    if (params.changeFlags.extensionsChanged || !this.state.model) {
      this.state.model?.destroy();
      this.state.model = new Model(this.context.device, {
        ...this.getShaders(),
        id: this.props.id,
        bufferLayout: this.getAttributeManager()!.getBufferLayouts(),
        geometry: new Geometry({
          topology: "triangle-strip",
          attributes: {
            positions: {
              size: 3,
              value: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]),
            },
          },
        }),
        isInstanced: true,
      });
      this.getAttributeManager()!.invalidateAll();
    }
  }
  draw() {
    const { model } = this.state;
    if (!model) return;
    const { time, fade, pulse, zoom } = this.props;
    model.shaderInputs.setProps({ aura: { time, fade, pulse, zoom } });
    model.draw(this.context.renderPass);
  }
}
const auraAccessors = {
  getBase: (a: Aura) => a.base,
  getTop: (a: Aura) => a.top,
  getCol: (a: Aura) => a.col,
  getEd: (a: Aura) => a.ed,
};
// screen blend: src + dst * (1 - src), like v9's mix-blend-mode: screen
const SCREEN = {
  blend: true,
  blendColorOperation: "add",
  blendColorSrcFactor: "one",
  blendColorDstFactor: "one-minus-src",
  blendAlphaOperation: "add",
  blendAlphaSrcFactor: "one",
  blendAlphaDstFactor: "one-minus-src-alpha",
} as const;

// ---------------- close-up snapshots ----------------

let snapCss: string | null = null;
/** The world stylesheet rules a machine drawing depends on (iso classes, theme variables). */
function drawingCss(): string {
  if (snapCss !== null) return snapCss;
  const out: string[] = [];
  for (const sh of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sh.cssRules;
    } catch {
      continue;
    }
    for (const r of Array.from(rules)) {
      const t = r.cssText;
      if (
        /\.iso|anatomy|\.mach\b|\.mcontent/.test(t) &&
        !/\.gl\b|\.pending|\.live|:hover|\.sel\b|\.held/.test(t)
      )
        out.push(t);
    }
  }
  snapCss = out.join("\n");
  return snapCss;
}

async function rasterize(svgText: string, wPx: number): Promise<ImageBitmap> {
  const { x, y, w, h } = THUMB_BOX;
  const hPx = Math.round((wPx * h) / w);
  // the drawings are written for innerHTML (lenient HTML parsing): round-trip them
  // through the DOM so the standalone SVG image is well-formed XML
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.innerHTML = svgText;
  const xml = Array.from(g.childNodes, (n) =>
    new XMLSerializer().serializeToString(n),
  ).join("");
  const doc =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${wPx}" height="${hPx}" viewBox="${x} ${y} ${w} ${h}">` +
    `<style>${drawingCss().replace(/<\//g, "<\\/")}</style>` +
    `<g class="cgw"><g class="mach rm iso built on" data-theme="dark"><g class="mpos"><g class="mcontent">${xml}</g></g></g></g></svg>`;
  const url = URL.createObjectURL(new Blob([doc], { type: "image/svg+xml" }));
  try {
    const img = new Image(wPx, hPx);
    img.src = url;
    await img.decode();
    // decoded straight to a bitmap (no accelerated 2D canvas round trip)
    return await createImageBitmap(img, {
      resizeWidth: wPx,
      resizeHeight: hPx,
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface Snap {
  state: "loading" | "ready" | "failed";
  bmp: ImageBitmap | null;
  used: number;
  m: WMachine;
}

// ---------------- the tier ----------------

interface IconDef {
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  mask: boolean;
}

interface SpriteDatum {
  m: WMachine;
  pos: [number, number];
  size: number;
  cell: number;
  phase: number;
  color: [number, number, number, number];
}

interface Opts {
  phone: boolean;
  dpr: number;
  reduced: boolean;
  pinQuality: number | null;
  requestFrame: () => void;
  onFail: () => void;
}

export class DeckTier {
  readonly deck: Deck<OrthographicView>;
  readonly quality: Quality;
  onQuality: ((s: QualitySettings) => void) | null = null;
  private q: QualitySettings;
  private copies: [number, number][];
  private auras: Aura[] = [];
  private phase: Float32Array;
  private ground = new Map<number, [number, number, number]>();
  private groundTint = -1;
  private spritesByPage = new Map<number, SpriteDatum[]>();
  private erasersByPage = new Map<number, SpriteDatum[]>();
  private hit: { m: WMachine; poly: [number, number][] }[] = [];
  private snaps = new Map<string, Snap>();
  private snapOn: string[] = [];
  private snapBusy = 0;
  private frameNo = 0;
  private nSprites = 0;
  private nErase = 0;
  private dirty = true;
  private tick = -1;
  private t0 = performance.now();
  private iconMap: Record<string, IconDef>;
  private maskMap: Record<string, IconDef>;
  // shared across the copies' TileLayers: one fetch + decode per tile
  private tileCache = new Map<string, Promise<ImageBitmap | null>>();
  private pageCache = new Map<
    number,
    { p: Promise<ImageBitmap | null>; bmp: ImageBitmap | null; used: number }
  >();
  private st = {
    tilesFetched: 0,
    tileBytes: 0,
    pagesFetched: 0,
    flipBytes: 0,
    tilesDrawn: 0,
    layers: 0,
  };
  private lastLevel = -1;
  private lost = false;

  static create(
    canvas: HTMLCanvasElement,
    model: WorldModel,
    grid: MachineGrid,
    pyr: PyramidManifest,
    flip: FlipManifest | null,
    o: Opts,
  ): DeckTier | null {
    try {
      const probe = document.createElement("canvas").getContext("webgl2");
      if (!probe) return null;
      probe.getExtension("WEBGL_lose_context")?.loseContext();
      return new DeckTier(canvas, model, grid, pyr, flip, o);
    } catch (e) {
      console.warn("[world] deck.gl setup failed, using the SVG renderer", e);
      return null;
    }
  }

  private constructor(
    canvas: HTMLCanvasElement,
    private model: WorldModel,
    private grid: MachineGrid,
    private pyr: PyramidManifest,
    private flip: FlipManifest | null,
    private o: Opts,
  ) {
    this.quality = new Quality(
      o.dpr,
      o.phone ? 24 : 40,
      o.reduced,
      o.pinQuality,
    );
    this.q = this.quality.settings;
    this.copies = (model.copies?.length ? model.copies : [[0, 0]]).map(
      (c) => [c[0], c[1]] as [number, number],
    );
    this.phase = new Float32Array(model.machines.length);
    model.machines.forEach((m, i) => {
      let h = 2166136261;
      for (let k = 0; k < m.key.length; k++)
        h = Math.imul(h ^ m.key.charCodeAt(k), 16777619);
      this.phase[i] = ((h >>> 0) % 1000) / 1000;
    });
    this.iconMap = {};
    this.maskMap = {};
    if (flip) {
      const [cw, ch] = flip.cell;
      for (let c = 0; c < flip.cols * flip.rows; c++) {
        const e = {
          x: (c % flip.cols) * cw,
          y: Math.floor(c / flip.cols) * ch,
          width: cw,
          height: ch,
          anchorX: cw / 2,
          anchorY: ch / 2,
        };
        this.iconMap[c] = { ...e, mask: false };
        this.maskMap[c] = { ...e, mask: true };
      }
    }
    this.buildAuras();
    this.deck = new Deck<OrthographicView>({
      canvas,
      width: "100%",
      height: "100%",
      views: new OrthographicView({
        id: "world",
        flipY: true,
        clear: true,
        clearColor: BG,
      }),
      viewState: { target: [0, 0, 0], zoom: 0 },
      controller: false,
      useDevicePixels: this.q.scale,
      layers: [],
      // the world view owns gestures, hover and the cursor
      getCursor: () => "inherit",
      deviceProps: {
        type: "webgl",
        webgl: {
          alpha: false,
          preserveDrawingBuffer: false,
          antialias: false,
          depth: false,
          stencil: false,
          powerPreference: "high-performance",
        },
      },
      onError: (e: Error) => {
        console.warn("[world] deck.gl error", e);
        if (!this.lost) {
          this.lost = true;
          o.onFail();
        }
      },
    } as ConstructorParameters<typeof Deck<OrthographicView>>[0]);
  }

  /** One aura per island, on its centre machine (v9). */
  private buildAuras() {
    let n = 0;
    for (const d of this.model.domains) {
      const ms = d.machines.filter((m) => m.ring === 0);
      if (!ms.length) continue;
      for (const m of ms) {
        const b = at([m.cx, m.cy, ISLAND_Z]);
        const t = at([m.cx, m.cy, MZ0 + 150]);
        const ed = hex2rgb(mixWhite(this.model.domains[m.d]!.accent, 0.45));
        const acc = hex2rgb(this.model.domains[m.d]!.accent);
        this.auras.push({
          base: [b[0], b[1]],
          top: [t[0], t[1]],
          col: [acc[0], acc[1], acc[2], ((n * 0.37) % 3.2) / 3.2],
          ed: [ed[0], ed[1], ed[2]],
        });
      }
      n++;
    }
  }

  markDirty() {
    this.dirty = true;
  }

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
      g = [0, 1, 2].map((i) => base[i]! + (tn[i]! - base[i]!) * tint) as [
        number,
        number,
        number,
      ];
      this.ground.set(d, g);
    }
    return g;
  }

  /**
   * Rebuild the per-machine layers for the current view (throttled by the caller).
   * `live` machines (running, loading or enlarged) get an eraser and no sprite or
   * snapshot: the DOM layer draws them. `snaps` are the close-up machines that
   * show a static raster of their drawing.
   */
  rebuild(
    cam: GLCam,
    W: number,
    H: number,
    live: Set<string>,
    snaps: WMachine[],
  ) {
    const flip = this.flip;
    this.spritesByPage.clear();
    this.erasersByPage.clear();
    this.hit = [];
    this.nSprites = 0;
    this.nErase = 0;
    const dpr = this.o.dpr;
    const px = MACHINE_S0 * MACHINE_W * cam.z;
    const fadeIn = smooth(MID_PX - 6, MID_PX + 8, px);
    const fadeOut = 1 - smooth(170, 240, px * dpr);
    const spriteA = this.q.sprites && flip ? fadeIn * fadeOut : 0;
    const tnRaw = Math.max(0, Math.min(1, (0.5 - cam.z) / 0.42));
    const tint = Math.round(tnRaw * tnRaw * (3 - 2 * tnRaw) * 40) / 40;
    const hw = W / 2 / cam.z;
    const hh = H / 2 / cam.z;
    const idx: number[] = [];
    // machines on screen (hit areas whenever machines are bigger than plates)
    if (px >= MID_PX - 6)
      this.grid.query(
        cam.x - hw - 320,
        cam.y - hh - 80,
        cam.x + hw + 320,
        cam.y + hh + 420,
        idx,
      );
    for (const k of live) {
      const m = this.model.machineByKey[k];
      if (m) idx.push(this.model.machines.indexOf(m));
    }
    const ms = this.model.machines;
    const uniq = [...new Set(idx)];
    uniq.sort((a, b) => ms[a]!.cx + ms[a]!.cy - (ms[b]!.cx + ms[b]!.cy));
    const kx = MACHINE_S0;
    const snapKeys = new Set(snaps.map((m) => m.key));
    for (const i of uniq) {
      const m = ms[i]!;
      const ox = m.b[0];
      const oy = m.b[1];
      this.hit.push({
        m,
        poly: [
          [ox + kx * (40 - 300), oy + kx * (20 - 239.781)],
          [ox + kx * (560 - 300), oy + kx * (20 - 239.781)],
          [ox + kx * (560 - 300), oy + kx * (370 - 239.781)],
          [ox + kx * (40 - 300), oy + kx * (370 - 239.781)],
        ],
      });
      if (!flip) continue;
      const sl = flip.slots[m.slug];
      if (!sl) continue;
      const isLive = live.has(m.key);
      const a = isLive || snapKeys.has(m.key) ? 0 : spriteA;
      if (!isLive && a <= 0.01) continue;
      const x = m.b[0] + kx * (THUMB_BOX.x - MACHINE_PO[0]);
      const y = m.b[1] + kx * (THUMB_BOX.y - MACHINE_PO[1]);
      const w = kx * THUMB_BOX.w;
      const h = kx * THUMB_BOX.h;
      const pos: [number, number] = [x + w / 2, y + h / 2];
      const g = this.groundOf(m.d, tint);
      if (isLive || (this.q.anim && a > 0.01)) {
        const e = this.erasersByPage.get(sl[0]) ?? [];
        e.push({
          m,
          pos,
          size: w,
          cell: sl[1],
          phase: 0,
          color: [g[0], g[1], g[2], Math.round((isLive ? 1 : a) * 255)],
        });
        this.erasersByPage.set(sl[0], e);
        this.nErase++;
      }
      if (!isLive) {
        const s = this.spritesByPage.get(sl[0]) ?? [];
        s.push({
          m,
          pos,
          size: w,
          cell: sl[1],
          phase: this.phase[i]!,
          color: [255, 255, 255, Math.round(a * 255)],
        });
        this.spritesByPage.set(sl[0], s);
        this.nSprites++;
      }
    }
    // close-up snapshots: rasterise what is missing (two at a time), keep an LRU
    this.frameNo++;
    this.snapOn = [];
    // raster at the size the machine is drawn on screen (no mipmaps needed), and
    // only while the camera holds still: rasterising is the expensive part
    const need = Math.min(
      this.o.phone ? 768 : 1024,
      Math.ceil((THUMB_BOX.w * MACHINE_S0 * cam.z * dpr * 1.15) / 64) * 64,
    );
    const still =
      this.lastCam !== null &&
      this.lastCam.x === cam.x &&
      this.lastCam.y === cam.y &&
      this.lastCam.z === cam.z;
    this.lastCam = { ...cam };
    for (const m of snaps) {
      if (live.has(m.key)) continue;
      let s = this.snaps.get(m.key);
      // a raster much softer than the screen now needs is redone
      if (
        s &&
        s.state === "ready" &&
        s.bmp &&
        still &&
        this.snapBusy < 2 &&
        s.bmp.width * 1.4 < need
      ) {
        s.bmp.close();
        this.snaps.delete(m.key);
        s = undefined;
      }
      if (!s && this.snapBusy < 2 && still) {
        const entry: Snap = {
          state: "loading",
          bmp: null,
          used: this.frameNo,
          m,
        };
        s = entry;
        this.snaps.set(m.key, entry);
        this.snapBusy++;
        loadDrawing(m.slug, 4)
          .then((svg) => rasterize(svg, need))
          .then((bmp) => {
            entry.bmp = bmp;
            entry.state = "ready";
            this.dirty = true;
            this.o.requestFrame();
          })
          .catch((e) => {
            entry.state = "failed";
            console.warn("[world] close-up raster failed", m.slug, e);
          })
          .finally(() => {
            this.snapBusy--;
            this.dirty = true;
          });
      }
      if (!s) continue;
      s.used = this.frameNo;
      if (s.state === "ready") this.snapOn.push(m.key);
    }
    const cap = this.o.phone ? 10 : 24;
    if (this.snaps.size > cap) {
      const old = [...this.snaps.entries()]
        .filter(([, s]) => s.used < this.frameNo && s.state !== "loading")
        .sort((a, b) => a[1].used - b[1].used);
      for (const [k] of old.slice(0, this.snaps.size - cap)) {
        this.snaps.get(k)?.bmp?.close();
        this.snaps.delete(k);
      }
    }
    // flipbook pages: keep every page this view uses, drop the least recently used beyond the cap
    const pcap = this.o.phone ? 4 : 8;
    if (this.pageCache.size > pcap) {
      const old = [...this.pageCache.entries()]
        .filter(([, e]) => e.bmp && e.used < this.frameNo - 1)
        .sort((a, b) => a[1].used - b[1].used);
      for (const [k] of old.slice(0, this.pageCache.size - pcap))
        this.pageCache.delete(k);
    }
    this.dirty = true;
  }

  get snapshotsShown(): number {
    return this.snapOn.length;
  }

  private tile(url: string): Promise<ImageBitmap | null> {
    let p = this.tileCache.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => (r.ok ? r.blob() : null))
        .then((b) => {
          if (!b) return null;
          this.st.tilesFetched++;
          this.st.tileBytes += b.size;
          return createImageBitmap(b);
        })
        .catch(() => {
          this.tileCache.delete(url);
          return null;
        });
      this.tileCache.set(url, p);
      // decoded tiles held for the copies: bounded, oldest first (layers keep their own texture)
      const cap = this.o.phone ? 160 : 400;
      if (this.tileCache.size > cap)
        this.tileCache.delete(this.tileCache.keys().next().value!);
    }
    return p;
  }

  private page(i: number): ImageBitmap | null {
    const flip = this.flip!;
    let e = this.pageCache.get(i);
    if (!e) {
      const entry: {
        p: Promise<ImageBitmap | null>;
        bmp: ImageBitmap | null;
        used: number;
      } = {
        p: Promise.resolve(null),
        bmp: null,
        used: this.frameNo,
      };
      entry.p = fetch(flipPageUrl(flip, i))
        .then((r) => (r.ok ? r.blob() : null))
        .then((b) => {
          if (!b) return null;
          this.st.pagesFetched++;
          this.st.flipBytes += b.size;
          return createImageBitmap(b);
        })
        .then((bmp) => {
          entry.bmp = bmp;
          this.dirty = true;
          this.o.requestFrame();
          return bmp;
        })
        .catch(() => {
          this.pageCache.delete(i);
          return null;
        });
      this.pageCache.set(i, entry);
      e = entry;
    }
    e.used = this.frameNo;
    return e.bmp;
  }

  // ground: rebuilt only when the copies on screen or the level offset change;
  // between those, deck's TileLayer follows the camera by itself
  private tileCacheKey = "";
  private tileLayersCached: Layer[] = [];
  private tileLayers(cam: GLCam, W: number, H: number): Layer[] {
    const out: Layer[] = [];
    const pyr = this.pyr;
    const nL = pyr.levels.length;
    const maxZoom = Math.round(Math.log2(pyr.levels[0]!.s));
    const minZoom = Math.round(Math.log2(pyr.levels[nL - 1]!.s));
    const L0 = pyr.levels[0]!;
    const extent: [number, number, number, number] = [
      0,
      0,
      (L0.cols * pyr.tile) / L0.s,
      (L0.rows * pyr.tile) / L0.s,
    ];
    const bits =
      this.bits ??
      (this.bits = pyr.levels.map((l) =>
        Uint8Array.from(atob(l.has), (c) => c.charCodeAt(0)),
      ));
    const has = (L: number, c: number, r: number) => {
      const lv = pyr.levels[L];
      if (!lv || c < 0 || r < 0 || c >= lv.cols || r >= lv.rows) return false;
      const i = r * lv.cols + c;
      return ((bits[L]![i >> 3]! >> (i & 7)) & 1) === 1;
    };
    const zoomOffset = Math.log2(this.q.scale * this.q.bias * 0.85);
    const hw = W / 2 / cam.z;
    const hh = H / 2 / cam.z;
    const [ex0, ey0, ex1, ey1] = pyr.extent;
    this.lastLevel = Math.max(
      0,
      Math.min(
        nL - 1,
        maxZoom -
          Math.max(
            minZoom,
            Math.min(maxZoom, Math.ceil(Math.log2(cam.z) + zoomOffset)),
          ),
      ),
    );
    const vis: number[] = [];
    for (let ci = 0; ci < this.copies.length; ci++) {
      const [ox, oy] = this.copies[ci]!;
      if (
        !(
          cam.x + hw < ex0 + ox ||
          cam.x - hw > ex1 + ox ||
          cam.y + hh < ey0 + oy ||
          cam.y - hh > ey1 + oy
        )
      )
        vis.push(ci);
    }
    const key = `${vis.join(",")}|${zoomOffset}`;
    if (key === this.tileCacheKey) return this.tileLayersCached;
    this.tileCacheKey = key;
    this.tileLayersCached = out;
    for (let ci = 0; ci < this.copies.length; ci++) {
      const [ox, oy] = this.copies[ci]!;
      if (
        cam.x + hw < ex0 + ox ||
        cam.x - hw > ex1 + ox ||
        cam.y + hh < ey0 + oy ||
        cam.y - hh > ey1 + oy
      )
        continue;
      const tx = pyr.origin[0] + ox;
      const ty = pyr.origin[1] + oy;
      out.push(
        new TileLayer<ImageBitmap | null>({
          id: `pyr-${ci}`,
          tileSize: pyr.tile,
          minZoom,
          maxZoom,
          extent,
          zoomOffset,
          modelMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, 0, 1],
          maxRequests: this.o.phone ? 4 : 6,
          refinementStrategy: "best-available",
          getTileData: ({ index }) => {
            const L = maxZoom - index.z;
            if (!has(L, index.x, index.y)) return null;
            return this.tile(pyramidTileUrl(pyr, L, index.x, index.y));
          },
          renderSubLayers: (p) => {
            const tile = p.tile;
            if (!p.data) return null;
            const { left, top, right, bottom } = tile.bbox as {
              left: number;
              top: number;
              right: number;
              bottom: number;
            };
            return new BitmapLayer({
              ...p,
              id: `${p.id}-bm`,
              data: undefined,
              image: p.data,
              bounds: [left, bottom, right, top],
              textureParameters: {
                minFilter: "linear",
                magFilter: "linear",
                mipmapFilter: "none",
                addressModeU: "clamp-to-edge",
                addressModeV: "clamp-to-edge",
              },
            });
          },
          onViewportLoad: (tiles) => {
            this.st.tilesDrawn = tiles.length;
          },
        }),
      );
    }
    return out;
  }

  private flipLayers(t: number): Layer[] {
    const out: Layer[] = [];
    // flipbooks: erasers first (all pages), then the playing sprites, page by page
    const flip = this.flip;
    if (flip) {
      const n = flip.frames;
      const period = Math.max(1, 2 * n - 2);
      const anim = this.q.anim;
      const ts = (t - this.t0) / 1000;
      const frameOf = (d: SpriteDatum) => {
        if (!anim) return d.cell;
        const k = Math.floor(ts * flip.fps + d.phase * period) % period;
        return d.cell + (k < n ? k : period - k);
      };
      const common = {
        billboard: true,
        sizeUnits: "common" as const,
        sizeBasis: "width" as const,
        getPosition: (d: SpriteDatum) => d.pos,
        getSize: (d: SpriteDatum) => d.size,
        getColor: (d: SpriteDatum) => d.color,
      };
      for (const [pg, data] of this.erasersByPage) {
        const img = this.page(pg);
        if (!img) continue;
        out.push(
          new IconLayer<SpriteDatum>({
            ...common,
            id: `era-${pg}`,
            data,
            iconAtlas: img as unknown as string,
            iconMapping: this.maskMap,
            getIcon: (d) => String(d.cell),
            alphaCutoff: 0.02,
            updateTriggers: { getColor: this.frameNo },
          }),
        );
      }
      for (const [pg, data] of this.spritesByPage) {
        const img = this.page(pg);
        if (!img) continue;
        out.push(
          new IconLayer<SpriteDatum>({
            ...common,
            id: `spr-${pg}`,
            data,
            iconAtlas: img as unknown as string,
            iconMapping: this.iconMap,
            getIcon: (d) => String(frameOf(d)),
            alphaCutoff: 0.01,
            updateTriggers: { getIcon: this.tick, getColor: this.frameNo },
          }),
        );
      }
    }
    return out;
  }

  private snapLayers(): Layer[] {
    const out: Layer[] = [];
    // close-up snapshots, back to front
    const snaps = this.snapOn
      .map((k) => this.snaps.get(k)!)
      .filter((s) => s?.bmp);
    snaps.sort((a, b) => a.m.cx + a.m.cy - (b.m.cx + b.m.cy));
    for (const s of snaps) {
      const m = s.m;
      const kx = MACHINE_S0;
      const x = m.b[0] + kx * (THUMB_BOX.x - MACHINE_PO[0]);
      const y = m.b[1] + kx * (THUMB_BOX.y - MACHINE_PO[1]);
      out.push(
        new BitmapLayer({
          id: `snap-${m.key}`,
          image: s.bmp!,
          bounds: [x, y + kx * THUMB_BOX.h, x + kx * THUMB_BOX.w, y],
        }),
      );
    }
    // GPU picking: one transparent body box per machine on screen, back to front
    if (this.hit.length)
      out.push(
        new SolidPolygonLayer<{ m: WMachine; poly: [number, number][] }>({
          id: "hit",
          data: this.hit,
          getPolygon: (d) => d.poly,
          getFillColor: [0, 0, 0, 0],
          pickable: true,
          updateTriggers: { getPolygon: this.frameNo },
        }),
      );
    return out;
  }

  private auraLayers(cam: GLCam, t: number): Layer[] {
    const out: Layer[] = [];
    // island auras
    const fade =
      Math.round(Math.max(0, Math.min(1, (0.2 - cam.z) / 0.1)) * 40) / 40;
    if (fade > 0.005 && this.auras.length)
      out.push(
        new AuraLayer({
          id: "auras",
          data: this.auras,
          ...auraAccessors,
          time: (t - this.t0) / 1000,
          fade,
          pulse: this.q.pulse ? 1 : 0,
          zoom: cam.z,
          parameters: SCREEN,
        } as AuraLayerProps & Record<string, unknown>),
      );
    return out;
  }
  private bits: Uint8Array[] | null = null;
  private lastTiles: Layer[] | null = null;
  private flipCached: Layer[] = [];
  private snapCached: Layer[] = [];
  private auraCached: Layer[] = [];
  private auraKey = -1;
  /** last camera move (rAF time): close-up rasters wait for the camera to settle */
  private lastMove = 0;
  private lastCam: GLCam | null = null;

  /** Every animation frame. Returns false when nothing needed drawing. */
  frame(
    t: number,
    cam: GLCam,
    W: number,
    H: number,
    camMoved: boolean,
  ): boolean {
    if (this.lost) return false;
    if (this.quality.frame(t)) {
      const s = this.quality.settings;
      if (s.scale !== this.q.scale)
        this.deck.setProps({ useDevicePixels: s.scale });
      this.q = s;
      this.onQuality?.(this.q);
      this.dirty = true;
    }
    const fade = Math.max(0, Math.min(1, (0.2 - cam.z) / 0.1));
    const flip = this.flip;
    // sprite clock at quarter-frame resolution keeps per-machine phases distinct
    const tick =
      this.q.anim && this.nSprites > 0 && flip
        ? Math.floor(((t - this.t0) / 1000) * flip.fps * 4)
        : -1;
    const pulsing = this.q.pulse && fade > 0.005;
    if (!camMoved && !this.dirty && tick === this.tick && !pulsing)
      return false;
    if (camMoved) this.lastMove = t;
    const tiles = this.tileLayers(cam, W, H);
    let changed = tiles !== this.lastTiles;
    this.lastTiles = tiles;
    if (this.dirty) {
      this.flipCached = this.flipLayers(t);
      this.snapCached = this.snapLayers();
      changed = true;
    } else if (tick !== this.tick) {
      this.flipCached = this.flipLayers(t);
      changed = true;
    }
    const fq = Math.round(fade * 40);
    if (pulsing || fq !== this.auraKey || (fq > 0 && camMoved)) {
      this.auraCached = this.auraLayers(cam, t);
      this.auraKey = fq;
      changed = true;
    }
    this.tick = tick;
    this.dirty = false;
    const props: Record<string, unknown> = {};
    if (camMoved)
      props.viewState = { target: [cam.x, cam.y, 0], zoom: Math.log2(cam.z) };
    if (changed) {
      const layers = [
        ...tiles,
        ...this.flipCached,
        ...this.snapCached,
        ...this.auraCached,
      ];
      this.st.layers = layers.length;
      props.layers = layers;
    }
    this.deck.setProps(props);
    // deck draws on its own animation frame (an extra redraw here drew every frame twice)
    return true;
  }

  /** GPU pick: the frontmost machine body under a client point. */
  pick(clientX: number, clientY: number): WMachine | null {
    if (this.lost || !this.hit.length) return null;
    const c = (this.deck as unknown as { canvas: HTMLCanvasElement | null })
      .canvas;
    const r = c?.getBoundingClientRect();
    const info = this.deck.pickObject({
      x: clientX - (r?.left ?? 0),
      y: clientY - (r?.top ?? 0),
      radius: 0,
      layerIds: ["hit"],
    });
    return (info?.object as { m: WMachine } | undefined)?.m ?? null;
  }

  get settings(): QualitySettings {
    return this.q;
  }

  stats(): GpuStats {
    let tilesResident = 0;
    this.tileCache.forEach(() => tilesResident++);
    let pages = 0;
    this.pageCache.forEach((p) => (pages += p.bmp ? 1 : 0));
    const fw = this.flip ? this.flip.page[0] * this.flip.page[1] * 4 : 0;
    let snapBytes = 0;
    this.snaps.forEach(
      (s) => (snapBytes += s.bmp ? s.bmp.width * s.bmp.height * 4 : 0),
    );
    return {
      renderer: "webgl2",
      engine: "deck.gl",
      quality: this.q.level,
      scale: this.q.scale,
      sprites: this.nSprites,
      erasers: this.nErase,
      snapshots: this.snapOn.length,
      layers: this.st.layers,
      tilesDrawn: this.st.tilesDrawn,
      tilesResident,
      tilesFetched: this.st.tilesFetched,
      tileBytes: this.st.tileBytes,
      flipPagesResident: pages,
      flipPagesFetched: this.st.pagesFetched,
      flipBytes: this.st.flipBytes,
      gpuTexMB:
        Math.round(
          ((tilesResident * 256 * 256 * 4 + pages * fw + snapBytes) / 1048576) *
            10,
        ) / 10,
    };
  }

  get pyramidLevel(): number {
    return this.lastLevel;
  }

  dispose() {
    this.lost = true;
    this.snaps.forEach((s) => s.bmp?.close());
    this.snaps.clear();
    this.deck.finalize();
  }
}
