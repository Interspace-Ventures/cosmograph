// Synthetic stress worlds for the /world view (review hook `#stress=<n>`, internal
// flag only). Tiles copies of the real archipelago on a grid until it holds n
// machines, so layout, islands, bowls, labels and machines are all exercised at
// scale. Copies reuse the real machines' slugs, so their modules and atlas cells
// are the real assets (the network sees at most the 341 distinct modules).

import { at, ISLAND_Z, PITCH, type Vec2 } from "./iso";
import type { WDomain, WMachine, WorldModel } from "./model";

export const STRESS_MAX = 50_000;

/** `#stress=5000` -> 5000 (clamped), otherwise 0. */
export function stressCount(hash: string): number {
  const m = /(?:^|[#&])stress=(\d+)/.exec(hash);
  if (!m) return 0;
  return Math.max(0, Math.min(STRESS_MAX, Number(m[1])));
}

export function stressWorld(base: WorldModel, n: number): WorldModel {
  const perCopy = base.machines.length;
  if (!perCopy || n <= 0) return base;
  const copies = Math.ceil(n / perCopy);
  // plan-space extent of the real world
  let px0 = Infinity;
  let py0 = Infinity;
  let px1 = -Infinity;
  let py1 = -Infinity;
  for (const d of base.domains) {
    px0 = Math.min(px0, d.C[0] - d.h);
    py0 = Math.min(py0, d.C[1] - d.h);
    px1 = Math.max(px1, d.C[0] + d.h);
    py1 = Math.max(py1, d.C[1] + d.h);
  }
  const gap = 6 * PITCH;
  const stepX = px1 - px0 + gap;
  const stepY = py1 - py0 + gap;
  const cols = Math.ceil(Math.sqrt(copies));
  const o0 = at([0, 0, 0]);
  const shiftOf = (dx: number, dy: number): Vec2 => {
    const p = at([dx, dy, 0]);
    return [p[0] - o0[0], p[1] - o0[1]];
  };
  const mv = (p: Vec2, s: Vec2): Vec2 => [p[0] + s[0], p[1] + s[1]];

  const domains: WDomain[] = [];
  const machines: WMachine[] = [];
  const order: number[] = [];
  const cells = Array.from({ length: copies }, (_, k) => ({ k, gx: k % cols, gy: Math.floor(k / cols) }));
  // paint copies back to front (iso depth = gx + gy)
  cells.sort((a, b) => a.gx + a.gy - (b.gx + b.gy) || a.gy - b.gy);
  let left = n;
  for (const { k, gx, gy } of cells) {
    const dx = gx * stepX;
    const dy = gy * stepY;
    const s = shiftOf(dx, dy);
    const idxMap = new Map<number, number>();
    for (const bi of base.order) {
      if (left <= 0) break;
      const d = base.domains[bi];
      const idx = domains.length;
      idxMap.set(bi, idx);
      const ms: WMachine[] = [];
      for (const m of d.machines) {
        if (left <= 0) break;
        left--;
        ms.push({
          ...m,
          key: k ? `${m.key}~${k}` : m.key,
          d: idx,
          cx: m.cx + dx,
          cy: m.cy + dy,
          at: mv(m.at, s),
          b: mv(m.b, s),
          g0: mv(m.g0, s),
        });
      }
      const copy: WDomain = {
        ...d,
        idx,
        name: k ? `${d.name} · ${k + 1}` : d.name,
        C: [d.C[0] + dx, d.C[1] + dy],
        O: [d.O[0] + dx, d.O[1] + dy],
        hull: d.hull.map((p) => mv(p, s)),
        bb: [d.bb[0] + s[0], d.bb[1] + s[1], d.bb[2] + s[0], d.bb[3] + s[1]],
        tiles: d.tiles.map((t) => ({ ...t, id: k ? `${t.id}~${k}` : t.id, d: idx, cx: t.cx + dx, cy: t.cy + dy, at: mv(t.at, s) })),
        machines: ms,
        plots: d.plots.map((p) => [p[0] + dx, p[1] + dy] as Vec2),
        o: mv(d.o, s),
        c: mv(d.c, s),
        top: mv(d.top, s),
        front: mv(d.front, s),
        mk: mv(d.mk, s),
        box: [d.box[0] + s[0], d.box[1] + s[0]],
        by: [d.by[0] + s[1], d.by[1] + s[1]],
      };
      domains.push(copy);
      machines.push(...ms);
      order.push(idx);
    }
    if (left <= 0) break;
  }
  let BX0 = Infinity;
  let BY0 = Infinity;
  let BX1 = -Infinity;
  let BY1 = -Infinity;
  for (const d of domains) {
    BX0 = Math.min(BX0, d.bb[0]);
    BY0 = Math.min(BY0, d.bb[1] - 900);
    BX1 = Math.max(BX1, d.bb[2]);
    BY1 = Math.max(BY1, d.bb[3]);
  }
  // a sparse star field over the whole extent (bounded count)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const stars = Array.from({ length: Math.min(2400, 300 + copies * 40) }, () => ({
    x: Math.round(BX0 + rnd() * (BX1 - BX0)),
    y: Math.round(BY0 + rnd() * (BY1 - BY0)),
    r: rnd() > 0.95 ? 2.4 : 1.4,
    o: Math.round((0.15 + rnd() * 0.4) * 100) / 100,
  }));
  void ISLAND_Z;
  return {
    curated: base.curated,
    domains,
    order,
    machines,
    machineByKey: Object.fromEntries(machines.map((m) => [m.key, m])),
    tour: machines.map((m) => m.key),
    links: [],
    stars,
    bounds: [BX0, BY0, BX1, BY1],
    paperCount: domains.reduce((t, d) => t + d.papers.length, 0),
  };
}
