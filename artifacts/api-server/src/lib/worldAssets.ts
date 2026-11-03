import { createReadStream, statSync, type Stats } from "node:fs";
import path from "node:path";
import type { RequestHandler } from "express";

/**
 * Serves the /world view's machine assets (docs/machine-archive.md):
 *   world/machines/<slug>.js   live machine modules (bundled + unpacked from the Convex archive)
 *   world/machines/manifest.json
 *   world/atlas/<sheet>.webp, world/atlas/atlas.json   thumbnail sprite atlases
 *
 * - Picks the precompressed .br / .gz sibling the build wrote when the client
 *   accepts it, with the real Content-Type, Content-Encoding and Vary.
 * - A request carrying ?v=<content hash> (the app's URL resolver always adds
 *   one) is immutable for a year; manifests revalidate every time.
 * - A missing asset is a 404, never the SPA's index.html, so a module that did
 *   not ship fails fast and the world shows "render pending".
 */

const SAFE = /^\/world\/(machines|atlas)\/([a-z0-9][a-z0-9-]{0,80})\.(js|json|webp)$/;
const TYPES: Record<string, string> = {
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  webp: "image/webp",
};
const COMPRESSIBLE = new Set(["js", "json"]);
export const IMMUTABLE = "public, max-age=31536000, immutable";
export const REVALIDATE = "no-cache";
export const SHORT = "public, max-age=3600";

function fileStat(p: string): Stats | null {
  try {
    const s = statSync(p);
    return s.isFile() ? s : null;
  } catch {
    return null;
  }
}

/** Accept-Encoding -> the encodings the client takes (q > 0), most preferred first by our order. */
export function acceptedEncodings(header: string | undefined): Set<string> {
  const out = new Set<string>();
  for (const part of (header ?? "").split(",")) {
    const [name, ...params] = part.trim().toLowerCase().split(";");
    if (!name) continue;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    if (q && Number(q.slice(2)) === 0) continue;
    out.add(name);
  }
  return out;
}

export function worldAssets(root: string): RequestHandler {
  const base = path.resolve(root);
  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (!req.path.startsWith("/world/machines/") && !req.path.startsWith("/world/atlas/")) return next();
    const m = SAFE.exec(req.path);
    if (!m) {
      res.status(404).end();
      return;
    }
    const [, dir, name, ext] = m;
    const file = path.join(base, "world", dir!, `${name}.${ext}`);
    const plain = fileStat(file);
    if (!plain) {
      res.status(404).end();
      return;
    }
    let send = file;
    let stat = plain;
    let encoding: string | null = null;
    if (COMPRESSIBLE.has(ext!)) {
      res.setHeader("Vary", "Accept-Encoding");
      const ok = acceptedEncodings(req.headers["accept-encoding"]);
      for (const [enc, suffix] of [
        ["br", ".br"],
        ["gzip", ".gz"],
      ] as const) {
        if (!ok.has(enc)) continue;
        const s = fileStat(file + suffix);
        if (s) {
          send = file + suffix;
          stat = s;
          encoding = enc;
          break;
        }
      }
    }
    const isManifest = ext === "json";
    const versioned = typeof req.query["v"] === "string" && /^[a-f0-9]{6,64}$/.test(req.query["v"]);
    res.setHeader("Content-Type", TYPES[ext!]!);
    res.setHeader("Cache-Control", isManifest ? REVALIDATE : versioned ? IMMUTABLE : SHORT);
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (encoding) res.setHeader("Content-Encoding", encoding);
    const etag = `W/"${plain.size.toString(16)}-${Math.floor(plain.mtimeMs).toString(16)}${encoding ? `-${encoding}` : ""}"`;
    res.setHeader("ETag", etag);
    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }
    res.setHeader("Content-Length", String(stat.size));
    if (req.method === "HEAD") {
      res.status(200).end();
      return;
    }
    res.status(200);
    createReadStream(send)
      .on("error", (err) => next(err))
      .pipe(res);
  };
}
