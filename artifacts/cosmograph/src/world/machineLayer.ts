// Level of detail for the /world view's machines, so the world scales to
// thousands of machines without drawing or downloading them all.
//
//   far  : every machine is a plate in its island's single `mdots` path, plus the
//          island aura (WorldScene). No per-machine DOM at all.
//   mid  : machines in view get a node: footprint + their atlas thumbnail (one
//          shared sprite sheet per ~64 machines, so a few requests in total).
//   near : the closest machines in view swap the thumbnail for their own drawing,
//          fetched through the queued, budgeted loader (machineRuntime).
//   live : a tapped machine runs its script; only a few run at once and any that
//          leave the screen are stopped.
//
// The choice is made by on-screen size, once per (throttled) frame, from a
// uniform grid over machine positions, so the per-frame cost follows what is
// on screen rather than the size of the world.

import { ISLAND_Z, MACHINE_S0, MACHINE_W, THUMB_BOX, machineTransform, planOutline } from "./iso";
import { sprite } from "./assets";
import { phoneClass } from "./machineRuntime";
import type { WMachine } from "./model";

const SVGNS = "http://www.w3.org/2000/svg";

/** On-screen machine width (CSS px) below which machines are plates only. */
export const MID_PX = 34;
/** Device px of machine width above which the close-up drawing replaces the thumbnail (atlas cell is 240 px). */
export const NEAR_DEV_PX = 276;

export const CAPS = {
  /** machine nodes in the DOM (mid + near) */
  nodes: () => (phoneClass() ? 140 : 420),
  /** machines showing their full drawing */
  near: () => (phoneClass() ? 8 : 28),
  /** GPU tier: close-ups shown as static rasters on the canvas (only a tapped machine is DOM) */
  snapGpu: () => (phoneClass() ? 6 : 16),
  /** machines whose script runs at once */
  running: () => (phoneClass() ? 1 : 3),
  /** neighbours to prefetch per update */
  prefetch: () => (phoneClass() ? 2 : 6),
};

export type Lod = "far" | "mid" | "near";

export function lodFor(z: number, dpr: number): Lod {
  const px = MACHINE_S0 * MACHINE_W * z;
  if (px < MID_PX) return "far";
  return px * dpr > NEAR_DEV_PX ? "near" : "mid";
}

// ---------------- spatial grid ----------------

export class MachineGrid {
  private cells = new Map<number, number[]>();
  constructor(
    private machines: WMachine[],
    private size = 2400,
  ) {
    machines.forEach((m, i) => {
      const k = this.key(Math.floor(m.b[0] / size), Math.floor(m.b[1] / size));
      let c = this.cells.get(k);
      if (!c) this.cells.set(k, (c = []));
      c.push(i);
    });
  }
  private key(cx: number, cy: number) {
    return (cx + 32768) * 65536 + (cy + 32768);
  }
  /** indices of machines whose base point lies in the rect */
  query(x0: number, y0: number, x1: number, y1: number, out: number[] = []): number[] {
    const s = this.size;
    const cx0 = Math.floor(x0 / s);
    const cx1 = Math.floor(x1 / s);
    const cy0 = Math.floor(y0 / s);
    const cy1 = Math.floor(y1 / s);
    // a huge rect (zoomed far out) is cheaper as a full scan
    if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > this.cells.size * 2) {
      this.machines.forEach((m, i) => {
        if (m.b[0] >= x0 && m.b[0] <= x1 && m.b[1] >= y0 && m.b[1] <= y1) out.push(i);
      });
      return out;
    }
    for (let cx = cx0; cx <= cx1; cx++)
      for (let cy = cy0; cy <= cy1; cy++) {
        const c = this.cells.get(this.key(cx, cy));
        if (!c) continue;
        for (const i of c) {
          const m = this.machines[i]!;
          if (m.b[0] >= x0 && m.b[0] <= x1 && m.b[1] >= y0 && m.b[1] <= y1) out.push(i);
        }
      }
    return out;
  }
  /** the machine whose base point is nearest (x, y), within r */
  nearest(x: number, y: number, r: number): WMachine | null {
    let best: WMachine | null = null;
    let bd = r * r;
    for (const i of this.query(x - r, y - r, x + r, y + r)) {
      const m = this.machines[i]!;
      const d = (m.b[0] - x) ** 2 + (m.b[1] - y) ** 2;
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }
}

// ---------------- nodes ----------------

export interface MNode {
  m: WMachine;
  g: SVGGElement;
  slot: SVGGElement;
  content: SVGGElement;
  /** 1 thumbnail, 2 drawing requested, 3 drawing shown */
  lvl: 1 | 2 | 3;
  pinned: boolean;
  drawBytes: number;
}

/**
 * Blueprint stand-in for a machine whose picture has not arrived (machine units,
 * same projection as the machine drawings): a dashed plate and a wireframe block
 * in the domain accent.
 */
export function blueprintSvg(accent: string): string {
  const px = 300;
  const py = 239.781;
  const hw = 230;
  const hh = hw / 2;
  const up = 120;
  const dia = (y: number) => `${px - hw},${y} ${px},${y - hh} ${px + hw},${y} ${px},${y + hh}`;
  return (
    `<g class="blueprint" fill="none" stroke="${accent}" stroke-width="2" stroke-dasharray="7 6" opacity=".55">` +
    `<polygon points="${dia(py)}"/>` +
    `<polygon points="${dia(py - up)}" opacity=".7"/>` +
    `<path d="M${px - hw} ${py}V${py - up}M${px + hw} ${py}V${py - up}M${px} ${py + hh}V${py + hh - up}"/>` +
    `</g>`
  );
}

/** The mid level of detail: the machine's atlas cell, clipped by a nested svg viewport. */
export function thumbContent(content: SVGGElement, m: WMachine): boolean {
  content.textContent = "";
  const sp = sprite(m.slug);
  if (!sp) {
    content.innerHTML = blueprintSvg(m.accent);
    return false;
  }
  const vp = document.createElementNS(SVGNS, "svg");
  vp.setAttribute("class", "mthumb");
  vp.setAttribute("x", String(THUMB_BOX.x));
  vp.setAttribute("y", String(THUMB_BOX.y));
  vp.setAttribute("width", String(THUMB_BOX.w));
  vp.setAttribute("height", String(THUMB_BOX.h));
  vp.setAttribute("viewBox", `${sp.sx} ${sp.sy} ${sp.w} ${sp.h}`);
  vp.setAttribute("preserveAspectRatio", "none");
  vp.setAttribute("overflow", "hidden");
  const im = document.createElementNS(SVGNS, "image");
  im.setAttribute("href", sp.href);
  im.setAttribute("width", String(sp.sheetW));
  im.setAttribute("height", String(sp.sheetH));
  im.setAttribute("preserveAspectRatio", "none");
  vp.appendChild(im);
  content.appendChild(vp);
  return true;
}

/** A machine's node, inserted into its island's layer in depth order. */
export function createNode(layer: Element, m: WMachine, gpu = false): MNode {
  const g = document.createElementNS(SVGNS, "g") as SVGGElement;
  g.setAttribute("class", "mach rm iso built");
  g.setAttribute("data-theme", "dark");
  g.dataset.m = m.key;
  g.dataset.d = String(m.d);
  g.dataset.p = m.paper.id;
  const dep = m.cx + m.cy;
  g.dataset.dep = String(dep);
  g.setAttribute("tabindex", "0");
  g.setAttribute("role", "button");
  g.setAttribute("aria-label", `Run the machine: ${m.paper.title}`);
  const foot = document.createElementNS(SVGNS, "path");
  foot.setAttribute("class", "rfoot");
  foot.setAttribute("d", planOutline({ x: m.cx - 140, y: m.cy - 140, w: 280, d: 280, r: 10 }, ISLAND_Z));
  foot.setAttribute("stroke", m.accent);
  const slot = document.createElementNS(SVGNS, "g") as SVGGElement;
  slot.setAttribute("class", "mpos");
  slot.dataset.slot = m.key;
  slot.setAttribute("transform", machineTransform(m.cx, m.cy));
  // the 0.8px edge glow is invisible at thumbnail size and costly in bulk: drawings only
  const content = document.createElementNS(SVGNS, "g") as SVGGElement;
  content.setAttribute("class", "mcontent");
  // GPU tier: the node only ever holds the close-up drawing (the sprite / pyramid
  // underneath shows the machine until it arrives, then the node fades in)
  if (gpu) g.classList.add("gl");
  else if (!thumbContent(content, m)) g.classList.add("pending");
  slot.appendChild(content);
  g.append(foot, slot);
  // depth order within the island: nodes are few, a linear scan is fine
  let before: Element | null = null;
  for (const c of Array.from(layer.children)) {
    if (Number((c as SVGGElement).dataset.dep) > dep) {
      before = c;
      break;
    }
  }
  layer.insertBefore(g, before);
  return { m, g, slot, content, lvl: 1, pinned: false, drawBytes: 0 };
}
