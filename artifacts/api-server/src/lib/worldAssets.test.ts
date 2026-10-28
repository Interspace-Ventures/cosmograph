import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { brotliCompressSync, gzipSync } from "node:zlib";
import express from "express";
import { acceptedEncodings, IMMUTABLE, REVALIDATE, SHORT, worldAssets } from "./worldAssets";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "world-assets-"));
  const dir = path.join(root, "world", "machines");
  mkdirSync(dir, { recursive: true });
  mkdirSync(path.join(root, "world", "atlas"), { recursive: true });
  const js = Buffer.from('export const svg = "<svg/>";\nexport function mount() {}\n'.repeat(20));
  writeFileSync(path.join(dir, "demo-1.js"), js);
  writeFileSync(path.join(dir, "demo-1.js.br"), brotliCompressSync(js));
  writeFileSync(path.join(dir, "demo-1.js.gz"), gzipSync(js));
  writeFileSync(path.join(dir, "plain-2.js"), js);
  writeFileSync(path.join(dir, "manifest.json"), '{"schema":1}');
  writeFileSync(path.join(root, "world", "atlas", "sheet-0.webp"), Buffer.from("RIFF0000WEBP"));
  return { root, js };
}

async function withServer(root: string, fn: (base: string) => Promise<void>) {
  const app = express();
  app.use(worldAssets(root));
  app.use((_req, res) => res.status(200).type("html").send("<!doctype html>spa"));
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

test("parses Accept-Encoding, dropping q=0", () => {
  assert.deepEqual([...acceptedEncodings("gzip, deflate, br;q=0")], ["gzip", "deflate"]);
  assert.deepEqual([...acceptedEncodings(undefined)], []);
});

test("serves brotli, then gzip, then identity with the right headers", async () => {
  const { root, js } = fixture();
  await withServer(root, async (base) => {
    const br = await fetch(`${base}/world/machines/demo-1.js?v=abcdef123456`, { headers: { "accept-encoding": "br, gzip" } });
    assert.equal(br.status, 200);
    assert.equal(br.headers.get("content-type"), "text/javascript; charset=utf-8");
    assert.equal(br.headers.get("content-encoding"), "br");
    assert.equal(br.headers.get("cache-control"), IMMUTABLE);
    assert.match(br.headers.get("vary") ?? "", /Accept-Encoding/);
    assert.equal(Buffer.from(await br.arrayBuffer()).toString(), js.toString()); // fetch decodes br

    const gz = await fetch(`${base}/world/machines/demo-1.js`, { headers: { "accept-encoding": "gzip" } });
    assert.equal(gz.headers.get("content-encoding"), "gzip");
    assert.equal(gz.headers.get("cache-control"), SHORT);
    await gz.arrayBuffer();

    const id = await fetch(`${base}/world/machines/plain-2.js?v=abcdef`, { headers: { "accept-encoding": "br" } });
    assert.equal(id.headers.get("content-encoding"), null);
    assert.equal(Number(id.headers.get("content-length")), js.length);
    await id.arrayBuffer();
  });
});

test("manifests revalidate, atlases are images, misses are 404 not the SPA", async () => {
  const { root } = fixture();
  await withServer(root, async (base) => {
    const man = await fetch(`${base}/world/machines/manifest.json`);
    assert.equal(man.headers.get("cache-control"), REVALIDATE);
    assert.equal(man.headers.get("content-type"), "application/json; charset=utf-8");
    await man.arrayBuffer();

    const atlas = await fetch(`${base}/world/atlas/sheet-0.webp?v=0123456789ab`);
    assert.equal(atlas.headers.get("content-type"), "image/webp");
    assert.equal(atlas.headers.get("cache-control"), IMMUTABLE);
    await atlas.arrayBuffer();

    for (const p of ["/world/machines/missing.js", "/world/machines/%2e%2e%2fsecret.js", "/world/machines/x.js.br", "/world/atlas/A.webp"]) {
      const r = await fetch(base + p);
      assert.equal(r.status, 404, p);
      await r.arrayBuffer();
    }
    const other = await fetch(`${base}/world`);
    assert.equal(other.status, 200);
    assert.match(await other.text(), /spa/);
  });
});
