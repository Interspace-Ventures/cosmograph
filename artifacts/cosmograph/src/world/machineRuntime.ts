// Live machines. Each machine is a static ES module (generated from the approved
// mockup) that exports its rest-state svg and a mount(document) which runs the
// machine's own script against a document shim scoped to that machine's group.
//
// Scaling (thousands of machines): modules are never downloaded up front. The
// world asks for one when it is close enough to matter; requests go through a
// small priority queue with a concurrency cap, and module sources live in an LRU
// with a byte budget. A machine is instantiated from its source with its own
// timers, so evicting or closing it stops its animation and frees its memory
// (a plain dynamic import() can never be unloaded).

import { moduleUrl } from "./assets";

export interface MachineModule {
  svg: string;
  mount: (doc: ScopedDocument) => void;
  /** stops every timer and animation frame this instance started */
  dispose: () => void;
}

export interface ScopedDocument {
  querySelector: (s: string) => Element | null;
  querySelectorAll: (s: string) => NodeListOf<Element>;
  createElementNS: typeof document.createElementNS;
}

export interface MachineHook {
  startTest: (mode?: number) => void;
  readonly u: number;
}

export const phoneClass = () =>
  typeof window !== "undefined" && (window.innerWidth <= 560 || (navigator.hardwareConcurrency ?? 8) <= 4);

/** Loader limits: phone-class devices get fewer parallel requests and a smaller cache. */
export const LIMITS = {
  concurrency: () => (phoneClass() ? 2 : 4),
  budgetBytes: () => (phoneClass() ? 6 : 24) * 1024 * 1024,
};

// ---------------- source cache (LRU by bytes) ----------------

interface Entry {
  src?: string;
  bytes: number;
  pins: number;
  p?: Promise<string>;
}
const entries = new Map<string, Entry>(); // Map order = recency (oldest first)
let cachedBytes = 0;

export const stats = { requested: 0, fetched: 0, bytes: 0, failed: 0, cancelled: 0, evicted: 0, maxInflight: 0 };

function touch(slug: string, e: Entry) {
  entries.delete(slug);
  entries.set(slug, e);
}

function evictOverBudget() {
  const budget = LIMITS.budgetBytes();
  if (cachedBytes <= budget) return;
  for (const [slug, e] of entries) {
    if (cachedBytes <= budget) break;
    if (e.pins > 0 || e.src === undefined) continue;
    entries.delete(slug);
    factories.delete(slug);
    cachedBytes -= e.bytes;
    stats.evicted++;
  }
}

/** Keep a module's source while a machine using it is on screen. */
export function pin(slug: string) {
  const e = entries.get(slug);
  if (e) e.pins++;
}
export function unpin(slug: string) {
  const e = entries.get(slug);
  if (e && e.pins > 0) e.pins--;
  evictOverBudget();
}

// ---------------- request queue ----------------

interface Job {
  slug: string;
  prio: number;
  resolve: (s: string) => void;
  reject: (e: Error) => void;
}
const queue: Job[] = [];
let inflight = 0;

export function loaderStats() {
  return { ...stats, inflight, queued: queue.length, cached: entries.size, cachedBytes };
}

function pump() {
  while (inflight < LIMITS.concurrency() && queue.length) {
    queue.sort((a, b) => b.prio - a.prio);
    const job = queue.shift()!;
    inflight++;
    stats.maxInflight = Math.max(stats.maxInflight, inflight);
    fetch(moduleUrl(job.slug))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(
        (src) => {
          stats.fetched++;
          stats.bytes += src.length;
          job.resolve(src);
        },
        (err: Error) => {
          stats.failed++;
          job.reject(err);
        },
      )
      .finally(() => {
        inflight--;
        pump();
      });
  }
}

/** Fetch a module's source (deduplicated, queued, cached). Higher prio goes first. */
export function fetchSource(slug: string, prio = 0): Promise<string> {
  const e = entries.get(slug);
  if (e?.src !== undefined) {
    touch(slug, e);
    return Promise.resolve(e.src);
  }
  if (e?.p) {
    const job = queue.find((j) => j.slug === slug);
    if (job) job.prio = Math.max(job.prio, prio);
    return e.p;
  }
  stats.requested++;
  const entry: Entry = { bytes: 0, pins: 0 };
  entry.p = new Promise<string>((resolve, reject) => {
    queue.push({ slug, prio, resolve, reject });
  }).then(
    (src) => {
      entry.src = src;
      entry.bytes = src.length * 2; // UTF-16 in memory
      entry.p = undefined;
      cachedBytes += entry.bytes;
      touch(slug, entry);
      evictOverBudget();
      return src;
    },
    (err: Error) => {
      entries.delete(slug);
      throw err;
    },
  );
  entries.set(slug, entry);
  pump();
  return entry.p;
}

/** Drop queued (not yet started) requests whose machine is no longer wanted. */
export function cancelQueued(keep: (slug: string) => boolean) {
  for (let i = queue.length - 1; i >= 0; i--) {
    const job = queue[i]!;
    if (keep(job.slug)) continue;
    queue.splice(i, 1);
    stats.cancelled++;
    job.reject(new Error("cancelled"));
  }
}

/** Warm the cache for a machine the camera is approaching. Low priority; never crowds out visible work. */
export function prefetch(slug: string) {
  if (entries.has(slug) || queue.length >= LIMITS.concurrency() * 4) return;
  fetchSource(slug, -1).catch(() => {});
}

export const isCached = (slug: string) => entries.get(slug)?.src !== undefined;

// ---------------- instantiation ----------------

type Factory = (...timers: unknown[]) => { svg: string; mount: (d: ScopedDocument) => void };

const factories = new Map<string, Factory | null>();

function factoryFor(slug: string, src: string): Factory | null {
  if (factories.has(slug)) return factories.get(slug)!;
  let f: Factory | null = null;
  // the generated modules have exactly these two exports and no imports
  if (/^export const svg\b/m.test(src) && /^export function mount\b/m.test(src) && !/^\s*import\s/m.test(src)) {
    const body = src.replace(/^export (const|function) /gm, "$1 ");
    try {
      f = new Function(
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        `"use strict";\n${body}\nreturn { svg, mount };`,
      ) as Factory;
    } catch {
      f = null;
    }
  }
  factories.set(slug, f);
  return f;
}

function instantiate(slug: string, src: string): MachineModule | null {
  const f = factoryFor(slug, src);
  if (!f) return null;
  let dead = false;
  const timeouts = new Set<number>();
  const intervals = new Set<number>();
  const frames = new Set<number>();
  const sT = (fn: unknown, ms?: number, ...a: unknown[]) => {
    if (typeof fn !== "function") return 0;
    const id = window.setTimeout(() => {
      timeouts.delete(id);
      if (!dead) (fn as (...x: unknown[]) => void)(...a);
    }, ms);
    timeouts.add(id);
    return id;
  };
  const cT = (id: number) => {
    timeouts.delete(id);
    window.clearTimeout(id);
  };
  const sI = (fn: unknown, ms?: number, ...a: unknown[]) => {
    if (typeof fn !== "function") return 0;
    const id = window.setInterval(() => {
      if (!dead) (fn as (...x: unknown[]) => void)(...a);
    }, ms);
    intervals.add(id);
    return id;
  };
  const cI = (id: number) => {
    intervals.delete(id);
    window.clearInterval(id);
  };
  const rAF = (fn: FrameRequestCallback) => {
    const id = window.requestAnimationFrame((t) => {
      frames.delete(id);
      if (!dead) fn(t);
    });
    frames.add(id);
    return id;
  };
  const cAF = (id: number) => {
    frames.delete(id);
    window.cancelAnimationFrame(id);
  };
  const mod = f(sT, cT, sI, cI, rAF, cAF);
  return {
    svg: mod.svg,
    mount: mod.mount,
    dispose: () => {
      dead = true;
      timeouts.forEach((id) => window.clearTimeout(id));
      intervals.forEach((id) => window.clearInterval(id));
      frames.forEach((id) => window.cancelAnimationFrame(id));
      timeouts.clear();
      intervals.clear();
      frames.clear();
    },
  };
}

/** Load a machine (queued, cached). Falls back to import() for a module not in the generated shape. */
export async function loadMachine(slug: string, prio = 0): Promise<MachineModule> {
  const src = await fetchSource(slug, prio);
  const mod = instantiate(slug, src);
  if (mod) return mod;
  const m = (await import(/* @vite-ignore */ moduleUrl(slug))) as { svg: string; mount: MachineModule["mount"] };
  return { svg: m.svg, mount: m.mount, dispose: () => {} };
}

/** The rest-state drawing only (no script): what the close-up level of detail shows. */
export async function loadDrawing(slug: string, prio = 0): Promise<string> {
  const src = await fetchSource(slug, prio);
  const m = src.match(/^export const svg = ("(?:[^"\\]|\\.)*");/m);
  if (m) {
    try {
      return JSON.parse(m[1]!) as string;
    } catch {
      /* fall through */
    }
  }
  return (await loadMachine(slug, prio)).svg;
}

export type LiveState = "loading" | "ready" | "error";

export interface LiveMachine {
  state: LiveState;
  statusEl: HTMLElement | null;
  hook: () => MachineHook | undefined;
  dispose: () => void;
}

/**
 * Swap the machine's thumbnail for its live svg and run its script.
 * `holder` is the machine's own <g>; `stub` is a hidden element that receives the
 * machine's button / status / readout nodes (the machine page's own controls).
 */
export async function mountLive(
  holder: SVGGElement,
  stub: HTMLElement,
  m: { slug: string; hook: string; status: string; button: string },
): Promise<LiveMachine> {
  const mod = await loadMachine(m.slug, 10);
  pin(m.slug);
  holder.innerHTML = mod.svg;
  stub.innerHTML = "";
  const btn = document.createElement("button");
  btn.className = m.button;
  const st = document.createElement("p");
  st.className = m.status;
  const ro = document.createElement("span");
  ro.setAttribute("data-readout", "");
  stub.append(btn, st, ro);
  const scoped: ScopedDocument = {
    querySelector: (s) => (s === ".iso-stage" ? holder : stub.querySelector(s) || holder.querySelector(s)),
    querySelectorAll: (s) => holder.querySelectorAll(s),
    createElementNS: ((...a: Parameters<typeof document.createElementNS>) =>
      document.createElementNS(...a)) as typeof document.createElementNS,
  };
  mod.mount(scoped);
  const hookName = m.hook.replace(/^__/, "");
  const w = window as unknown as Record<string, MachineHook | undefined>;
  let disposed = false;
  return {
    state: "ready",
    statusEl: st,
    hook: () => w[`__${hookName}`],
    dispose: () => {
      if (disposed) return;
      disposed = true;
      mod.dispose();
      stub.innerHTML = "";
      unpin(m.slug);
    },
  };
}
