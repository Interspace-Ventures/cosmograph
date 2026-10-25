// The isometric researcher world: one island per research domain, one tile per
// paper, and a live machine on every paper that has one. Ported from the
// approved v8 mockup. Camera, bowls, labels and the machine lift are imperative
// (refs + rAF) so pan and zoom never re-render React; selection, the tag and the
// HUD are React state.

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { galaxyData, papersByDomain } from "@/data/galaxy";
import { buildWorld, type WMachine, type WorldModel } from "./model";
import { WorldScene } from "./WorldScene";
import { renderBowl } from "./bowl";
import { hex2rgb, rgba } from "./color";
import {
  at,
  MACHINE_C,
  MACHINE_H,
  MACHINE_PO,
  MACHINE_S0,
  MACHINE_W,
  pts,
  THUMB_BOX,
  THUMB_PX,
  type Vec2,
} from "./iso";
import { loadMachine, mountLive, thumbUrl, type LiveMachine } from "./machineRuntime";
import "./world.css";

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

const SVGNS = "http://www.w3.org/2000/svg";
const phone = () => window.innerWidth <= 560;
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const escHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function WorldView({ backHref }: { backHref: string }) {
  // Built from the active dataset; the parent remounts this view on a dataset swap.
  const model = useMemo<WorldModel>(() => buildWorld(galaxyData, papersByDomain), []);
  const author = galaxyData.author;

  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
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
    content: {} as Record<string, SVGGElement>,
    slot: {} as Record<string, SVGGElement>,
    lvl: {} as Record<string, 0 | 1 | 2>,
    live: {} as Record<string, LiveMachine | "loading" | undefined>,
    status: {} as Record<string, string>,
    lifted: null as null | { key: string; L: number; rise: number; t: number },
    liftRaf: 0,
    liftFin: null as null | (() => void),
    homeCam: null as Cam | null,
    observers: [] as MutationObserver[],
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
      el.style.display = vis ? "block" : "none";
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
            for (const o of obst) sc += (120 * ov2(r, o)) / A;
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
    const step = () => {
      const i = S.bowlQueue.shift();
      if (i === undefined) return;
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

  // upgrade a visible thumbnail to the machine's full drawing once it is drawn bigger than the thumbnail
  const upgradeVisible = useCallback(() => {
    const S = st.current;
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth;
    const H = window.innerHeight;
    for (const m of model.machines) {
      if (S.lvl[m.key]) continue;
      const c = S.content[m.key];
      const im = c?.querySelector("image.mthumb");
      if (!c || !im) continue;
      const r = im.getBoundingClientRect();
      if (r.right < -50 || r.left > W + 50 || r.bottom < -50 || r.top > H + 50) continue;
      if (r.width * dpr > THUMB_PX * 1.15) {
        S.lvl[m.key] = 1;
        loadMachine(m.slug)
          .then((mod) => {
            if (S.lvl[m.key] === 1) c.innerHTML = mod.svg;
          })
          .catch(() => {
            S.lvl[m.key] = 0;
          });
      }
    }
  }, [model]);

  const bowlsLater = useCallback(() => {
    const S = st.current;
    clearTimeout(S.bowlT);
    S.bowlT = setTimeout(() => {
      bowlsUpdate();
      upgradeVisible();
    }, 140);
  }, [bowlsUpdate, upgradeVisible]);

  const apply = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const cam = st.current.cam;
    cam.x = Math.max(BX0, Math.min(BX1, cam.x));
    cam.y = Math.max(BY0, Math.min(BY1, cam.y));
    // auras only in the wide view (gone by z = .2); planet tint full in the overview,
    // ~75% in the island view, ~35% with a machine enlarged, neutral by z = .5
    const a = Math.max(0, Math.min(1, (0.2 - cam.z) / 0.1));
    svg.style.setProperty("--aura", a.toFixed(3));
    svg.classList.toggle("noaura", a < 0.01);
    const tn = Math.max(0, Math.min(1, (0.5 - cam.z) / 0.42));
    svg.style.setProperty("--tint", (tn * tn * (3 - 2 * tn)).toFixed(3));
    const w = window.innerWidth / cam.z;
    const h = window.innerHeight / cam.z;
    svg.setAttribute(
      "viewBox",
      `${(cam.x - w / 2).toFixed(1)} ${(cam.y - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`,
    );
    place();
    bowlsLater();
  }, [BX0, BX1, BY0, BY1, place, bowlsLater]);

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

  // ---------- live machines ----------
  const runMachine = useCallback((m: WMachine) => {
    const S = st.current;
    const cur = S.live[m.key];
    if (cur && typeof cur === "object") {
      cur.hook()?.startTest();
      return;
    }
    if (cur === "loading") return;
    const content = S.content[m.key];
    const stubs = stubRef.current;
    if (!content || !stubs) return;
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
        S.lvl[m.key] = 2;
        S.live[m.key] = lm;
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
  }, []);

  const select = useCallback(
    (s: Sel) => {
      const S = st.current;
      const svg = svgRef.current;
      svg?.querySelectorAll(".sel").forEach((e) => e.classList.remove("sel"));
      S.sel = s;
      setSelState(s);
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
    [dropLift, flyTo],
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
    [apply, dropLift, flyTo, liftUp, runMachine, select],
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

  // ---------- mount: machine thumbnails, input, first view ----------
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const S = st.current;
    // each machine's drawing lives in an imperative <g> so it can travel to the lift layer
    svg.querySelectorAll<SVGGElement>("g.mpos[data-slot]").forEach((slot) => {
      const key = slot.dataset.slot!;
      const m = model.machineByKey[key];
      if (!m || S.content[key]) return;
      const g = document.createElementNS(SVGNS, "g") as SVGGElement;
      g.setAttribute("class", "mcontent");
      const im = document.createElementNS(SVGNS, "image");
      im.setAttribute("class", "mthumb");
      im.setAttribute("href", thumbUrl(m.slug));
      im.setAttribute("x", String(THUMB_BOX.x));
      im.setAttribute("y", String(THUMB_BOX.y));
      im.setAttribute("width", String(THUMB_BOX.w));
      im.setAttribute("height", String(THUMB_BOX.h));
      im.setAttribute("preserveAspectRatio", "none");
      g.appendChild(im);
      slot.appendChild(g);
      S.slot[key] = slot;
      S.content[key] = g;
    });

    // first view: the island of the first domain with machines (or the largest island);
    // #overview, #m=<key>, &run=<key>, &list are review/screenshot hooks
    const q = window.location.hash.slice(1);
    const firstBuilt = model.domains.findIndex((d) => d.machines.length);
    if (q.startsWith("overview") || !model.domains.length) {
      fitAll();
      setSideOpen(true);
    } else S.cam = { ...viewOf(firstBuilt >= 0 ? firstBuilt : 0) };
    apply();
    for (const part of q.split("&")) {
      const [k, v] = part.split("=");
      if (k === "m" && v && model.machineByKey[v]) {
        setCurKey(v);
        S.cam = { ...viewOf(model.machineByKey[v].d) };
        apply();
      }
      if (k === "run" && v && model.machineByKey[v]) tapMachine(model.machineByKey[v], true);
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
    // pointer capture retargets click to the svg, so hit-test the point itself
    const hit = (x: number, y: number, fallback: EventTarget | null): Element | null => {
      const tg = (document.elementFromPoint(x, y) || fallback) as Element | null;
      return tg && typeof tg.closest === "function" ? tg : null;
    };
    const onClick = (e: MouseEvent) => {
      const tg = hit(e.clientX, e.clientY, e.target);
      const mg = tg?.closest<SVGGElement>(".mach");
      const t = tg?.closest<SVGGElement>(".tile");
      const m = mg?.dataset.m ? model.machineByKey[mg.dataset.m] : undefined;
      if (m) {
        if (tipRef.current) tipRef.current.style.display = "none";
        tapMachine(m);
        return;
      }
      const tile = t?.dataset.id ? tileById.get(t.dataset.id) : undefined;
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
      const m = mg?.dataset.m ? model.machineByKey[mg.dataset.m] : undefined;
      const tile = t?.dataset.id ? tileById.get(t.dataset.id) : undefined;
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
      cancelAnimationFrame(S.flyRaf);
      cancelAnimationFrame(S.bowlRaf);
      cancelAnimationFrame(S.liftRaf);
      cancelAnimationFrame(tipRaf);
      clearTimeout(S.bowlT);
      S.observers.forEach((o) => o.disconnect());
      S.observers = [];
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
    <div ref={rootRef} className="cgw">
      <div className="cgw-frame">
        <svg
          ref={svgRef}
          className="cgw-world"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1600 1000"
          preserveAspectRatio="xMidYMid meet"
          role="application"
          aria-label={`Isometric world of ${author.name}'s research`}
        >
          <WorldScene model={model} />
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
                        {nm} machine{nm > 1 ? "s" : ""} live
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
                  {selMachine.label} · live
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
