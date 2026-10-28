#!/usr/bin/env node
// Build step: machine assets for the /world view (docs/machine-archive.md).
//
// Runs after `vite build` (see package.json "build"), so the Railway build that
// Exo delivery runs, CI, and a local build all do the same thing:
//
//  1. Fetch the ring-2 machine archive named in machine-archive.json from
//     Cosmograph's Convex file storage (public, content-addressed URL; no
//     secrets), verify its sha256 and every file's sha256, and unpack it into
//     dist/public/world/machines/.
//  2. Write dist/public/world/machines/manifest.json: every module that ships
//     (bundled + archive) with a content hash. The app resolves module URLs
//     only through this manifest, so storage can move without app changes.
//  3. Precompress every module (.br + .gz) for the API server to serve with
//     Content-Encoding and long cache headers.
//
// It never fails the build. A missing URL, network error or checksum mismatch
// prints a warning and skips step 1; those machines then show "render
// pending". Optional, non-secret overrides: MACHINE_ARCHIVE_FILE (a local
// archive path, for offline builds and tests), MACHINE_ARCHIVE_URL.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { availableParallelism } from "node:os";
import { brotliCompress, gzip, constants as Z } from "node:zlib";
import { decompressArchive, unpackTar, sha256, SAFE_NAME } from "./machine-archive-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, "..");
const outDir = process.argv[2] ?? join(pkgDir, "dist", "public", "world", "machines");
const TIMEOUT_MS = 90_000;

const warn = (msg) => console.warn(`[machine-archive] WARNING: ${msg}`);
const info = (msg) => console.log(`[machine-archive] ${msg}`);

function readConfig() {
  return JSON.parse(readFileSync(join(pkgDir, "machine-archive.json"), "utf8"));
}

/** Public Convex site URL: config first, then the deployment's public client config. */
export function convexSiteUrl(config, env = process.env) {
  const fromConfig = (config.convexSiteUrl || "").trim();
  if (fromConfig) return fromConfig.replace(/\/+$/, "");
  const site = (env.VITE_CONVEX_SITE_URL || "").trim();
  if (site) return site.replace(/\/+$/, "");
  const cloud = (env.VITE_CONVEX_URL || "").trim();
  if (/^https:\/\/[a-z0-9-]+\.convex\.cloud\/?$/.test(cloud)) return cloud.replace(/\.convex\.cloud\/?$/, ".convex.site");
  return "";
}

export function archiveUrl(config, env = process.env) {
  if ((env.MACHINE_ARCHIVE_URL || "").trim()) return env.MACHINE_ARCHIVE_URL.trim();
  if (!config.archive?.sha256) return "";
  const site = convexSiteUrl(config, env);
  return site ? `${site}${config.routePrefix || "/machine-archive/"}${config.archive.sha256}` : "";
}

async function download(url, maxBytes) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const len = Number(res.headers.get("content-length") || 0);
    if (len && len > maxBytes) throw new Error(`archive too large (${len} B)`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new Error(`archive too large (${buf.length} B)`);
    return buf;
  } finally {
    clearTimeout(t);
  }
}

/** Step 1. Returns the number of modules unpacked (0 when skipped). */
export async function fetchArchive(config, dest, env = process.env) {
  const want = config.archive;
  if (!want?.sha256) {
    warn("machine-archive.json names no archive; skipping (ring-2 machines show 'render pending').");
    return 0;
  }
  let buf;
  const file = (env.MACHINE_ARCHIVE_FILE || "").trim();
  if (file) {
    if (!existsSync(file)) {
      warn(`MACHINE_ARCHIVE_FILE ${file} not found; skipping.`);
      return 0;
    }
    buf = readFileSync(file);
    info(`using local archive ${file}`);
  } else {
    const url = archiveUrl(config, env);
    if (!url) {
      warn("no archive URL yet (set convexSiteUrl in machine-archive.json once Cosmograph's Convex deployment exists); skipping.");
      return 0;
    }
    try {
      buf = await download(url, Math.ceil(want.size * 1.05) + 1024);
      info(`downloaded ${buf.length} B from ${url}`);
    } catch (err) {
      warn(`could not download the archive from ${url} (${err.message}); skipping.`);
      return 0;
    }
  }
  const got = sha256(buf);
  if (got !== want.sha256) {
    warn(`archive sha256 mismatch (got ${got}, want ${want.sha256}); skipping.`);
    return 0;
  }
  let files;
  try {
    files = unpackTar(decompressArchive(buf));
  } catch (err) {
    warn(`archive could not be unpacked (${err.message}); skipping.`);
    return 0;
  }
  const expected = config.files || {};
  const names = new Set(files.map((f) => f.name));
  const missing = Object.keys(expected).filter((n) => !names.has(n));
  const bad = files.filter((f) => expected[f.name] !== sha256(f.data)).map((f) => f.name);
  if (missing.length || bad.length) {
    warn(`archive contents do not match the manifest (missing ${missing.length}, mismatched ${bad.length}); skipping.`);
    return 0;
  }
  mkdirSync(dest, { recursive: true });
  let n = 0;
  for (const f of files) {
    if (existsSync(join(dest, f.name))) continue; // a bundled module always wins
    writeFileSync(join(dest, f.name), f.data);
    n++;
  }
  info(`unpacked ${n} modules into ${dest}`);
  return n;
}

/** Step 2: the module manifest the app's URL resolver reads. */
export function writeModuleManifest(config, dest) {
  if (!existsSync(dest)) return { count: 0 };
  const modules = {};
  for (const name of readdirSync(dest).sort()) {
    if (!SAFE_NAME.test(name)) continue;
    modules[name.slice(0, -3)] = sha256(readFileSync(join(dest, name))).slice(0, 12);
  }
  const manifest = {
    schema: 1,
    version: config.version,
    // null = same origin, `<BASE_URL>world/machines/`. A CDN or storage origin goes here,
    // and the app follows it without code changes.
    base: (config.moduleBase || "").trim() || null,
    modules,
  };
  writeFileSync(join(dest, "manifest.json"), JSON.stringify(manifest) + "\n");
  return { count: Object.keys(modules).length };
}

/** Step 3: .br (quality 11) and .gz (level 9) next to every module. */
export async function precompress(dest) {
  if (!existsSync(dest)) return 0;
  const br = promisify(brotliCompress);
  const gz = promisify(gzip);
  const names = readdirSync(dest).filter((n) => SAFE_NAME.test(n) || n === "manifest.json");
  // quality 11 by default; MACHINE_BROTLI_QUALITY (non-secret build knob) trades size for build time
  const q = Number(process.env.MACHINE_BROTLI_QUALITY);
  const quality = Number.isInteger(q) && q >= 1 && q <= 11 ? q : names.length > 2000 ? 9 : 11;
  let i = 0;
  const worker = async () => {
    while (i < names.length) {
      const name = names[i++];
      const p = join(dest, name);
      const data = readFileSync(p);
      const [b, g] = await Promise.all([
        br(data, {
          params: {
            [Z.BROTLI_PARAM_QUALITY]: quality,
            // a window just big enough for the file keeps memory low on small build boxes
            [Z.BROTLI_PARAM_LGWIN]: Math.min(24, Math.max(16, Math.ceil(Math.log2(data.length + 1)) + 1)),
            [Z.BROTLI_PARAM_SIZE_HINT]: data.length,
          },
        }),
        gz(data, { level: 9 }),
      ]);
      writeFileSync(p + ".br", b);
      writeFileSync(p + ".gz", g);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(2, availableParallelism())) }, worker));
  return names.length;
}

async function main() {
  const t0 = Date.now();
  const config = readConfig();
  try {
    await fetchArchive(config, outDir);
  } catch (err) {
    warn(`archive step failed (${err?.message ?? err}); skipping.`);
  }
  try {
    const { count } = writeModuleManifest(config, outDir);
    const n = await precompress(outDir);
    info(`manifest lists ${count} modules; precompressed ${n} files (${Date.now() - t0} ms)`);
  } catch (err) {
    warn(`manifest/precompress step failed (${err?.message ?? err}); modules are still served uncompressed.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    warn(String(err?.message ?? err));
  });
}
