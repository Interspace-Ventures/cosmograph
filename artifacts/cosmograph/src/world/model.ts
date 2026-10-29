// Builds the isometric world from the active researcher's dataset (galaxyData,
// the same OpenAlex snapshot / live fetch the galaxy uses). Nothing here names a
// researcher: when the dataset contains the papers of the curated overlay (the
// v9 mockup's 16 domains + 341 machines, keyed by OpenAlex work ids) the
// world uses it; otherwise it falls back to the dataset's own domains with paper
// tiles only.

import type { GalaxyData, Paper } from "@/data/galaxy";
import curatedRaw from "./data/curated.json";
import {
  at,
  convexOverlap,
  depth,
  ISLAND_Z,
  MZ0,
  PITCH,
  type Vec2,
} from "./iso";
import { bowlFromDepth, bowlHull, type BowlGeom } from "./bowl";
import { FALLBACK_ACCENTS, FALLBACK_MARKS, GLASS_HUES, hex2rgb, mixWhite } from "./color";

export type Mark = "sq" | "ci" | "di" | "tr";

interface CuratedDomain {
  slug: string;
  name: string;
  accent: string;
  mark: string;
  centreTile: number[];
  heroId: string;
  paperIds: string[];
}
interface CuratedMachine {
  key: string;
  slug: string;
  hook: string;
  status: string;
  button: string;
  label: string;
  accent: string;
  paperId: string;
  domain: string;
  /** v9: 0 centre, 1 ring-1, 2 ring-2 */
  ring?: number;
  /** v9: tile offset from the island centre, exported from the mockup's own placement */
  cell?: number[];
  /** v9: false when the machine's live module does not ship with the app (thumbnail + render-pending state) */
  live?: boolean;
}
interface Curated {
  domains: CuratedDomain[];
  similarity: number[][];
  machines: CuratedMachine[];
  tour: string[];
}
const curated = curatedRaw as Curated;

export interface WPaper {
  id: string;
  title: string;
  venue: string;
  year: number | null;
  citations: number;
  url: string;
}

export interface WMachine {
  key: string;
  slug: string;
  hook: string;
  status: string;
  button: string;
  label: string;
  accent: string;
  edge: string;
  paper: WPaper;
  d: number;
  /** 0 = the island's centre machine, 1 = ring-1, 2 = ring-2 */
  ring: number;
  /** whether the machine's live module is available; otherwise it shows its thumbnail and a pending state */
  live: boolean;
  /** plan centre of its tile */
  cx: number;
  cy: number;
  /** screen anchors */
  at: Vec2;
  b: Vec2;
  g0: Vec2;
}

export interface WTile {
  id: string;
  paper: WPaper;
  d: number;
  cx: number;
  cy: number;
  variant: number;
  at: Vec2;
}

export interface WDomain {
  idx: number;
  slug: string;
  name: string;
  accent: string;
  labelColor: string;
  mark: Mark;
  papers: WPaper[];
  hero: WPaper;
  cites: number;
  /** island centre in plan */
  C: Vec2;
  O: Vec2;
  side: number;
  h: number;
  hue: number;
  bowl: BowlGeom;
  hull: Vec2[];
  bb: [number, number, number, number];
  tiles: WTile[];
  machines: WMachine[];
  plots: Vec2[];
  /** screen anchors */
  o: Vec2;
  c: Vec2;
  top: Vec2;
  front: Vec2;
  mk: Vec2;
  box: [number, number];
  by: [number, number];
}

export interface WLink {
  a: number;
  b: number;
  p0: Vec2;
  p1: Vec2;
  opacity: number;
}

export interface WorldModel {
  curated: boolean;
  domains: WDomain[];
  order: number[];
  machines: WMachine[];
  machineByKey: Record<string, WMachine>;
  tour: string[];
  links: WLink[];
  stars: { x: number; y: number; r: number; o: number }[];
  bounds: [number, number, number, number];
  paperCount: number;
  /** stress worlds: screen offset of each copy of the base layout */
  copies?: Vec2[];
}

/**
 * Identity of a world's layout for its baked assets (deep-zoom pyramid): FNV-1a
 * over every machine's key and anchor, the islands and the bounds. A pyramid
 * baked for another dataset never matches, and the view falls back to SVG.
 */
export function worldFingerprint(w: WorldModel): string {
  let h = 0x811c9dc5;
  const add = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  for (const m of w.machines) add(`${m.key}|${Math.round(m.b[0])}|${Math.round(m.b[1])};`);
  for (const d of w.domains) add(`${d.slug}|${Math.round(d.C[0])}|${Math.round(d.C[1])}|${d.tiles.length};`);
  add(w.bounds.map((v) => Math.round(v)).join(","));
  return h.toString(16).padStart(8, "0");
}

const plain = (t: string) => String(t).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const toWPaper = (p: Paper): WPaper => ({
  id: p.id,
  title: plain(p.title),
  venue: p.venue ?? "",
  year: p.year,
  citations: p.citations,
  url: p.url,
});
const byCites = (a: WPaper, b: WPaper) => b.citations - a.citations || (a.year ?? 0) - (b.year ?? 0);

/** Front-matter and errata are not papers. */
const isRealPaper = (p: Paper) => p.title.trim() !== "Contributors" && p.type !== "erratum";

interface DomainSeed {
  slug: string;
  name: string;
  accent: string;
  mark: Mark;
  papers: WPaper[];
  heroId: string | null;
  centreTile: Vec2 | null;
  machines: CuratedMachine[];
}

function curatedMatches(data: GalaxyData): boolean {
  const ids = new Set(data.papers.map((p) => p.id));
  let want = 0;
  let have = 0;
  for (const d of curated.domains)
    for (const id of d.paperIds) {
      want++;
      if (ids.has(id)) have++;
    }
  return want > 0 && have / want >= 0.9;
}

function seedsFromCurated(data: GalaxyData): DomainSeed[] {
  const byId = new Map(data.papers.filter(isRealPaper).map((p) => [p.id, p]));
  return curated.domains.map((d) => ({
    slug: d.slug,
    name: d.name,
    accent: d.accent,
    mark: (d.mark as Mark) ?? "sq",
    papers: d.paperIds
      .map((id) => byId.get(id))
      .filter((p): p is Paper => !!p)
      .map(toWPaper),
    heroId: d.heroId,
    centreTile: [d.centreTile[0], d.centreTile[1]],
    machines: curated.machines.filter((m) => m.domain === d.slug && byId.has(m.paperId)),
  }));
}

function seedsFromDataset(data: GalaxyData, papersByDomain: Record<string, Paper[]>): DomainSeed[] {
  return data.domains
    .map((d) => ({ d, papers: (papersByDomain[d.id] ?? []).filter(isRealPaper).map(toWPaper) }))
    .filter((x) => x.papers.length > 0)
    .sort((a, b) => b.papers.length - a.papers.length)
    .map(({ d, papers }, i) => ({
      slug: d.id,
      name: d.name,
      accent: FALLBACK_ACCENTS[i % FALLBACK_ACCENTS.length],
      mark: FALLBACK_MARKS[Math.floor(i / FALLBACK_ACCENTS.length + i) % FALLBACK_MARKS.length] as Mark,
      papers,
      heroId: null,
      centreTile: null,
      machines: [],
    }));
}

/** Co-author overlap between domains: a cheap stand-in for topic similarity. */
function coauthorSimilarity(data: GalaxyData, seeds: DomainSeed[]): number[][] {
  const byId = new Map(data.papers.map((p) => [p.id, p]));
  const sets = seeds.map((s) => {
    const set = new Set<string>();
    for (const p of s.papers) for (const a of byId.get(p.id)?.coAuthors ?? []) set.add(a);
    return set;
  });
  return sets.map((a, i) =>
    sets.map((b, j) => {
      if (i === j) return 1;
      let inter = 0;
      for (const x of a) if (b.has(x)) inter++;
      const uni = a.size + b.size - inter;
      return uni ? inter / uni : 0;
    }),
  );
}

const oddSide = (n: number) => {
  let S = 3;
  while (S * S < n) S += 2;
  return S;
};

/** Greedy similarity placement on the tile grid (centres in whole tiles). */
function placeIslands(sides: number[], sim: number[][]): Vec2[] {
  const n = sides.length;
  const half = sides.map((s) => (s - 1) / 2);
  const vals = sim.flatMap((r, i) => r.filter((_, j) => j !== i));
  const smin = Math.min(...vals, 0);
  const smax = Math.max(...vals, 1e-6);
  const norm = (v: number) => (smax > smin ? (v - smin) / (smax - smin) : 0);
  const orderIdx = [...Array(n).keys()].sort(
    (a, b) => sim[b].reduce((s, v) => s + v, 0) - sim[a].reduce((s, v) => s + v, 0) || sides[b] - sides[a],
  );
  const out: (Vec2 | null)[] = Array(n).fill(null);
  const placed: number[] = [];
  const span = Math.ceil(Math.sqrt(n)) * (Math.max(...sides) + 10) + 10;
  for (const i of orderIdx) {
    if (!placed.length) {
      out[i] = [0, 0];
      placed.push(i);
      continue;
    }
    let best: { c: Vec2; sc: number } | null = null;
    for (let x = -span; x <= span; x++)
      for (let y = -span; y <= span; y++) {
        let sc = 0.000625 * (x * x + y * y);
        let ok = true;
        for (const j of placed) {
          const c = out[j]!;
          const gap = Math.max(Math.abs(x - c[0]), Math.abs(y - c[1])) - half[i] - half[j] - 1;
          if (gap < 4) {
            ok = false;
            break;
          }
          const s = norm(sim[i][j]);
          const target = 4 + 12 * (1 - s);
          const w = gap > target ? s * s * s + 0.02 : 0.12;
          sc += w * (gap - target) * (gap - target);
        }
        if (!ok) continue;
        if (!best || sc < best.sc) best = { c: [x, y], sc };
      }
    out[i] = best ? best.c : [placed.length * (Math.max(...sides) + 5), 0];
    placed.push(i);
  }
  return out as Vec2[];
}

function combos<T>(arr: T[], k: number, cap = 20000): T[][] {
  const out: T[][] = [];
  const acc: T[] = [];
  const rec = (st: number) => {
    if (out.length >= cap) return;
    if (acc.length === k) {
      out.push(acc.slice());
      return;
    }
    for (let q = st; q < arr.length && out.length < cap; q++) {
      acc.push(arr[q]);
      rec(q + 1);
      acc.pop();
    }
  };
  rec(0);
  return out;
}

export function buildWorld(data: GalaxyData, papersByDomain: Record<string, Paper[]>): WorldModel {
  const isCurated = curatedMatches(data);
  const seeds = isCurated ? seedsFromCurated(data) : seedsFromDataset(data, papersByDomain);
  const sim = isCurated ? curated.similarity : coauthorSimilarity(data, seeds);
  const sides = seeds.map((s) => oddSide(s.papers.length));
  const centres: Vec2[] = isCurated
    ? seeds.map((s) => s.centreTile as Vec2)
    : placeIslands(sides, sim);

  const cites = seeds.map((s) => s.papers.reduce((a, p) => a + p.citations, 0));
  const lc = cites.map((c) => Math.log(Math.max(1, c)));
  const cLo = Math.min(...lc);
  const cHi = Math.max(...lc);

  let tileN = 0;
  const domains: WDomain[] = seeds.map((s, i) => {
    const papers = [...s.papers].sort(byCites);
    const hero = papers.find((p) => p.id === s.heroId) ?? papers[0];
    const rest = papers.filter((p) => p !== hero);
    const C: Vec2 = [(centres[i][0] + 0.5) * PITCH, (centres[i][1] + 0.5) * PITCH];
    const O: Vec2 = [C[0] - 0.5 * PITCH, C[1] - 0.5 * PITCH];
    const S = sides[i];
    const half = (S - 1) / 2;
    const all: Vec2[] = [];
    for (let a = -half; a <= half; a++) for (let b = -half; b <= half; b++) all.push([a, b]);

    // machines: the one on the hero paper takes the centre tile (no special size);
    // the others take a balanced set of the nearest ring tiles, avoiding the
    // tiles straight in front of / behind the centre where machines hide each other
    const mlist = s.machines
      .map((m) => ({ m, p: papers.find((p) => p.id === m.paperId)! }))
      .filter((x) => !!x.p)
      .sort((a, b) => byCites(a.p, b.p));
    const centreM = mlist.find((x) => x.p.id === hero.id) ?? null;
    const ringM = mlist.filter((x) => x !== centreM);
    const cheb = (c: Vec2) => Math.max(Math.abs(c[0]), Math.abs(c[1]));
    const dist = (c: Vec2) => Math.hypot(c[0], c[1]);
    const ang = (c: Vec2) => Math.atan2(c[1] - c[0], c[0] + c[1]);
    const taken = new Set(["0,0"]);
    const cellOf = new Map<string, Vec2>();
    // v9: the curated overlay carries every machine's cell from the mockup's own placement
    // (balanced ring-1 set, then ring-2 on the free tiles nearest the centre). Use it when
    // every cell is valid and distinct; otherwise fall back to the balanced-ring search.
    const given = ringM.map((x) => x.m.cell);
    const givenOk =
      ringM.length > 0 &&
      given.every((c) => !!c && c.length === 2 && cheb([c[0], c[1]]) >= 1 && cheb([c[0], c[1]]) <= half) &&
      new Set(given.map((c) => c!.join())).size === given.length;
    if (givenOk) {
      ringM.forEach((x) => {
        const c: Vec2 = [x.m.cell![0], x.m.cell![1]];
        cellOf.set(x.p.id, c);
        taken.add(c.join());
      });
    } else {
      // balanced ring: only searched for a handful of machines (combinations grow fast);
      // any beyond that take the nearest free tiles
      const kN = Math.min(ringM.length, 8);
      let rr = 1;
      while (all.filter((c) => cheb(c) >= 1 && cheb(c) <= rr).length < kN && rr < half) rr++;
      const pool = all.filter((c) => cheb(c) >= 1 && cheb(c) <= rr);
      let best: { sc: number; set: Vec2[] } | null = null;
      for (const set of kN ? combos(pool, kN) : [[] as Vec2[]]) {
        const sx = set.reduce((a, c) => a + c[0], 0);
        const sy = set.reduce((a, c) => a + c[1], 0);
        const sc =
          (10 * Math.hypot(sx, sy)) / Math.max(1, kN) +
          set.reduce((a, c) => a + dist(c), 0) +
          0.35 * set.filter((c) => c[0] === c[1]).length;
        if (!best || sc < best.sc - 1e-9) best = { sc, set };
      }
      const mcells = (best?.set ?? [])
        .slice()
        .sort((a, b) => b[0] + b[1] - (a[0] + a[1]) || b[0] - b[1] - (a[0] - a[1]));
      mcells.forEach((c) => taken.add(c.join()));
      const near = all
        .filter((c) => !taken.has(c.join()))
        .sort((a, b) => dist(a) - dist(b) || ang(a) - ang(b));
      ringM.forEach((x, r) => {
        const c = r < kN ? mcells[r] : near[r - kN];
        if (!c) return;
        cellOf.set(x.p.id, c);
        taken.add(c.join());
      });
    }
    const free = all
      .filter((c) => !taken.has(c.join()))
      .sort((a, b) => dist(a) - dist(b) || ang(a) - ang(b));
    let fi = 0;

    const plan = (c: Vec2): Vec2 => [O[0] + (c[0] + 0.5) * PITCH, O[1] + (c[1] + 0.5) * PITCH];
    const machines: WMachine[] = [];
    const tiles: WTile[] = [];
    const mkMachine = (m: CuratedMachine, p: WPaper, cx: number, cy: number): WMachine => ({
      key: m.key,
      slug: m.slug,
      hook: m.hook,
      status: m.status,
      button: m.button,
      label: m.label,
      accent: m.accent,
      edge: mixWhite(m.accent, 0.45),
      paper: p,
      d: i,
      ring: m.ring ?? (p.id === hero.id ? 0 : 1),
      live: m.live !== false,
      cx,
      cy,
      at: at([cx, cy, 150]),
      b: at([cx, cy, MZ0]),
      g0: at([cx, cy, ISLAND_Z]),
    });
    const used = new Set<string>(["0,0"]);
    rest.forEach((p, n) => {
      const ringHit = ringM.find((x) => x.p.id === p.id && cellOf.has(p.id));
      const c = cellOf.get(p.id) ?? free[fi++];
      if (!c) return;
      used.add(c.join());
      const [cx, cy] = plan(c);
      if (ringHit) machines.push(mkMachine(ringHit.m, p, cx, cy));
      else {
        const id = `t${tileN++}`;
        tiles.push({ id, paper: p, d: i, cx, cy, variant: (tileN * 3 + n) % 24, at: at([cx, cy, 30]) });
      }
    });
    if (centreM) machines.unshift(mkMachine(centreM.m, hero, C[0], C[1]));
    else {
      const id = `t${tileN++}`;
      tiles.push({ id, paper: hero, d: i, cx: C[0], cy: C[1], variant: (tileN * 3) % 24, at: at([C[0], C[1], 30]) });
    }
    const plots = all.filter((c) => !used.has(c.join())).map(plan);

    const h = (S / 2) * PITCH;
    const t = cHi > cLo ? Math.max(0, Math.min(1, (lc[i] - cLo) / (cHi - cLo))) : 0.5;
    const bowl = bowlFromDepth(h, (0.5 + 0.9 * t) * h);
    const cellsPx = all.flatMap(([a, b]) =>
      [
        [a, b],
        [a + 1, b + 1],
        [a + 1, b],
        [a, b + 1],
      ].map(([x, y]) => at([O[0] + x * PITCH, O[1] + y * PITCH, 0])),
    );
    const bbPlan: [number, number, number, number] = [
      O[0] - half * PITCH,
      O[1] - half * PITCH,
      O[0] + (half + 1) * PITCH,
      O[1] + (half + 1) * PITCH,
    ];
    return {
      idx: i,
      slug: s.slug,
      name: s.name,
      accent: s.accent,
      labelColor: mixWhite(s.accent, 0.62),
      mark: s.mark,
      papers,
      hero,
      cites: cites[i],
      C,
      O,
      side: S,
      h,
      hue: GLASS_HUES[i % GLASS_HUES.length],
      bowl,
      hull: [],
      bb: [0, 0, 0, 0],
      tiles,
      machines,
      plots,
      o: at([C[0], C[1], ISLAND_Z]),
      c: at([C[0], C[1], 0]),
      top: at([C[0], C[1], MZ0 + 260]),
      front: at([bbPlan[0], bbPlan[1], ISLAND_Z]),
      mk: at([C[0] + h - 0.75 * PITCH, C[1] + h - 0.75 * PITCH, ISLAND_Z]),
      box: [Math.min(...cellsPx.map((p) => p[0])), Math.max(...cellsPx.map((p) => p[0]))],
      by: [Math.min(...cellsPx.map((p) => p[1])) - 330, Math.max(...cellsPx.map((p) => p[1]))],
      _bbPlan: bbPlan,
    } as WDomain & { _bbPlan: typeof bbPlan };
  });

  // bowls: silhouettes, then make sure no bowl overlaps a neighbouring top on screen
  const topOf = (d: WDomain): Vec2[] =>
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([a, b]) => at([d.C[0] + a * d.h, d.C[1] + b * d.h, ISLAND_Z]));
  for (const d of domains) d.hull = bowlHull(d.C, d.bowl);
  for (let pass = 0; pass < 40; pass++) {
    let any = false;
    for (const a of domains)
      for (const b of domains) {
        if (a === b || !convexOverlap(a.hull, topOf(b))) continue;
        a.bowl = bowlFromDepth(a.h, a.bowl.D * 0.96);
        a.hull = bowlHull(a.C, a.bowl);
        any = true;
      }
    if (!any) break;
  }
  for (const d of domains) {
    const xs = d.hull.map((p) => p[0]);
    const ys = d.hull.map((p) => p[1]);
    d.bb = [Math.min(...xs) - 6, Math.min(...ys) - 6, Math.max(...xs) + 6, Math.max(...ys) + 6];
  }

  // paint order: topological sort by separating axis in plan
  type WD = WDomain & { _bbPlan: [number, number, number, number] };
  const behind = (a: WD, b: WD) => {
    const A2 = a._bbPlan;
    const B2 = b._bbPlan;
    if (A2[2] <= B2[0]) return true;
    if (B2[2] <= A2[0]) return false;
    if (A2[3] <= B2[1]) return true;
    if (B2[3] <= A2[1]) return false;
    return depth(a.C[0], a.C[1]) < depth(b.C[0], b.C[1]);
  };
  const order: number[] = [];
  {
    const left = [...(domains as WD[])];
    while (left.length) {
      const i = left.findIndex((a) => !left.some((b) => b !== a && behind(b, a)));
      order.push(left.splice(i < 0 ? 0 : i, 1)[0].idx);
    }
  }

  // bounds
  const allPts = domains.flatMap((d) => [
    at([d.C[0] - d.h, d.C[1] - d.h, 0]),
    at([d.C[0] + d.h, d.C[1] - d.h, 0]),
    at([d.C[0] + d.h, d.C[1] + d.h, 0]),
    at([d.C[0] - d.h, d.C[1] + d.h, 0]),
  ]);
  const tips = domains.map((d) => at([d.C[0], d.C[1], ISLAND_Z - d.bowl.D]));
  const BX0 = Math.min(...allPts.map((p) => p[0])) - 500;
  const BX1 = Math.max(...allPts.map((p) => p[0])) + 500;
  const BY0 = Math.min(...allPts.map((p) => p[1])) - 600;
  const BY1 = Math.max(...allPts.map((p) => p[1]), ...tips.map((p) => p[1])) + 260;

  // stars
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const stars = Array.from({ length: 1800 }, () => {
    const x = BX0 + rnd() * (BX1 - BX0);
    const y = BY0 + rnd() * (BY1 - BY0);
    const big = rnd();
    const r = big > 0.985 ? 4 : big > 0.9 ? 2.4 : 1.4;
    const o = big > 0.985 ? 0.8 : 0.15 + rnd() * 0.4;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r, o: Math.round(o * 100) / 100 };
  });

  // cross-domain lines: each island to its 1-2 most similar domains
  const links: WLink[] = [];
  if (domains.length > 1) {
    const sims = domains.flatMap((a) => domains.filter((b) => b !== a).map((b) => sim[a.idx][b.idx]));
    const smin = Math.min(...sims);
    const smax = Math.max(...sims);
    const seen = new Set<string>();
    for (const a of domains) {
      const near = domains.filter((b) => b !== a).sort((b, c) => sim[a.idx][c.idx] - sim[a.idx][b.idx]);
      if (!near.length || sim[a.idx][near[0].idx] <= 0) continue;
      const pick = [near[0], ...(near[1] && sim[a.idx][near[1].idx] >= 0.85 * sim[a.idx][near[0].idx] ? [near[1]] : [])];
      for (const b of pick) {
        const key = [a.idx, b.idx].sort((p, q) => p - q).join("-");
        if (seen.has(key)) continue;
        seen.add(key);
        const s = sim[a.idx][b.idx];
        const opacity = 0.18 + 0.72 * Math.pow(smax > smin ? (s - smin) / (smax - smin) : 0.5, 1.3);
        links.push({ a: a.idx, b: b.idx, p0: at([a.C[0], a.C[1], ISLAND_Z]), p1: at([b.C[0], b.C[1], ISLAND_Z]), opacity });
      }
    }
  }

  const machines = domains.flatMap((d) => d.machines);
  const machineByKey = Object.fromEntries(machines.map((m) => [m.key, m]));
  // tour: every machine by map position (curated order when available)
  let tour = isCurated ? curated.tour.filter((k) => machineByKey[k]) : [];
  if (!tour.length && machines.length) tour = machines.map((m) => m.key);

  return {
    curated: isCurated,
    domains,
    order,
    machines,
    machineByKey,
    tour,
    links,
    stars,
    bounds: [BX0, BY0, BX1, BY1],
    paperCount: domains.reduce((s, d) => s + d.papers.length, 0),
  };
}

export const accentRgb = (hex: string) => hex2rgb(hex);
