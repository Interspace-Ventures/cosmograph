// The isometric researcher world: one island per research domain, one tile per
// paper, and a live machine on every paper that has one. Ported from the
// approved v8 mockup and extended to the v9 layout (341 machines). Camera,
// bowls, labels and the machine lift are imperative (refs + rAF) so pan and zoom never re-render React; selection, the tag and the
// HUD are React state.

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { galaxyData, papersByDomain } from "@/data/galaxy";
import { buildWorld, worldFingerprint, type WMachine, type WorldModel } from "./model";
import { tilesMarkup, WorldScene } from "./WorldScene";
import { renderBowl } from "./bowl";
import { hex2rgb, rgba } from "./color";
import {
  at,
  MACHINE_C,
  MACHINE_H,
  MACHINE_PO,
  MACHINE_S0,
  MACHINE_W,
  PITCH,
  pts,
  type Vec2,
} from "./iso";
import {
  cancelQueued,
  isCached,
  loadDrawing,
  loaderStats,
  mountLive,
  pin,
  prefetch,
  unpin,
  phoneClass,
  type LiveMachine,
} from "./machineRuntime";
import { hasModule, loadAssetManifests } from "./assets";
import { CAPS, createNode, lodFor, MachineGrid, NEAR_DEV_PX, thumbContent, type Lod, type MNode } from "./machineLayer";
import { stressCount, stressWorld } from "./stress";
// the deck.gl tier is a separate chunk, fetched only when this view uses it
import type { DeckTier } from "./gpu/deckTier";
import type { FlipManifest, PyramidManifest } from "./gpu/manifests";
import pyramidJson from "./data/pyramid.json";
import flipJson from "./data/flip.json";
import "./world.css";

const PYRAMID = pyramidJson as unknown as PyramidManifest;
const FLIP = flipJson as unknown as FlipManifest;

/** `#bake=pyramid|flip` (internal flag only): render for the offline asset baker. */
const bakeMode = (hash: string) => /(?:^|[#&])bake=(\w+)/.exec(hash)?.[1] ?? null;
/** `#svg` forces the SVG renderer; `#q=0..3` pins GPU quality (review + stress hooks). */
const forceSvg = (hash: string) => /(?:^|[#&])svg(?:&|$)/.test(hash);
const pinnedQuality = (hash: string) => {
  const m = /(?:^|[#&])q=(\d)/.exec(hash);
  return m ? Math.min(3, Number(m[1])) : null;
};

type Sel =
  | { kind: "tile"; id: string; d: number; at: Vec2 }
  | { kind: "mach"; key: string; d: number; at: Vec2; lift: boolean }
  | null;

interface Cam {
  x: number;
  y: number;
  z: number;
}

type LabelEl = HTMLDivElement & { _x?: number; _y?: number };

const phone = () => window.innerWidth <= 560;

/** A paper tile's footprint (plan +-150 at ground level), for the GPU tier's selection outline. */
const tileOutline = (cx: number, cy: number) =>
  pts(
    [
      [-150, -150],
      [150, -150],
      [150, 150],
      [-150, 150],
    ].map(([a, b]) => at([cx + a, cy + b, 0])),
  );
/** GPU-tier tile hit test: inside the tile's iso diamond. */
const inTile = (wx: number, wy: number, cx: number, cy: number) => {
  const [tx, ty] = at([cx, cy, 0]);
  return Math.abs(wx - tx) / 268 + Math.abs(wy - ty) / 134 <= 1;
};

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const escHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function WorldView({ backHref }: { backHref: string }) {
  // Built from the active dataset; the parent remounts this view on a dataset swap.
  // `#stress=N` (internal flag only) tiles the real world until it holds N machines
  const [model, baseFp] = useMemo<[WorldModel, string]>(() => {
    const base = buildWorld(galaxyData, papersByDomain);
    const n = stressCount(window.location.hash);
    return [n ? stressWorld(base, n) : base, worldFingerprint(base)];
  }, []);
  const bake = useMemo(() => bakeMode(window.location.hash), []);
  // GPU tier when this world has a matching baked pyramid (the default researcher)
  // and WebGL2 works; otherwise (other datasets, no WebGL2, #svg, baking) the SVG path
  const [gpu, setGpu] = useState<boolean>(
    () =>
      !bake &&
      !forceSvg(window.location.hash) &&
      PYRAMID.levels.length > 0 &&
      PYRAMID.fingerprint === baseFp &&
      typeof WebGL2RenderingContext !== "undefined",
  );
  const grid = useMemo(() => new MachineGrid(model.machines), [model]);
  const author = galaxyData.author;

  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef<(LabelEl | null)[]>([]);
  const tagRef = useRef<HTMLDivElement>(null);
  const leaderRef = useRef<HTMLDivElement>(null);
  const pdotRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const stubRef = useRef<HTMLDivElement>(null);

  const [sel, setSelState] = useState<Sel>(null);
  const [sideOpen, setSideOpen] = useState(false);
  const [curKey, setCurKey] = useState<string | null>(model.tour[0] ?? null);
  const [statusTick, setStatusTick] = useState(0);

  // ---- imperative state (never triggers renders) ----
  const st = useRef({
    cam: { x: 0, y: 0, z: 0.6 } as Cam,
    sel: null as Sel,
    flyRaf: 0,
    flyDone: null as null | (() => void),
    bowlRes: {} as Record<number, number>,
    bowlQueue: [] as number[],
    bowlRaf: 0,
    bowlT: undefined as ReturnType<typeof setTimeout> | undefined,
    // machine nodes that exist right now (mid / near level of detail); content + slot index them for the lift
    nodes: new Map<string, MNode>(),
    content: {} as Record<string, SVGGElement>,
    slot: {} as Record<string, SVGGElement>,
    layers: {} as Record<number, Element | null>,
    domEls: {} as Record<
      number,
      { g: SVGGElement | null; aura: SVGGElement | null; tiles: SVGGElement | null; filled: boolean; vis: boolean }
    >,
    filled: [] as number[],
    live: {} as Record<string, LiveMachine | "loading" | undefined>,
    runOrder: [] as string[],
    assetsReady: false,
    dirty: true,
    lod: "mid" as Lod,
    loopRaf: 0,
    fps: 0,
    maxLoaded: 0,
    maxNear: 0,
    maxNodes: 0,
    cssAura: -1,
    cssTint: -1,
    status: {} as Record<string, string>,
    lifted: null as null | { key: string; L: number; rise: number; t: number },
    liftRaf: 0,
    liftFin: null as null | (() => void),
    homeCam: null as Cam | null,
    observers: [] as MutationObserver[],
    gpu: null as DeckTier | null,
    // the deck.gl chunk is loading: nothing per machine is drawn yet
    gpuPending: false,
    camMoved: true,
    // GPU tier: the camera the SVG viewBox was last committed at; between commits
    // the SVG layer follows the camera with a compositor-only CSS transform
    vbCam: null as Cam | null,
    vbMoving: false,
    vbCommit: false,
    vbT: undefined as ReturnType<typeof setTimeout> | undefined,
    bowlBusy: false,
  });

  const [BX0, BY0, BX1, BY1] = model.bounds;
  const zMin = () => Math.min(window.innerWidth / (BX1 - BX0), window.innerHeight / (BY1 - BY0)) * 0.8;
  const clampZ = (z: number) => Math.max(zMin(), Math.min(1.8, z));
  const toS = ([x, y]: Vec2): Vec2 => {
    const c = st.current.cam;
    return [(x - c.x) * c.z + window.innerWidth / 2, (y - c.y) * c.z + window.innerHeight / 2];
  };

  // ---------- labels + tag placement ----------
  const place = useCallback(() => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cam = st.current.cam;
    const D = model.domains;
    const labels = labelRefs.current;
    D.forEach((d, i) => {
      const el = labels[i];
      if (!el) return;
      const [x, y0] = toS(d.front);
      let y = y0 - (cam.z > 0.3 ? 14 : 6);
      const cc = toS(d.c);
      // keep the label on screen while its island is
      if (cc[1] > 0 && cc[1] < H && cc[0] > 0 && cc[0] < W) y = Math.max(y, phone() ? 140 : 110);
      const vis = x > 40 && x < W - 40 - (W > 900 ? 250 : 0) && y > 60 && y < H - 60;
      if (!vis) {
        // untouched while hidden: in a big world most labels are off screen every frame
        if (el.style.display !== "none") el.style.display = "none";
        return;
      }
      el.style.display = "block";
      el.classList.toggle("far", cam.z < 0.3);
      el.classList.remove("nos");
      el.style.left = x + "px";
      el.style.top = y + "px";
      el._x = x;
      el._y = y;
    });
    // domains with machines first, then by citations; each label scores candidate
    // spots against labels already placed and the machines, plus distance moved
    const LB = D.map((_, i) => i)
      .filter((i) => labels[i] && labels[i]!.style.display !== "none")
      .sort(
        (p, q) => Number(D[q].machines.length > 0) - Number(D[p].machines.length > 0) || D[q].cites - D[p].cites,
      );
    // at most a screenful of labels get placed; the rest wait until the camera is closer
    const maxLabels = phone() ? 10 : 28;
    for (const i of LB.splice(maxLabels)) labels[i]!.style.display = "none";
    const done: number[][] = [];
    const obst: number[][] = D.filter((d) => d.machines.length).map((d) => {
      const c = toS(d.c);
      const t = toS(d.top);
      const r = 700 * cam.z;
      return [c[0] - r, t[1], c[0] + r, c[1] + r * 0.5];
    });
    if (cam.z < 0.2)
      D.forEach((d) => {
        const m = toS(d.mk);
        const r = Math.max(9, 170 * cam.z);
        const box = [m[0] - r, m[1] - r, m[0] + r, m[1] + r];
        obst.push(box, box); // counted twice: the overview marks are small and must stay readable
      });
    // only obstacles on screen can collide with a label
    const obstOn = obst.filter((r) => r[2] > 0 && r[0] < W && r[3] > 0 && r[1] < H);
    const ov2 = (r: number[], o: number[]) =>
      Math.max(0, Math.min(r[2], o[2]) - Math.max(r[0], o[0])) *
      Math.max(0, Math.min(r[3], o[3]) - Math.max(r[1], o[1]));
    for (const i of LB) {
      const el = labels[i]!;
      const ex = el._x ?? 0;
      const ey = el._y ?? 0;
      let best: { sc: number; x: number; y: number; r: number[]; nos: boolean } | null = null;
      for (const nos of [false, true]) {
        el.classList.toggle("nos", nos);
        const w = el.offsetWidth;
        const hh = el.offsetHeight;
        const A = (w + 12) * (hh + 6);
        for (const dx of [0, -0.3, 0.3, -0.6, 0.6])
          for (const dy of [0, -0.5, 0.5, -1, 1, -1.5, -2, 1.5]) {
            const x = ex + dx * w;
            const y = ey + dy * hh;
            const r = [x - w / 2 - 6, y - hh - 3, x + w / 2 + 6, y + 3];
            let sc = 0;
            for (const o of done) sc += (1000 * ov2(r, o)) / A;
            for (const o of obstOn) sc += (120 * ov2(r, o)) / A;
            sc += Math.abs(dx) * 6 + Math.abs(dy) * 2.2 + (nos ? 4 : 0);
            if (r[0] < 8 || r[2] > W - 8 || r[1] < (phone() ? 100 : 60)) sc += 500;
            if (!best || sc < best.sc) best = { sc, x, y, r, nos };
          }
      }
      if (!best) continue;
      el.classList.toggle("nos", best.nos);
      el.style.left = best.x + "px";
      el.style.top = best.y + "px";
      done.push(best.r);
    }
    // tag + leader line
    const tag = tagRef.current;
    const leader = leaderRef.current;
    const pdot = pdotRef.current;
    if (!tag || !leader || !pdot) return;
    const s = st.current.sel;
    if (!s) {
      tag.style.display = leader.style.display = pdot.style.display = "none";
      return;
    }
    const [ax, ay] = toS(s.at);
    tag.style.display = "block";
    const tw = tag.offsetWidth;
    const th = tag.offsetHeight;
    const lift = s.kind === "mach" && s.lift;
    let tx: number;
    let ty: number;
    if (phone()) {
      tx = 12;
      ty = H - th - (lift ? 112 : 64);
      tag.style.width = W - 30 + "px";
    } else if (lift) {
      tx = Math.min(ax + 24, W - tw - 24);
      ty = Math.max(64, Math.min(H - th - 70, ay));
    } else {
      tx = ax + 70;
      ty = ay - th - 60;
      if (tx + tw > W - 280) tx = ax - tw - 70;
      if (ty < 70) ty = ay + 50;
      tx = Math.max(16, tx);
      ty = Math.max(64, Math.min(H - th - 70, ty));
    }
    tag.style.left = tx + "px";
    tag.style.top = ty + "px";
    const anchor = [tx + (tx > ax ? 0 : tw), ty + (ty > ay ? 0 : th)];
    const dx = ax - anchor[0];
    const dy = ay - anchor[1];
    leader.style.display = pdot.style.display = "block";
    leader.style.left = anchor[0] + "px";
    leader.style.top = anchor[1] + "px";
    leader.style.width = Math.hypot(dx, dy) + "px";
    leader.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    pdot.style.left = ax + "px";
    pdot.style.top = ay + "px";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // ---------- bowls: shade visible islands at the current zoom, one island per frame ----------
  const bowlsUpdate = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const S = st.current;
    const want = () => Math.max(0.12, Math.min(1.6, S.cam.z * (window.devicePixelRatio || 1)));
    const vb = svg.viewBox.baseVal;
    const q: number[] = [];
    for (const d of model.domains) {
      const b = d.bb;
      if (b[2] < vb.x || b[0] > vb.x + vb.width || b[3] < vb.y || b[1] > vb.y + vb.height) continue;
      const cap = 2600 / Math.max(b[2] - b[0], b[3] - b[1]);
      const res = Math.min(want(), cap);
      const had = S.bowlRes[d.idx];
      if (had && had >= res * 0.8) continue;
      q.push(d.idx);
    }
    S.bowlQueue = q;
    cancelAnimationFrame(S.bowlRaf);
    S.bowlBusy = q.length > 0;
    const step = () => {
      const i = S.bowlQueue.shift();
      if (i === undefined) {
        S.bowlBusy = false;
        return;
      }
      const d = model.domains[i];
      const cap = 2600 / Math.max(d.bb[2] - d.bb[0], d.bb[3] - d.bb[1]);
      const res = Math.min(want(), cap);
      const out = renderBowl({ ...d.bowl, o: d.o, bb: d.bb, hue: d.hue, acc: hex2rgb(d.accent), seed: i }, res);
      if (out) {
        S.bowlRes[i] = res;
        svg
          .querySelectorAll<SVGImageElement>(`image[data-b="${i}"],image[data-bt="${i}"]`)
          .forEach((im) => im.setAttribute("href", im.hasAttribute("data-bt") ? out[1] : out[0]));
      }
      S.bowlRaf = requestAnimationFrame(step);
    };
    S.bowlRaf = requestAnimationFrame(step);
  }, [model]);

  const bowlsLater = useCallback(() => {
    const S = st.current;
    S.bowlBusy = true;
    clearTimeout(S.bowlT);
    S.bowlT = setTimeout(bowlsUpdate, 140);
  }, [bowlsUpdate]);

  const apply = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const cam = st.current.cam;
    if (!bake) {
      cam.x = Math.max(BX0, Math.min(BX1, cam.x));
      cam.y = Math.max(BY0, Math.min(BY1, cam.y));
    }
    // auras only in the wide view (gone by z = .2); planet tint full in the overview,
    // ~75% in the island view, ~35% with a machine enlarged, neutral by z = .5
    // custom properties on the root restyle the whole drawing, so write them only
    // when the quantised value changes (at 20k machines this was the frame budget)
    const S = st.current;
    const a = Math.round(Math.max(0, Math.min(1, (0.2 - cam.z) / 0.1)) * 40) / 40;
    if (a !== S.cssAura) {
      S.cssAura = a;
      svg.style.setProperty("--aura", a.toFixed(3));
      svg.classList.toggle("noaura", a < 0.01);
    }
    const tn = Math.max(0, Math.min(1, (0.5 - cam.z) / 0.42));
    const tint = Math.round(tn * tn * (3 - 2 * tn) * 40) / 40;
    if (tint !== S.cssTint) {
      S.cssTint = tint;
      svg.style.setProperty("--tint", tint.toFixed(3));
    }
    const W0 = window.innerWidth;
    const H0 = window.innerHeight;
    // GPU tier: re-rasterising the SVG layer (close-up drawings with their filters)
    // was the whole close-zoom frame budget, so while the camera moves the layer is
    // moved by a CSS transform on the compositor and the viewBox is committed only
    // when the camera settles or drifts too far (the pyramid underneath already
    // shows every machine at rest, so the layer's edges never show a gap)
    const vc = S.gpu && !bake ? S.vbCam : null;
    if (vc) {
      const s = cam.z / vc.z;
      const tx = (vc.x - cam.x) * cam.z;
      const ty = (vc.y - cam.y) * cam.z;
      const fresh = s === 1 && tx === 0 && ty === 0;
      if (!fresh && !S.vbCommit && s > 0.7 && s < 1.45 && Math.abs(tx) < W0 * 0.36 && Math.abs(ty) < H0 * 0.36) {
        svg.style.transform = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${s.toFixed(4)})`;
        S.vbMoving = true;
        clearTimeout(S.vbT);
        S.vbT = setTimeout(() => {
          S.vbCommit = true;
          apply();
        }, 160);
        place();
        S.camMoved = true;
        S.dirty = true;
        return;
      }
    }
    S.vbCommit = false;
    clearTimeout(S.vbT);
    if (S.gpu && !bake) {
      S.vbCam = { ...cam };
      S.vbMoving = false;
      svg.style.transform = "";
    }
    const w = W0 / cam.z;
    const h = H0 / cam.z;
    svg.setAttribute(
      "viewBox",
      `${(cam.x - w / 2).toFixed(1)} ${(cam.y - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`,
    );
    place();
    // (GPU tier, even while its chunk loads: the bowls are pyramid pixels)
    if (!gpu && !S.gpu) bowlsLater();
    S.camMoved = true;
    st.current.dirty = true; // level of detail + loading run on the next (throttled) frame
  }, [BX0, BX1, BY0, BY1, place, bowlsLater, bake, gpu]);

  // ---------- camera views ----------
  const viewOf = useCallback(
    (i: number): Cam => {
      const d = model.domains[i];
      const W = window.innerWidth;
      const H = window.innerHeight;
      if (phone()) {
        const z = clampZ(W / 1720);
        return { z, x: d.c[0], y: d.c[1] + (H * 0.06) / z };
      }
      const bw = d.box[1] - d.box[0];
      const bh = d.by[1] - d.by[0];
      const mx = (d.box[0] + d.box[1]) / 2;
      const my = (d.by[0] + d.by[1]) / 2;
      const z = clampZ(Math.min(0.42, (W * 0.56) / bw, (H * 0.68) / bh));
      return { z, x: mx - (W * 0.53 - W / 2) / z, y: my - (H * 0.53 - H / 2) / z };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model],
  );

  // the enlarged view: camera settles on the machine's tile and the machine is
  // lifted and scaled so it is drawn about half the frame wide (phone: nearly the full width)
  const liftGeom = useCallback(
    (m: WMachine) => {
      const ph = phone();
      const W = window.innerWidth;
      const H = window.innerHeight;
      const S0 = MACHINE_S0;
      const z0 = clampZ(
        ph ? (W * 0.3) / (S0 * MACHINE_W) : Math.min((W * 0.115) / (S0 * MACHINE_W), (H * 0.17) / (S0 * MACHINE_H)),
      );
      const px = ph ? W * 0.94 : Math.min(W * 0.5, (H * 0.62 * MACHINE_W) / MACHINE_H);
      const L = Math.max(1.6, px / (S0 * MACHINE_W * z0));
      const rise = S0 * L * MACHINE_H * 0.32;
      const cx = m.b[0] + S0 * L * (MACHINE_C[0] - MACHINE_PO[0]);
      const cy = m.b[1] - rise + S0 * L * (MACHINE_C[1] - MACHINE_PO[1]);
      return {
        z: z0,
        L,
        rise,
        x: ph ? cx : cx + (W * 0.1) / z0,
        y: ph ? cy + (H * 0.15) / z0 : cy + (H * 0.01) / z0,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model],
  );

  const flyTo = useCallback(
    (v: Cam, ms = 900, then?: () => void) => {
      const S = st.current;
      cancelAnimationFrame(S.flyRaf);
      S.flyDone = then ?? null;
      const a = { ...S.cam };
      const t0 = performance.now();
      const zf = Math.log(v.z / a.z);
      const far = (Math.hypot(v.x - a.x, v.y - a.y) * Math.min(v.z, a.z)) / window.innerWidth;
      ms = reducedMotion() ? 0 : ms * Math.max(0.8, Math.min(1.6, 0.8 + far * 0.25));
      const step = (t: number) => {
        const u = ms ? Math.min(1, (t - t0) / ms) : 1;
        const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        const dip = Math.sin(Math.PI * u) * Math.min(0.35, 0.12 + far * 0.06); // slight pull-back mid-flight
        S.cam.z = a.z * Math.exp(zf * e) * (1 - dip * 0.5);
        S.cam.x = a.x + (v.x - a.x) * e;
        S.cam.y = a.y + (v.y - a.y) * e;
        apply();
        if (u < 1) S.flyRaf = requestAnimationFrame(step);
        else {
          S.cam.z = v.z;
          apply();
          const f = S.flyDone;
          S.flyDone = null;
          f?.();
        }
      };
      S.flyRaf = requestAnimationFrame(step);
    },
    [apply],
  );

  const fitAll = useCallback(() => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const pw = W > 900 ? 290 : 0;
    const cam = st.current.cam;
    cam.z = 0.9 * Math.min((W - pw - 40) / Math.max(1, BX1 - BX0 - 700), (H - 120) / Math.max(1, BY1 - BY0 - 700));
    cam.x = (BX0 + BX1) / 2 + pw / 2 / cam.z;
    cam.y = (BY0 + BY1) / 2 + 10 / cam.z;
  }, [BX0, BX1, BY0, BY1]);

  // ---------- lift (tap to enlarge) ----------
  const liftFrame = useCallback(
    (key: string, L0: number, rise0: number, e: number) => {
      const svg = svgRef.current;
      const m = model.machineByKey[key];
      if (!svg || !m) return;
      const holder = svg.querySelector<SVGGElement>("#lholder");
      const lshadow = svg.querySelector<SVGEllipseElement>("#lshadow");
      const lglow = svg.querySelector<SVGEllipseElement>("#lglow");
      if (!holder || !lshadow || !lglow) return;
      const L = 1 + (L0 - 1) * e;
      const rise = rise0 * e;
      const sc = MACHINE_S0 * L;
      holder.setAttribute(
        "transform",
        `translate(${m.b[0].toFixed(1)} ${(m.b[1] - rise).toFixed(1)}) scale(${sc.toFixed(5)}) translate(${(-MACHINE_PO[0]).toFixed(3)} ${(-MACHINE_PO[1]).toFixed(3)})`,
      );
      lshadow.setAttribute("cx", String(m.g0[0]));
      lshadow.setAttribute("cy", String(m.g0[1]));
      lshadow.setAttribute("rx", (MACHINE_S0 * MACHINE_W * 0.42 * (1 + 0.6 * e)).toFixed(1));
      lshadow.setAttribute("ry", (MACHINE_S0 * MACHINE_W * 0.24 * (1 + 0.6 * e)).toFixed(1));
      lshadow.style.opacity = (0.9 * e).toFixed(3);
      const gx = m.b[0] + sc * (MACHINE_C[0] - MACHINE_PO[0]);
      const gy = m.b[1] - rise + sc * (MACHINE_C[1] - MACHINE_PO[1]);
      lglow.setAttribute("cx", gx.toFixed(1));
      lglow.setAttribute("cy", gy.toFixed(1));
      lglow.setAttribute("rx", (sc * MACHINE_W * 0.66).toFixed(1));
      lglow.setAttribute("ry", (sc * MACHINE_H * 0.66).toFixed(1));
      lglow.style.opacity = e.toFixed(3);
      const s = st.current.sel;
      if (s && s.kind === "mach" && s.key === key && s.lift)
        s.at = [m.b[0] + sc * (575 - MACHINE_PO[0]), m.b[1] - rise + sc * (110 - MACHINE_PO[1])];
    },
    [model],
  );

  const animLift = useCallback(
    (from: number, to: number, ms: number, done?: () => void) => {
      const S = st.current;
      if (S.liftFin) {
        const f = S.liftFin;
        S.liftFin = null;
        cancelAnimationFrame(S.liftRaf);
        f();
      }
      const lifted = S.lifted;
      if (!lifted) {
        done?.();
        return;
      }
      S.liftFin = done ?? null;
      const t0 = performance.now();
      if (reducedMotion()) ms = 0;
      const step = (t: number) => {
        const u = ms ? Math.min(1, (t - t0) / ms) : 1;
        const e = to > from ? 1 - Math.pow(1 - u, 3) : u * u * (3 - 2 * u);
        const v = from + (to - from) * e;
        lifted.t = v;
        liftFrame(lifted.key, lifted.L, lifted.rise, v);
        place();
        if (u < 1) S.liftRaf = requestAnimationFrame(step);
        else {
          const f = S.liftFin;
          S.liftFin = null;
          f?.();
        }
      };
      if (!ms) step(t0);
      else S.liftRaf = requestAnimationFrame(step);
    },
    [liftFrame, place],
  );

  // settle the enlarged machine back onto its tile
  const dropLift = useCallback(
    (ms: number) => {
      const S = st.current;
      const lifted = S.lifted;
      const svg = svgRef.current;
      if (!lifted || !svg) return;
      const fin = () => {
        const content = S.content[lifted.key];
        const slot = S.slot[lifted.key];
        if (content && slot) slot.appendChild(content);
        svg.querySelector(`.mach[data-m="${lifted.key}"]:not(#lshell)`)?.classList.remove("held");
        if (S.lifted === lifted) S.lifted = null;
        if (!S.lifted) {
          const lshadow = svg.querySelector<SVGElement>("#lshadow");
          const lglow = svg.querySelector<SVGElement>("#lglow");
          if (lshadow) lshadow.style.opacity = "0";
          if (lglow) lglow.style.opacity = "0";
          rootRef.current?.classList.remove("lifting");
          svg.querySelector("#lshell")?.removeAttribute("data-m");
        }
      };
      if (!ms) {
        if (S.liftFin) {
          const f = S.liftFin;
          S.liftFin = null;
          cancelAnimationFrame(S.liftRaf);
          f();
        }
        fin();
        return;
      }
      animLift(lifted.t, 0, ms, fin);
    },
    [animLift],
  );

  const liftUp = useCallback(
    (m: WMachine, instant: boolean) => {
      const S = st.current;
      const svg = svgRef.current;
      const geo = liftGeom(m);
      if (!svg) return geo;
      const shell = svg.querySelector<SVGGElement>("#lshell");
      const holder = svg.querySelector<SVGGElement>("#lholder");
      const content = S.content[m.key];
      if (!shell || !holder || !content) return geo;
      shell.dataset.m = m.key;
      shell.dataset.d = String(m.d);
      holder.style.filter = `drop-shadow(0 0 .8px ${rgba(m.edge, 0.75)})`;
      svg.querySelectorAll("#cgw-liftglow stop").forEach((s) => s.setAttribute("stop-color", m.accent));
      holder.appendChild(content);
      svg.querySelector(`.mach[data-m="${m.key}"]:not(#lshell)`)?.classList.add("held");
      rootRef.current?.classList.add("lifting");
      S.lifted = { key: m.key, L: geo.L, rise: geo.rise, t: 0 };
      animLift(0, 1, instant ? 0 : 760);
      return geo;
    },
    [animLift, liftGeom],
  );

  // ---------- machine nodes + level of detail ----------
  const ensureNode = useCallback((m: WMachine): MNode | null => {
    const S = st.current;
    const have = S.nodes.get(m.key);
    if (have) return have;
    let layer = S.layers[m.d];
    if (!layer) layer = S.layers[m.d] = svgRef.current?.querySelector(`g.mlayer[data-d="${m.d}"]`) ?? null;
    if (!layer) return null;
    const n = createNode(layer, m, !!S.gpu);
    S.nodes.set(m.key, n);
    S.content[m.key] = n.content;
    S.slot[m.key] = n.slot;
    const s = S.sel;
    if (s && s.kind === "mach" && s.key === m.key) n.g.classList.add("sel");
    return n;
  }, []);

  const stopLive = useCallback((key: string) => {
    const S = st.current;
    const lm = S.live[key];
    if (lm && typeof lm === "object") lm.dispose();
    S.live[key] = undefined;
    S.runOrder = S.runOrder.filter((k) => k !== key);
    S.nodes.get(key)?.g.classList.remove("live");
    stubRef.current?.querySelector(`[data-stub="${CSS.escape(key)}"]`)?.remove();
  }, []);

  const removeNode = useCallback(
    (key: string) => {
      const S = st.current;
      const n = S.nodes.get(key);
      if (!n) return;
      stopLive(key);
      if (n.pinned) unpin(n.m.slug);
      n.g.remove();
      S.nodes.delete(key);
      delete S.content[key];
      delete S.slot[key];
    },
    [stopLive],
  );

  // once per throttled frame: cull islands, pick each machine's level of detail,
  // queue / cancel / prefetch module loads, stop machines that left the screen
  const lodUpdate = useCallback(() => {
    const S = st.current;
    const svg = svgRef.current;
    if (!svg || S.gpuPending) return;
    const cam = S.cam;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    // baking: real drawings wherever a machine is big enough to read, pictures below that
    const bakePx = MACHINE_S0 * MACHINE_W * cam.z;
    const lod: Lod = bake ? (bakePx < 6 ? "far" : bakePx > 60 ? "near" : "mid") : lodFor(cam.z, dpr);
    if (S.lod !== lod || svg.dataset.lod !== lod) {
      S.lod = lod;
      svg.dataset.lod = lod;
    }
    const hw = W / 2 / cam.z;
    const hh = H / 2 / cam.z;
    const vx0 = cam.x - hw;
    const vx1 = cam.x + hw;
    const vy0 = cam.y - hh;
    const vy1 = cam.y + hh;

    // islands (and their auras) off screen are taken out of rendering entirely
    // (SVG renderer only: on the GPU tier the islands are pyramid tiles)
    if (!S.gpu) {
    const tilesOn = PITCH * cam.z >= 3;
    let visAuras = 0;
    for (const d of model.domains) {
      let e = S.domEls[d.idx];
      if (!e || !e.g)
        e = S.domEls[d.idx] = {
          g: svg.querySelector<SVGGElement>(`g.domain[data-d="${d.idx}"]`),
          aura: svg.querySelector<SVGGElement>(`g.aura[data-d="${d.idx}"]`),
          tiles: svg.querySelector<SVGGElement>(`g.tiles[data-d="${d.idx}"]`),
          filled: false,
          vis: true,
        };
      const b = d.bb;
      const vis = !(b[2] < vx0 - 700 || b[0] > vx1 + 700 || b[3] < vy0 - 200 || b[1] > vy1 + 1400);
      if (vis !== e.vis) {
        e.vis = vis;
        if (e.g) e.g.style.display = vis ? "" : "none";
        if (e.aura) e.aura.style.display = vis ? "" : "none";
      }
      if (vis) visAuras += e.aura ? 1 : 0;
      // paper tiles exist only for islands on screen, and only once they are big enough to read
      if (vis && tilesOn && !e.filled && e.tiles) {
        e.tiles.innerHTML = tilesMarkup(d);
        e.filled = true;
        S.filled.push(d.idx);
        const s = S.sel;
        if (s && s.kind === "tile" && s.d === d.idx) e.tiles.querySelector(`.tile[data-id="${s.id}"]`)?.classList.add("sel");
      }
    }
    // keep the tile DOM bounded: islands that left the screen give theirs back
    if (S.filled.length > (phoneClass() ? 24 : 64)) {
      S.filled = S.filled.filter((i) => {
        const e = S.domEls[i];
        if (!e || e.vis || !e.tiles) return true;
        e.tiles.textContent = "";
        e.filled = false;
        return false;
      });
    }
    svg.classList.toggle("notiles", !tilesOn);
    // many auras on screen at once: hold them still (each is a large animated gradient)
    svg.classList.toggle("calm", visAuras > 48);
    }

    // machines in view, nearest the centre first, capped
    // (GPU tier: only live machines are DOM; every other close-up is a static raster
    // of its drawing on the canvas, and sprites and pyramid cover the rest)
    const want: WMachine[] = [];
    const snaps: WMachine[] = [];
    const gpuT = S.gpu;
    // GPU tier, camera moving: keep the DOM layer as it is (any DOM change would
    // re-rasterise it); it is re-chosen when the camera settles
    const frozen = !!gpuT && S.vbMoving && !bake;
    if (gpuT) {
      S.nodes.forEach((n) => {
        if (S.live[n.m.key] || S.runOrder.includes(n.m.key)) want.push(n.m);
      });
      if (lod === "near" && S.assetsReady) {
        const idx = grid.query(vx0 - 340, vy0 - 80, vx1 + 340, vy1 + 420);
        const dist = (m: WMachine) => (m.b[0] - cam.x) ** 2 + (m.b[1] - 180 - cam.y) ** 2;
        const ms = idx.map((i) => model.machines[i]!).filter((m) => hasModule(m.slug, m.live));
        ms.sort((a, b) => dist(a) - dist(b));
        snaps.push(...ms.slice(0, CAPS.snapGpu()));
      }
    } else if (lod !== "far" && S.assetsReady) {
      const idx = grid.query(vx0 - 340, vy0 - 80, vx1 + 340, vy1 + 420);
      const dist = (m: WMachine) => (m.b[0] - cam.x) ** 2 + (m.b[1] - 180 - cam.y) ** 2;
      const ms = idx.map((i) => model.machines[i]!);
      ms.sort((a, b) => dist(a) - dist(b));
      want.push(...ms.slice(0, bake ? Infinity : CAPS.nodes()));
    }
    const wantKeys = new Set(want.map((m) => m.key));
    const lifted = S.lifted?.key;
    if (lifted) wantKeys.add(lifted);
    for (const k of [...S.nodes.keys()]) if (!wantKeys.has(k)) removeNode(k);
    for (const m of want) ensureNode(m);

    // near: the closest few swap their thumbnail for the machine's own drawing
    const keepSlugs = new Set<string>();
    for (const k of S.runOrder) keepSlugs.add(model.machineByKey[k]?.slug ?? "");
    for (const [k, v] of Object.entries(S.live)) if (v === "loading") keepSlugs.add(model.machineByKey[k]?.slug ?? "");
    for (const m of snaps) keepSlugs.add(m.slug);
    const nearCap = bake ? Infinity : CAPS.near();
    let rank = 0;
    for (const m of want) {
      const n = S.nodes.get(m.key);
      if (!n) continue;
      const isLive = !!S.live[m.key];
      const near = !gpuT && lod === "near" && rank < nearCap && hasModule(m.slug, m.live);
      if (hasModule(m.slug, m.live)) rank++;
      if (near) {
        keepSlugs.add(m.slug);
        if (n.lvl === 1 && !isLive) {
          n.lvl = 2;
          loadDrawing(m.slug, 5 - rank / nearCap)
            .then((svgText) => {
              if (S.nodes.get(m.key) !== n || n.lvl !== 2 || S.live[m.key]) return;
              n.content.innerHTML = svgText;
              n.lvl = 3;
              n.drawBytes = svgText.length * 2;
              n.g.classList.remove("pending");
              // GPU tier: cross-fade from the sprite / pyramid to the drawing
              requestAnimationFrame(() => n.g.classList.add("on"));
              S.dirty = true;
              n.slot.style.filter = `drop-shadow(0 0 .8px ${rgba(m.edge, 0.75)})`;
              if (!n.pinned) {
                pin(m.slug);
                n.pinned = true;
              }
            })
            .catch(() => {
              if (n.lvl === 2) n.lvl = 1;
            });
        }
      } else if (n.lvl > 1 && !isLive && lifted !== m.key) {
        // back to the thumbnail: drawings are heavy DOM
        if (n.pinned) unpin(m.slug);
        n.pinned = false;
        n.lvl = 1;
        n.drawBytes = 0;
        n.slot.style.filter = "";
        if (!thumbContent(n.content, m)) n.g.classList.add("pending");
      }
    }

    // prefetch: neighbours just outside the view when close, the view itself when approaching
    const px = MACHINE_S0 * MACHINE_W * cam.z * dpr;
    if (!frozen && S.assetsReady && px > NEAR_DEV_PX * 0.6) {
      const budget = CAPS.prefetch();
      let picked = 0;
      const tryPf = (m: WMachine) => {
        if (picked >= budget || !hasModule(m.slug, m.live) || isCached(m.slug) || keepSlugs.has(m.slug)) return;
        keepSlugs.add(m.slug);
        prefetch(m.slug);
        picked++;
      };
      if (lod === "mid") (gpuT ? [] : want.slice(0, nearCap)).forEach(tryPf);
      else {
        const ring = grid
          .query(vx0 - hw, vy0 - hh, vx1 + hw, vy1 + hh)
          .map((i) => model.machines[i]!)
          .filter((m) => !wantKeys.has(m.key));
        const dist = (m: WMachine) => (m.b[0] - cam.x) ** 2 + (m.b[1] - cam.y) ** 2;
        ring.sort((a, b) => dist(a) - dist(b));
        for (const m of ring) {
          if (picked >= budget) break;
          tryPf(m);
        }
      }
    }
    // anything queued that is no longer wanted never downloads
    if (!frozen) cancelQueued((slug) => keepSlugs.has(slug));

    // running machines that left the screen are stopped
    for (const k of [...S.runOrder]) if (!wantKeys.has(k) && k !== lifted) stopLive(k);

    const ls = loaderStats();
    S.maxLoaded = Math.max(S.maxLoaded, ls.cached);
    S.maxNodes = Math.max(S.maxNodes, S.nodes.size);
    let nearNow = 0;
    S.nodes.forEach((n) => (nearNow += n.lvl === 3 ? 1 : 0));
    S.maxNear = Math.max(S.maxNear, nearNow);

    if (gpuT) {
      // machines the DOM layer is drawing right now: the canvas erases their resting
      // copy and draws no sprite or snapshot for them (until then it keeps showing them)
      const live = new Set<string>();
      S.nodes.forEach((n, k) => {
        if (n.lvl === 3 && (typeof S.live[k] === "object" || lifted === k)) live.add(k);
      });
      gpuT.rebuild(cam, W, H, live, snaps);
    }
  }, [grid, model, ensureNode, removeNode, stopLive, bake]);

  // ---------- live machines ----------
  const runMachine = useCallback((m: WMachine) => {
    const S = st.current;
    const node = ensureNode(m);
    const cur = S.live[m.key];
    if (cur && typeof cur === "object") {
      cur.hook()?.startTest();
      return;
    }
    if (cur === "loading") return;
    if (!hasModule(m.slug, m.live)) {
      // the machine's live render is not shipped with the app yet: keep its picture (or blueprint) and say so
      S.status[m.key] = "This machine's live render is on its way. For now you are looking at its picture.";
      setStatusTick((n) => n + 1);
      return;
    }
    const content = node?.content;
    const stubs = stubRef.current;
    if (!node || !content || !stubs) return;
    S.live[m.key] = "loading";
    S.status[m.key] = "Loading the machine…";
    setStatusTick((n) => n + 1);
    let stub = stubs.querySelector<HTMLElement>(`[data-stub="${m.key}"]`);
    if (!stub) {
      stub = document.createElement("div");
      stub.dataset.stub = m.key;
      stubs.appendChild(stub);
    }
    mountLive(content, stub, m)
      .then((lm) => {
        if (S.nodes.get(m.key) !== node || S.live[m.key] !== "loading") {
          // the machine left the screen while it loaded
          lm.dispose();
          return;
        }
        node.lvl = 3;
        node.g.classList.remove("pending");
        node.g.classList.add("on", "live");
        node.slot.style.filter = `drop-shadow(0 0 .8px ${rgba(m.edge, 0.75)})`;
        S.live[m.key] = lm;
        S.runOrder.push(m.key);
        // only a few machines run at once: stop the oldest (never the enlarged one)
        const runCap = Math.min(CAPS.running(), S.gpu?.settings.liveCap ?? Infinity);
        while (S.runOrder.length > runCap) {
          const old = S.runOrder.find((k) => k !== m.key && k !== S.lifted?.key);
          if (!old) break;
          stopLive(old);
        }
        const stEl = lm.statusEl;
        if (stEl) {
          // mirror the machine's own status line into the tag
          const mo = new MutationObserver(() => {
            S.status[m.key] = stEl.textContent ?? "";
            setStatusTick((n) => n + 1);
          });
          mo.observe(stEl, { childList: true, characterData: true, subtree: true });
          S.observers.push(mo);
          S.status[m.key] = stEl.textContent ?? "";
        }
        lm.hook()?.startTest();
        setStatusTick((n) => n + 1);
      })
      .catch(() => {
        S.live[m.key] = undefined;
        S.status[m.key] = "Could not load this machine.";
        setStatusTick((n) => n + 1);
      });
  }, [ensureNode, stopLive]);

  const select = useCallback(
    (s: Sel) => {
      const S = st.current;
      const svg = svgRef.current;
      svg?.querySelectorAll(".sel").forEach((e) => e.classList.remove("sel"));
      S.sel = s;
      setSelState(s);
      // GPU tier: paper tiles are pyramid pixels, so the selection is one outline
      const gsel = svg?.querySelector<SVGPolygonElement>("#gsel");
      if (gsel) {
        const t = s?.kind === "tile" ? model.domains[s.d]?.tiles.find((x) => x.id === s.id) : undefined;
        gsel.setAttribute("points", t ? tileOutline(t.cx, t.cy) : "");
      }
      if (!s) {
        if (S.lifted) {
          dropLift(420);
          if (S.homeCam) {
            const hc = S.homeCam;
            S.homeCam = null;
            flyTo(hc, 760);
          }
        }
        return;
      }
      if (s.kind === "tile") svg?.querySelector(`.tile[data-id="${s.id}"]`)?.classList.add("sel");
      if (s.kind === "mach") svg?.querySelector(`.mach[data-m="${s.key}"]:not(#lshell)`)?.classList.add("sel");
    },
    [dropLift, flyTo, model],
  );

  // tapping any machine: fly in, lift it, run it; tapping the enlarged machine again re-runs it
  const tapMachine = useCallback(
    (m: WMachine, instant = false) => {
      const S = st.current;
      if (S.lifted && S.lifted.key === m.key) {
        runMachine(m);
        return;
      }
      setCurKey(m.key);
      if (tipRef.current) tipRef.current.style.display = "none";
      if (S.lifted) dropLift(0);
      else S.homeCam = { ...S.cam };
      ensureNode(m);
      const geo = liftUp(m, instant);
      select({ kind: "mach", key: m.key, d: m.d, at: m.at, lift: true });
      runMachine(m);
      if (instant || reducedMotion()) {
        S.cam.z = geo.z;
        S.cam.x = geo.x;
        S.cam.y = geo.y;
        apply();
      } else flyTo({ z: geo.z, x: geo.x, y: geo.y }, 820);
    },
    [apply, dropLift, ensureNode, flyTo, liftUp, runMachine, select],
  );

  const goDomain = useCallback(
    (i: number) => {
      const d = model.domains[i];
      select(null);
      if (d.machines[0]) setCurKey(d.machines[0].key);
      flyTo(viewOf(i));
    },
    [flyTo, model, select, viewOf],
  );

  const nextMachine = useCallback(() => {
    if (!model.tour.length) return;
    const i = curKey ? model.tour.indexOf(curKey) : -1;
    const m = model.machineByKey[model.tour[(i + 1) % model.tour.length]];
    if (m) tapMachine(m);
  }, [curKey, model, tapMachine]);

  // ---------- mount: input, first view, level-of-detail loop ----------
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const S = st.current;
    // No machine is drawn or downloaded up front: the far level of detail is in the
    // static scene, and the loop below adds nodes for what is on screen once the
    // asset manifests (module + atlas URLs) are in.
    let alive = true;
    void loadAssetManifests().then(() => {
      if (!alive) return;
      S.assetsReady = true;
      S.dirty = true;
      setStatusTick((n) => n + 1);
    });
    // GPU tier: deck.gl on one canvas under the SVG (see gpu/deckTier.ts), lazy-loaded
    if (gpu && canvasRef.current && !S.gpu && !S.gpuPending) {
      const canvas = canvasRef.current;
      const dpr = window.devicePixelRatio || 1;
      S.gpuPending = true;
      const fallBack = () => {
        S.gpuPending = false;
        S.gpu?.dispose();
        S.gpu = null;
        delete svg.dataset.renderer;
        setGpu(false);
      };
      void import("./gpu/deckTier")
        .then(({ DeckTier }) => {
          if (!alive) return;
          const tier = DeckTier.create(canvas, model, grid, PYRAMID, FLIP, {
            phone: phoneClass(),
            dpr,
            reduced: reducedMotion(),
            pinQuality: pinnedQuality(window.location.hash),
            requestFrame: () => {
              S.camMoved = true;
            },
            onFail: fallBack,
          });
          S.gpuPending = false;
          if (!tier) {
            // no WebGL2 after all: the SVG renderer takes over
            fallBack();
            return;
          }
          S.gpu = tier;
          svg.dataset.renderer = "webgl2";
          tier.onQuality = (q) => {
            svg.dataset.q = String(q.level);
            S.dirty = true;
          };
          S.dirty = true;
          S.camMoved = true;
        })
        .catch((e) => {
          console.warn("[world] could not load the GPU tier, using the SVG renderer", e);
          fallBack();
        });
    }
    let lastLod = 0;
    let frames = 0;
    let fpsT = performance.now();
    const loop = (t: number) => {
      S.loopRaf = requestAnimationFrame(loop);
      frames++;
      if (t - fpsT >= 500) {
        S.fps = (frames * 1000) / (t - fpsT);
        frames = 0;
        fpsT = t;
      }
      // throttled: at most ~15 updates/s while the camera moves, a slow tick otherwise
      if ((S.dirty && t - lastLod > 66) || t - lastLod > 500) {
        lastLod = t;
        S.dirty = false;
        lodUpdate();
      }
      if (S.gpu) {
        S.gpu.frame(t, S.cam, window.innerWidth, window.innerHeight, S.camMoved);
        S.camMoved = false;
      }
    };
    S.loopRaf = requestAnimationFrame(loop);

    // test + review hooks (internal flag only): stats and camera control
    const hooks = {
      stats: () => {
        const ls = loaderStats();
        let near = 0;
        let drawBytes = 0;
        S.nodes.forEach((n) => {
          if (n.lvl === 3) near++;
          drawBytes += n.drawBytes;
        });
        const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        return {
          machines: model.machines.length,
          domains: model.domains.length,
          lod: S.lod,
          z: S.cam.z,
          fps: Math.round(S.fps * 10) / 10,
          liveNodes: S.nodes.size,
          nearNodes: near,
          running: S.runOrder.length,
          loadedModules: ls.cached,
          maxLoadedModules: S.maxLoaded,
          maxNodes: S.maxNodes,
          maxNear: S.maxNear,
          memEstimateMB: Math.round(((ls.cachedBytes + drawBytes + S.nodes.size * 3000) / 1048576) * 10) / 10,
          heapMB: mem ? Math.round((mem.usedJSHeapSize / 1048576) * 10) / 10 : null,
          loader: ls,
          renderer: S.gpu ? "webgl2" : S.gpuPending ? "webgl2-loading" : "svg",
          gpu: S.gpu?.stats() ?? null,
        };
      },
      /** baker: true once everything in view is drawn (bowls, drawings, pictures) */
      bakeIdle: () => {
        if (S.bowlBusy || S.dirty) return false;
        const ls = loaderStats();
        if (ls.inflight || ls.queued) return false;
        for (const n of S.nodes.values()) if (n.lvl === 2) return false;
        return true;
      },
      cam: () => ({ ...S.cam }),
      setCam: (x: number, y: number, z: number) => {
        cancelAnimationFrame(S.flyRaf);
        S.cam = { x, y, z: bake ? z : clampZ(z) };
        apply();
      },
      fingerprint: () => baseFp,
      fit: () => {
        fitAll();
        apply();
      },
      domainView: (i: number) => (model.domains[i] ? viewOf(i) : null),
      bounds: () => model.bounds,
    };
    (window as unknown as Record<string, unknown>).__cgwWorld = hooks;

    // first view: the island of the first domain with machines (or the largest island);
    // #overview, #m=<key>, &run=<key>, &list are review/screenshot hooks
    const q = window.location.hash.slice(1);
    const firstBuilt = model.domains.findIndex((d) => d.machines.length);
    if (q.split("&").includes("overview") || !model.domains.length) {
      fitAll();
      setSideOpen(true);
    } else S.cam = { ...viewOf(firstBuilt >= 0 ? firstBuilt : 0) };
    apply();
    let hashDomain = firstBuilt >= 0 ? firstBuilt : 0;
    for (const part of q.split("&")) {
      const [k, v] = part.split("=");
      if (k === "m" && v && model.machineByKey[v]) {
        setCurKey(v);
        hashDomain = model.machineByKey[v].d;
        S.cam = { ...viewOf(hashDomain) };
        apply();
      }
      // v9: &zoom=F zooms F x into the current island, centred on its centre tile
      if (k === "zoom" && model.domains[hashDomain]) {
        const f = Number(v);
        const d = model.domains[hashDomain];
        S.cam = { z: clampZ(S.cam.z * (Number.isFinite(f) && f > 0 ? f : 1)), x: d.c[0], y: d.c[1] };
        apply();
      }
      // &run waits for the asset manifests, so a module that does not ship shows
      // "render pending" instead of being requested (and failing) before they land
      if (k === "run" && v && model.machineByKey[v]) {
        const m = model.machineByKey[v];
        void loadAssetManifests().then(() => {
          if (alive) tapMachine(m, true);
        });
      }
      if (k === "list") setSideOpen(true);
    }

    // ---- input: pan (mouse/touch), zoom (wheel/pinch), click ----
    const ptrs = new Map<number, Vec2>();
    let moved = 0;
    let start: { x: number; y: number; cx: number; cy: number } | null = null;
    let pinch: { d: number; z: number; m: Vec2; x: number; y: number } | null = null;
    const W = () => window.innerWidth;
    const H = () => window.innerHeight;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || e.isPrimary) ptrs.clear();
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      moved = 0;
      start = { x: S.cam.x, y: S.cam.y, cx: e.clientX, cy: e.clientY };
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = {
          d: Math.hypot(a[0] - b[0], a[1] - b[1]),
          z: S.cam.z,
          m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
          x: S.cam.x,
          y: S.cam.y,
        };
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId) || !start) return;
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 2 && pinch) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const mm: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const z = clampZ((pinch.z * d) / pinch.d);
        const wx = pinch.x + (pinch.m[0] - W() / 2) / pinch.z;
        const wy = pinch.y + (pinch.m[1] - H() / 2) / pinch.z;
        S.cam.z = z;
        S.cam.x = wx - (mm[0] - W() / 2) / z;
        S.cam.y = wy - (mm[1] - H() / 2) / z;
        moved = 99;
        apply();
        return;
      }
      const dx = e.clientX - start.cx;
      const dy = e.clientY - start.cy;
      if (Math.hypot(dx, dy) > 4) {
        moved = Math.hypot(dx, dy);
        svg.classList.add("drag");
      }
      if (moved) {
        cancelAnimationFrame(S.flyRaf);
        S.cam.x = start.x - dx / S.cam.z;
        S.cam.y = start.y - dy / S.cam.z;
        apply();
      }
    };
    const onUp = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (!ptrs.size) svg.classList.remove("drag");
      if (ptrs.size === 1) {
        const [p] = [...ptrs.values()];
        start = { x: S.cam.x, y: S.cam.y, cx: p[0], cy: p[1] };
      }
    };
    const onLost = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
    };
    const onClickCapture = (e: MouseEvent) => {
      if (moved > 4) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelAnimationFrame(S.flyRaf);
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016));
      const z = clampZ(S.cam.z * f);
      const wx = S.cam.x + (e.clientX - W() / 2) / S.cam.z;
      const wy = S.cam.y + (e.clientY - H() / 2) / S.cam.z;
      S.cam.z = z;
      S.cam.x = wx - (e.clientX - W() / 2) / z;
      S.cam.y = wy - (e.clientY - H() / 2) / z;
      apply();
    };
    const tileById = new Map(model.domains.flatMap((d) => d.tiles.map((t) => [t.id, t] as const)));
    const tileAt = (wx: number, wy: number) => {
      for (const d of model.domains) {
        const b = d.bb;
        if (wx < b[0] || wx > b[2] || wy < b[1] || wy > b[3]) continue;
        const t = d.tiles.find((x) => inTile(wx, wy, x.cx, x.cy));
        if (t) return t;
      }
      return undefined;
    };
    // pointer capture retargets click to the svg, so hit-test the point itself
    const hit = (x: number, y: number, fallback: EventTarget | null): Element | null => {
      const tg = (document.elementFromPoint(x, y) || fallback) as Element | null;
      return tg && typeof tg.closest === "function" ? tg : null;
    };
    const onClick = (e: MouseEvent) => {
      const tg = hit(e.clientX, e.clientY, e.target);
      const mg = tg?.closest<SVGGElement>(".mach");
      const t = tg?.closest<SVGGElement>(".tile");
      let m = mg?.dataset.m ? model.machineByKey[mg.dataset.m] : undefined;
      const wx = S.cam.x + (e.clientX - W() / 2) / S.cam.z;
      const wy = S.cam.y + (e.clientY - H() / 2) / S.cam.z;
      // GPU tier: no DOM per machine, so ask deck.gl's GPU picking (frontmost body wins)
      if (!m && S.gpu && S.lod !== "far") m = S.gpu.pick(e.clientX, e.clientY) ?? undefined;
      // far level of detail: machines are plates in one path, so pick the nearest plate
      if (!m && S.lod === "far") m = grid.nearest(wx, wy, Math.max(220, 10 / S.cam.z)) ?? undefined;
      if (m) {
        if (tipRef.current) tipRef.current.style.display = "none";
        tapMachine(m);
        return;
      }
      const tile = (t?.dataset.id ? tileById.get(t.dataset.id) : undefined) ?? (S.gpu ? tileAt(wx, wy) : undefined);
      if (tile) {
        select({ kind: "tile", id: tile.id, d: tile.d, at: tile.at });
        return;
      }
      select(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (S.lifted || S.sel)) select(null);
    };
    const onSvgKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const mg = (e.target as Element | null)?.closest?.<SVGGElement>(".mach");
      const m = mg?.dataset.m ? model.machineByKey[mg.dataset.m] : undefined;
      if (m) {
        e.preventDefault();
        tapMachine(m);
      }
    };
    // hover: the paper title for machines and paper tiles (mouse only)
    let tipRaf = 0;
    let tipEv: PointerEvent | null = null;
    const tipAt = () => {
      tipRaf = 0;
      const tip = tipRef.current;
      const ev = tipEv;
      if (!tip) return;
      if (!ev || svg.classList.contains("drag")) {
        tip.style.display = "none";
        return;
      }
      const tg = document.elementFromPoint(ev.clientX, ev.clientY);
      const mg = tg?.closest<SVGGElement>(".mach");
      const t = tg?.closest<SVGGElement>(".tile");
      let m = mg?.dataset.m ? model.machineByKey[mg.dataset.m] : undefined;
      let tile = t?.dataset.id ? tileById.get(t.dataset.id) : undefined;
      if (S.gpu && !m && !tile && S.lod !== "far") {
        const wx = S.cam.x + (ev.clientX - W() / 2) / S.cam.z;
        const wy = S.cam.y + (ev.clientY - H() / 2) / S.cam.z;
        m = S.gpu.pick(ev.clientX, ev.clientY) ?? undefined;
        if (!m) tile = tileAt(wx, wy);
      }
      let h = "";
      if (m)
        h = `<div class="k" style="--c:${m.accent}"><i></i>${escHtml(m.label)} · tap to run</div>${escHtml(m.paper.title)}`;
      else if (tile)
        h = `<div class="k" style="--c:#6c7082"><i></i>Paper · machine not generated</div>${escHtml(tile.paper.title)}`;
      if (!h) {
        tip.style.display = "none";
        return;
      }
      tip.innerHTML = h;
      tip.style.display = "block";
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      let x = ev.clientX + 16;
      let y = ev.clientY + 18;
      if (x + tw > W() - 10) x = ev.clientX - tw - 16;
      if (y + th > H() - 10) y = ev.clientY - th - 14;
      tip.style.left = x + "px";
      tip.style.top = y + "px";
    };
    const onHover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      tipEv = e;
      if (!tipRaf) tipRaf = requestAnimationFrame(tipAt);
    };
    const onLeave = () => {
      tipEv = null;
      if (tipRef.current) tipRef.current.style.display = "none";
    };
    const onResize = () => apply();

    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointermove", onHover);
    svg.addEventListener("pointerleave", onLeave);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);
    svg.addEventListener("lostpointercapture", onLost);
    svg.addEventListener("click", onClickCapture, true);
    svg.addEventListener("click", onClick);
    svg.addEventListener("wheel", onWheel, { passive: false });
    svg.addEventListener("keydown", onSvgKey);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      svg.removeEventListener("pointerdown", onDown);
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointermove", onHover);
      svg.removeEventListener("pointerleave", onLeave);
      svg.removeEventListener("pointerup", onUp);
      svg.removeEventListener("pointercancel", onUp);
      svg.removeEventListener("lostpointercapture", onLost);
      svg.removeEventListener("click", onClickCapture, true);
      svg.removeEventListener("click", onClick);
      svg.removeEventListener("wheel", onWheel);
      svg.removeEventListener("keydown", onSvgKey);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      alive = false;
      cancelAnimationFrame(S.loopRaf);
      for (const k of [...S.nodes.keys()]) removeNode(k);
      delete (window as unknown as Record<string, unknown>).__cgwWorld;
      cancelAnimationFrame(S.flyRaf);
      cancelAnimationFrame(S.bowlRaf);
      cancelAnimationFrame(S.liftRaf);
      cancelAnimationFrame(tipRaf);
      clearTimeout(S.bowlT);
      S.observers.forEach((o) => o.disconnect());
      S.observers = [];
      S.gpu?.dispose();
      S.gpu = null;
    };
    // Runs once per dataset (the parent remounts this view on a dataset swap).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // re-place the tag once React has rendered its new content
  useLayoutEffect(() => {
    place();
  }, [sel, statusTick, place]);

  // minimap: each island's top, projected like the world
  const mini = useMemo(() => {
    if (!model.domains.length) return [];
    const quads = model.domains.map((d) =>
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([a, b]) => at([d.C[0] + a * d.h, d.C[1] + b * d.h, 0])),
    );
    const all = quads.flat();
    const x0 = Math.min(...all.map((p) => p[0]));
    const x1 = Math.max(...all.map((p) => p[0]));
    const y0 = Math.min(...all.map((p) => p[1]));
    const y1 = Math.max(...all.map((p) => p[1]));
    const pad = 8;
    const sc = Math.min((150 - 2 * pad) / Math.max(1, x1 - x0), (92 - 2 * pad) / Math.max(1, y1 - y0));
    const ox = (150 - (x1 - x0) * sc) / 2;
    const oy = (92 - (y1 - y0) * sc) / 2;
    return model.domains.map((d, i) => ({
      d,
      points: pts(quads[i].map(([x, y]) => [ox + (x - x0) * sc, oy + (y - y0) * sc] as Vec2)),
    }));
  }, [model]);

  // ---------- render ----------
  const machinesBuilt = model.machines.length;
  const nextM = (() => {
    if (model.tour.length < 2) return null;
    const i = curKey ? model.tour.indexOf(curKey) : -1;
    return model.machineByKey[model.tour[(i + 1) % model.tour.length]] ?? null;
  })();
  const selDomain = sel ? model.domains[sel.d] : null;
  const selMachine = sel?.kind === "mach" ? model.machineByKey[sel.key] : null;
  const selTile = sel?.kind === "tile" ? (selDomain?.tiles.find((t) => t.id === sel.id) ?? null) : null;
  const meta = (p: { venue: string; year: number | null; citations: number }) =>
    `${p.venue || "—"} · ${p.year ?? "—"} · ${p.citations.toLocaleString()} cited`;

  return (
    <div ref={rootRef} className={"cgw" + (bake ? " bake" : "")}>
      <div className="cgw-frame">
        {gpu && <canvas ref={canvasRef} className="cgw-gl" aria-hidden="true" />}
        <svg
          ref={svgRef}
          className={"cgw-world" + (gpu ? " gl" : "")}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1600 1000"
          preserveAspectRatio="xMidYMid meet"
          role="application"
          aria-label={`Isometric world of ${author.name}'s research`}
        >
          <WorldScene model={model} gpu={gpu} />
        </svg>
        <div id="ov">
          {model.domains.map((d, i) => {
            const nm = d.machines.length;
            return (
              <div
                key={d.idx}
                ref={(el) => {
                  labelRefs.current[i] = el;
                }}
                className={"dl" + (nm ? " b" : "")}
                style={{ ["--lc" as string]: d.labelColor }}
              >
                <div className="n">
                  <i className={`ch ${d.mark}`} style={{ ["--c" as string]: d.accent }} />
                  {d.name}
                </div>
                <div className="s mono">
                  {d.papers.length} papers
                  {nm > 0 && (
                    <>
                      {" · "}
                      <i style={{ ["--c" as string]: d.accent }}>
                        {nm} machine{nm > 1 ? "s" : ""}
                      </i>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          <div className="leader" ref={leaderRef} />
          <div className="pdot" ref={pdotRef} />
          <div className="tag glass" ref={tagRef} style={{ display: sel ? "block" : "none" }}>
            {sel && (
              <button
                className="x"
                aria-label="Close"
                onClick={(e) => {
                  e.stopPropagation();
                  select(null);
                }}
              >
                ×
              </button>
            )}
            {selTile && selDomain && (
              <>
                <div className="k mono">
                  <i
                    className={`mk ${selDomain.mark}`}
                    style={{ width: 8, height: 8, background: selDomain.accent, display: "inline-block", opacity: 0.8 }}
                  />
                  {selDomain.name}
                </div>
                <div className="t">{selTile.paper.title}</div>
                <div className="m mono">{meta(selTile.paper)}</div>
                <button className="gen" disabled title="Generating new machines is not available in the app yet">
                  Generate this machine <span className="c">soon</span>
                </button>
              </>
            )}
            {selMachine && selDomain && (
              <>
                <div className="k mono">
                  <i
                    className={`mk ${selDomain.mark}`}
                    style={{
                      width: 8,
                      height: 8,
                      background: selMachine.accent,
                      boxShadow: `0 0 8px ${selMachine.accent}`,
                      display: "inline-block",
                    }}
                  />
                  {selMachine.label} · {hasModule(selMachine.slug, selMachine.live) ? "live" : "render pending"}
                </div>
                <div className="t">{selMachine.paper.title}</div>
                <div className="m mono">{meta(selMachine.paper)}</div>
                <div className="st" aria-live="polite">
                  {st.current.status[selMachine.key] || "Starting a test…"}
                </div>
              </>
            )}
          </div>
          <div id="tip" className="glass" ref={tipRef} />
        </div>

        <div className="hud-top">
          <div className="brand">Cosmograph</div>
          <div className="crumb glass mono">
            <b>{author.name}</b>
          </div>
          <a className="back glass mono" href={backHref}>
            ← Galaxy
          </a>
        </div>
        <div className="hud-stats glass mono">
          <div>
            <b>{model.paperCount}</b>papers
          </div>
          <div>
            <b>{machinesBuilt}</b>machine{machinesBuilt === 1 ? "" : "s"} built
          </div>
          <div>
            <b>{model.domains.length}</b>domains
          </div>
        </div>
        <div className={"side glass" + (sideOpen ? "" : " collapsed")}>
          <div className="h mono" onClick={() => setSideOpen((v) => !v)}>
            <span>Domains</span>
            <span>Papers</span>
          </div>
          <svg width="150" height="92" viewBox="0 0 150 92" aria-hidden="true">
            {mini.map(({ d, points }) => (
              <polygon
                key={d.idx}
                points={points}
                fill={d.machines.length ? d.accent : "#272933"}
                fillOpacity={d.machines.length ? 0.28 : 1}
                stroke={d.accent}
                strokeWidth={d.machines.length ? 1.2 : 0.8}
                style={{ cursor: "pointer" }}
                onClick={() => goDomain(d.idx)}
              />
            ))}
          </svg>
          <ul>
            {model.domains.map((d) => (
              <li
                key={d.idx}
                className={(sel?.d === d.idx ? "on" : "") + (d.machines.length ? "" : " lk")}
                onClick={() => goDomain(d.idx)}
              >
                <span>
                  <i className={`bd ${d.mark}`} style={{ ["--c" as string]: d.accent }} />
                  {d.name}
                </span>
                <span>{d.papers.length}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="legend glass mono">
          {machinesBuilt > 0 && (
            <span>
              <i className="sw lit" />
              Machine built · tap to run
            </span>
          )}
          <span>
            <i className="sw" />
            Paper · machine not generated yet
          </span>
        </div>
        <div className="pan glass mono">
          <span className="d">
            <i>Drag</i> to pan
          </span>
          <span className="d">
            <i>Scroll</i> to zoom
          </span>
          <span className="d">
            <i>Click</i> a tile or a machine
          </span>
          <span className="p">
            <i>Drag</i> · <i>pinch</i> · <i>tap</i>
          </span>
        </div>
        {nextM && (
          <button id="nextm" className="glass" style={{ ["--c" as string]: nextM.accent }} onClick={nextMachine}>
            Next machine <i />
            <b>{nextM.label.replace(/ machine$/, "")}</b>
            <span className="ar">→</span>
          </button>
        )}
        <div className="zoom">
          <button
            aria-label="Zoom in"
            onClick={() => {
              st.current.cam.z = clampZ(st.current.cam.z * 1.3);
              apply();
            }}
          >
            +
          </button>
          <button
            aria-label="Zoom out"
            onClick={() => {
              st.current.cam.z = clampZ(st.current.cam.z / 1.3);
              apply();
            }}
          >
            −
          </button>
          <button
            aria-label="Show the whole world"
            style={{ fontSize: 10, fontFamily: '"Space Mono",monospace' }}
            onClick={() => {
              fitAll();
              apply();
            }}
          >
            ALL
          </button>
        </div>
        <div className="stub" ref={stubRef} aria-hidden="true" />
      </div>
    </div>
  );
}
