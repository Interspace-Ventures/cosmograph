// Shared helpers for the ring-2 machine archive (see docs/machine-archive.md).
//
// The archive is a plain ustar tarball of flat `<slug>.js` files, compressed
// with brotli (`.tar.br`). It is built deterministically (sorted names, mtime 0,
// uid/gid 0, mode 0644) so the same modules always give the same sha256.
// No dependencies: node:crypto, node:zlib and a minimal tar reader/writer.

import { createHash } from "node:crypto";
import { brotliCompressSync, brotliDecompressSync, constants as Z } from "node:zlib";

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** Only flat, lower-case module names are allowed in the archive. */
export const SAFE_NAME = /^[a-z0-9][a-z0-9-]{0,80}\.js$/;

function octal(n, width) {
  return n.toString(8).padStart(width - 1, "0") + "\0";
}

function header(name, size) {
  const h = Buffer.alloc(512, 0);
  h.write(name, 0, 100, "utf8");
  h.write(octal(0o644, 8), 100, 8, "ascii"); // mode
  h.write(octal(0, 8), 108, 8, "ascii"); // uid
  h.write(octal(0, 8), 116, 8, "ascii"); // gid
  h.write(octal(size, 12), 124, 12, "ascii"); // size
  h.write(octal(0, 12), 136, 12, "ascii"); // mtime
  h.fill(0x20, 148, 156); // checksum placeholder (spaces)
  h.write("0", 156, 1, "ascii"); // regular file
  h.write("ustar\u000000", 257, 8, "binary");
  let sum = 0;
  for (const b of h) sum += b;
  h.write(octal(sum, 7) + " ", 148, 8, "ascii");
  return h;
}

/** files: Array<{ name: string, data: Buffer }> -> tar Buffer (sorted by name). */
export function packTar(files) {
  const parts = [];
  for (const f of [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (!SAFE_NAME.test(f.name)) throw new Error(`unsafe archive name: ${f.name}`);
    parts.push(header(f.name, f.data.length), f.data);
    const pad = (512 - (f.data.length % 512)) % 512;
    if (pad) parts.push(Buffer.alloc(pad, 0));
  }
  parts.push(Buffer.alloc(1024, 0));
  return Buffer.concat(parts);
}

/** tar Buffer -> Array<{ name, data }>. Regular files only; rejects anything unsafe. */
export function unpackTar(tar) {
  const out = [];
  let off = 0;
  while (off + 512 <= tar.length) {
    const h = tar.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const name = h.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
    const size = parseInt(h.subarray(124, 136).toString("ascii").replace(/[\0 ]/g, "") || "0", 8);
    const type = String.fromCharCode(h[156] || 0x30);
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : h[i];
    const want = parseInt(h.subarray(148, 156).toString("ascii").replace(/[\0 ]/g, ""), 8);
    if (sum !== want) throw new Error(`tar header checksum mismatch at ${off}`);
    off += 512;
    if (!Number.isFinite(size) || size < 0 || off + size > tar.length) throw new Error(`bad tar entry size for ${name}`);
    if (type !== "0") throw new Error(`unsupported tar entry type ${type} for ${name}`);
    if (!SAFE_NAME.test(name)) throw new Error(`unsafe archive name: ${name}`);
    out.push({ name, data: Buffer.from(tar.subarray(off, off + size)) });
    off += size + ((512 - (size % 512)) % 512);
  }
  return out;
}

export const compressArchive = (tar) =>
  brotliCompressSync(tar, {
    params: {
      [Z.BROTLI_PARAM_QUALITY]: 9, // q11 is ~50x slower for <1% smaller here
      [Z.BROTLI_PARAM_LGWIN]: 24,
      [Z.BROTLI_PARAM_SIZE_HINT]: tar.length,
    },
  });

export const decompressArchive = (buf) => brotliDecompressSync(buf);
