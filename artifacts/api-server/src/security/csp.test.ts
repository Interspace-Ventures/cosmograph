import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyNonce,
  cspDirectives,
  cspMode,
  parseOrigins,
  summarizeReport,
} from "./csp";

test("cspMode defaults to report-only and only enforces when told", () => {
  assert.equal(cspMode(undefined), "report-only");
  assert.equal(cspMode(""), "report-only");
  assert.equal(cspMode("nonsense"), "report-only");
  assert.equal(cspMode(" Enforce "), "enforce");
  assert.equal(cspMode("off"), "off");
});

test("parseOrigins keeps only bare https/wss origins", () => {
  assert.deepEqual(
    parseOrigins(
      "https://a.convex.cloud, wss://a.convex.cloud http://x.com https://evil.com/path 'unsafe-eval' *",
    ),
    ["https://a.convex.cloud", "wss://a.convex.cloud"],
  );
  assert.deepEqual(parseOrigins(undefined), []);
});

test("applyNonce stamps every script and module preload, nothing else", () => {
  const html = [
    '<script type="application/ld+json">{}</script>',
    '<script type="module" crossorigin src="/assets/index.js"></script>',
    '<link rel="modulepreload" crossorigin href="/assets/vendor.js">',
    '<link rel="stylesheet" href="/assets/index.css">',
  ].join("\n");
  const out = applyNonce(html, "abc123");
  assert.equal(out.match(/<script nonce="abc123"/g)?.length, 2);
  assert.match(out, /<link nonce="abc123" rel="modulepreload"/);
  assert.match(out, /<link rel="stylesheet"/);
});

test("policy is strict: nonce + strict-dynamic, no eval, no plugins, no framing", () => {
  const d = cspDirectives({ connectSrc: [], reportUri: "/api/csp-report" });
  const script = d.scriptSrc.map((v) =>
    typeof v === "function" ? v({}, { locals: { cspNonce: "N" } }) : v,
  );
  assert.deepEqual(script.slice(0, 2), ["'nonce-N'", "'strict-dynamic'"]);
  assert.ok(!script.includes("'unsafe-eval'"));
  assert.deepEqual(d.objectSrc, ["'none'"]);
  assert.deepEqual(d.baseUri, ["'none'"]);
  assert.deepEqual(d.frameAncestors, ["'none'"]);
  assert.ok(!d.fontSrc.some((s) => s.includes("gstatic")));
});

test("summarizeReport reads both report formats and strips query strings", () => {
  const legacy = summarizeReport({
    "csp-report": {
      "document-uri": "https://cosmograph.space/world?token=secret",
      "violated-directive": "script-src-elem",
      "blocked-uri": "https://evil.example/x.js?y=1",
    },
  });
  assert.equal(legacy.length, 1);
  assert.equal(legacy[0]!.page, "https://cosmograph.space/world");
  assert.equal(legacy[0]!.blocked, "https://evil.example/x.js");

  const modern = summarizeReport([
    {
      type: "csp-violation",
      body: { effectiveDirective: "connect-src", blockedURL: "https://x.io" },
    },
    { type: "deprecation", body: {} },
  ]);
  assert.equal(modern.length, 1);
  assert.equal(modern[0]!.directive, "connect-src");
  assert.deepEqual(summarizeReport("junk"), []);
});
