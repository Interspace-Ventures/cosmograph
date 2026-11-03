import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { clientIpFromForwarded, trustProxyHops } from "./trustProxy";

test("parses TRUST_PROXY_HOPS with a fail-safe default of 1", () => {
  assert.equal(trustProxyHops(undefined), 1);
  assert.equal(trustProxyHops(""), 1);
  assert.equal(trustProxyHops("3"), 3);
  assert.equal(trustProxyHops("0"), 1);
  assert.equal(trustProxyHops("abc"), 1);
  assert.equal(trustProxyHops("2.5"), 1);
});

test("Render chain: client is two hops back and a forged entry is ignored", () => {
  // "<forged>, <client>, <cloudflare>", socket peer = Render load balancer.
  const xff = "6.6.6.6, 203.0.113.9, 172.70.1.1";
  assert.equal(clientIpFromForwarded(xff, "10.0.0.2", 2), "203.0.113.9");
  assert.equal(clientIpFromForwarded("203.0.113.9, 172.70.1.1", "10.0.0.2", 2), "203.0.113.9");
});

test("one hop takes the last entry; no header falls back to the socket", () => {
  assert.equal(clientIpFromForwarded("6.6.6.6, 203.0.113.9", "10.0.0.2", 1), "203.0.113.9");
  assert.equal(clientIpFromForwarded(undefined, "10.0.0.2", 3), "10.0.0.2");
  assert.equal(clientIpFromForwarded("203.0.113.9", "10.0.0.2", 2), "203.0.113.9");
});

test("matches Express req.ip for the same hop count", async () => {
  for (const hops of [1, 2, 3]) {
    const app = express();
    app.set("trust proxy", hops);
    app.get("/", (req, res) => res.send(req.ip));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const { port } = server.address() as AddressInfo;
    const xff = "6.6.6.6, 203.0.113.9, 172.70.1.1";
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      headers: { "x-forwarded-for": xff },
    });
    const viaExpress = await res.text();
    server.close();
    assert.equal(
      clientIpFromForwarded(xff, "127.0.0.1", hops),
      viaExpress.replace(/^::ffff:/, ""),
      `hops=${hops}`,
    );
  }
});
