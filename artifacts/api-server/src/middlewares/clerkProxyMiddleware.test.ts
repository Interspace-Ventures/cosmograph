import assert from "node:assert/strict";
import test from "node:test";
import { getClerkProxyHost } from "./clerkProxyMiddleware";

test("prefers an EXO canonical host only when it is an authorized party", () => {
  const previous = process.env["CLERK_AUTHORIZED_PARTIES"];
  process.env["CLERK_AUTHORIZED_PARTIES"] =
    "https://staging.exo.now,https://cosmograph-staging.up.railway.app";

  try {
    assert.equal(
      getClerkProxyHost({
        headers: {
          host: "cosmograph-staging.up.railway.app",
          "x-exo-canonical-host": "staging.exo.now",
          "x-forwarded-host": "cosmograph-staging.up.railway.app",
        },
      }),
      "staging.exo.now",
    );

    assert.equal(
      getClerkProxyHost({
        headers: {
          host: "cosmograph-staging.up.railway.app",
          "x-exo-canonical-host": "untrusted.example",
          "x-forwarded-host": "cosmograph-staging.up.railway.app",
        },
      }),
      "cosmograph-staging.up.railway.app",
    );
  } finally {
    if (previous === undefined) delete process.env["CLERK_AUTHORIZED_PARTIES"];
    else process.env["CLERK_AUTHORIZED_PARTIES"] = previous;
  }
});
