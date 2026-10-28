#!/usr/bin/env node
// Package live machine modules into one archive plus a manifest.
//
//   node scripts/pack-machine-archive.mjs <modules-dir> <out-dir> [--exclude-bundled]
//
// Writes <out-dir>/machines-<version>-ring2.tar.br and <out-dir>/manifest.json
// (sha256 + size per file and for the whole archive), and refreshes
// machine-archive.json in this package with the archive's sha256, size and the
// per-file hashes so the build can verify what it downloads.
// --exclude-bundled skips modules that already ship in public/world/machines/.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { packTar, compressArchive, decompressArchive, unpackTar, sha256, SAFE_NAME } from "./machine-archive-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, "..");
const [srcDir, outDir] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const excludeBundled = process.argv.includes("--exclude-bundled");
if (!srcDir || !outDir) {
  console.error("usage: node scripts/pack-machine-archive.mjs <modules-dir> <out-dir> [--exclude-bundled]");
  process.exit(2);
}

const configPath = join(pkgDir, "machine-archive.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const bundledDir = join(pkgDir, "public", "world", "machines");
const bundled = new Set(existsSync(bundledDir) ? readdirSync(bundledDir) : []);

const names = readdirSync(srcDir)
  .filter((n) => SAFE_NAME.test(n))
  .filter((n) => !(excludeBundled && bundled.has(n)))
  .sort();
const files = names.map((name) => ({ name, data: readFileSync(join(srcDir, name)) }));
const tar = packTar(files);
const archive = compressArchive(tar);

// round-trip check before anything is written
const back = unpackTar(decompressArchive(archive));
if (back.length !== files.length || back.some((f, i) => f.name !== files[i].name || !f.data.equals(files[i].data))) {
  throw new Error("archive round-trip mismatch");
}

const archiveName = `machines-${config.version}-ring2.tar.br`;
const manifest = {
  version: config.version,
  format: "tar+br",
  archive: { name: archiveName, sha256: sha256(archive), size: archive.length, tarSize: tar.length },
  files: files.map((f) => ({ path: f.name, sha256: sha256(f.data), size: f.data.length })),
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, archiveName), archive);
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

config.archive = manifest.archive;
config.files = Object.fromEntries(manifest.files.map((f) => [f.path, f.sha256]));
writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

const raw = files.reduce((s, f) => s + f.data.length, 0);
console.log(
  `packed ${files.length} modules: raw ${raw} B, tar ${tar.length} B, archive ${archive.length} B, sha256 ${manifest.archive.sha256}`,
);
