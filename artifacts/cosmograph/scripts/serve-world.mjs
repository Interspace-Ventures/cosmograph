#!/usr/bin/env node
// Tiny static server for the built app (dist/public) used by the world asset
// baker and the world stress harness: SPA fallback, brotli for text assets,
// immutable caching for ?v= URLs like the API server. Dev/CI tool only.
//
//   node scripts/serve-world.mjs [dir=dist/public] [port=4173]

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve(process.argv[2] ?? "dist/public");
const port = Number(process.argv[3] ?? 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
const TEXT = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg"]);
const brCache = new Map();

http
  .createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    let file = path.join(root, decodeURIComponent(u.pathname));
    if (!file.startsWith(root)) return res.writeHead(403).end();
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      const ext = path.extname(u.pathname);
      if (ext && ext !== ".html") return res.writeHead(404).end();
      file = path.join(root, "index.html");
    }
    const ext = path.extname(file);
    const headers = {
      "content-type": TYPES[ext] ?? "application/octet-stream",
      "cache-control": u.searchParams.has("v") ? "public, max-age=31536000, immutable" : "no-cache",
    };
    let body = fs.readFileSync(file);
    if (TEXT.has(ext) && /\bbr\b/.test(String(req.headers["accept-encoding"] ?? ""))) {
      let b = brCache.get(file);
      if (!b) brCache.set(file, (b = zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } })));
      body = b;
      headers["content-encoding"] = "br";
    }
    headers["content-length"] = body.length;
    res.writeHead(200, headers).end(body);
  })
  .listen(port, "127.0.0.1", () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
