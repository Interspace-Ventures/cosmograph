// Where the /world view's machine assets live. Every module and atlas URL in the
// app comes from here, read from two manifests the build publishes:
//
//   world/machines/manifest.json  { schema, version, base, modules: { slug: hash } }
//   world/atlas/atlas.json        { schema, cell, cols, rows, sheets: [...], slots: { slug: [sheet, i] }, base? }
//
// `base` (null = same origin) is the only thing that changes when storage moves
// from the deploy bundle to Convex storage or a CDN; app code stays the same.
// Every URL carries ?v=<content hash>, which the server caches for a year.

export interface ModuleManifest {
  schema: 1;
  version: string;
  base: string | null;
  modules: Record<string, string>;
}

export interface AtlasSheet {
  file: string;
  v: string;
  w: number;
  h: number;
}

export interface AtlasManifest {
  schema: 1;
  cell: [number, number];
  cols: number;
  rows: number;
  sheets: AtlasSheet[];
  slots: Record<string, [number, number]>;
  base?: string | null;
}

export interface Sprite {
  href: string;
  sheet: number;
  sx: number;
  sy: number;
  w: number;
  h: number;
  sheetW: number;
  sheetH: number;
}

const appBase = () => import.meta.env.BASE_URL.replace(/\/?$/, "/");
const slash = (s: string) => s.replace(/\/?$/, "/");

let modules: ModuleManifest | null = null;
let atlas: AtlasManifest | null = null;
let ready: Promise<void> | null = null;
/** dev server / no manifest: fall back to the curated `live` flag and unversioned same-origin URLs */
let fallback = true;

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Loads both manifests once (small: ~20 B per machine). Never throws. */
export function loadAssetManifests(): Promise<void> {
  if (!ready) {
    ready = Promise.all([
      getJson<ModuleManifest>(`${appBase()}world/machines/manifest.json`),
      getJson<AtlasManifest>(`${appBase()}world/atlas/atlas.json`),
    ]).then(([m, a]) => {
      if (m && m.schema === 1 && m.modules) {
        modules = m;
        fallback = false;
      }
      if (a && a.schema === 1 && a.slots) atlas = a;
    });
  }
  return ready;
}

/** For the stress harness and tests: install manifests directly. */
export function setAssetManifests(m: ModuleManifest | null, a: AtlasManifest | null) {
  modules = m;
  atlas = a;
  fallback = !m;
  ready = Promise.resolve();
}

/**
 * Whether a machine's live module ships. With a manifest, only listed modules
 * are ever requested (a missing one would otherwise cost a round trip). Without
 * one (dev server), the curated flag decides.
 */
export function hasModule(slug: string, curatedLive: boolean): boolean {
  return fallback ? curatedLive : !!modules?.modules[slug];
}

export function moduleUrl(slug: string): string {
  if (!modules || fallback) return `${appBase()}world/machines/${slug}.js`;
  const base = modules.base ? slash(modules.base) : `${appBase()}world/machines/`;
  const v = modules.modules[slug];
  return `${base}${slug}.js${v ? `?v=${v}` : ""}`;
}

export function moduleCount(): number {
  return modules ? Object.keys(modules.modules).length : 0;
}

export function atlasManifest(): AtlasManifest | null {
  return atlas;
}

export function sprite(slug: string): Sprite | null {
  const a = atlas;
  const slot = a?.slots[slug];
  if (!a || !slot) return null;
  const [si, i] = slot;
  const sh = a.sheets[si];
  if (!sh) return null;
  const base = a.base ? slash(a.base) : `${appBase()}world/atlas/`;
  return {
    href: `${base}${sh.file}?v=${sh.v}`,
    sheet: si,
    sx: (i % a.cols) * a.cell[0],
    sy: Math.floor(i / a.cols) * a.cell[1],
    w: a.cell[0],
    h: a.cell[1],
    sheetW: sh.w,
    sheetH: sh.h,
  };
}

// ---- GPU tiers: deep-zoom pyramid tiles and flipbook pages ----
// Both manifests are baked into the world chunk (src/world/data/*.json, a few KB)
// so the renderer is chosen synchronously; their `base` moves the bytes to a CDN
// or Convex storage exactly like the module manifest above.

export function pyramidTileUrl(
  man: { base?: string | null; v: string },
  L: number,
  c: number,
  r: number,
): string {
  const base = man.base ? slash(man.base) : `${appBase()}world/pyramid/`;
  return `${base}L${L}/${c}_${r}.webp?v=${man.v}`;
}

export function flipPageUrl(man: { base?: string | null; pages: { file: string; v: string }[] }, page: number): string {
  const p = man.pages[page]!;
  const base = man.base ? slash(man.base) : `${appBase()}world/flip/`;
  return `${base}${p.file}?v=${p.v}`;
}
