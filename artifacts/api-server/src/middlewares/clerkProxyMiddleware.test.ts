import assert from "node:assert/strict";
import test from "node:test";
import {
  clerkCanonicalHostMiddleware,
  getClerkProxyHost,
} from "./clerkProxyMiddleware";

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

test("canonicalizes Clerk requests only to an allow-listed configured host", () => {
  const previousCanonical = process.env["CLERK_CANONICAL_HOST"];
  const previousParties = process.env["CLERK_AUTHORIZED_PARTIES"];
  process.env["CLERK_CANONICAL_HOST"] = "staging.exo.now";
  process.env["CLERK_AUTHORIZED_PARTIES"] = "https://staging.exo.now";

  try {
    const request = {
      headers: {
        host: "cosmograph-staging.up.railway.app",
        "x-forwarded-host": "cosmograph-staging.up.railway.app",
        "x-forwarded-proto": "https",
      },
    };
    let continued = false;

    clerkCanonicalHostMiddleware()(
      request as never,
      {} as never,
      () => {
        continued = true;
      },
    );

    assert.equal(request.headers.host, "staging.exo.now");
    assert.equal(request.headers["x-forwarded-host"], "staging.exo.now");
    assert.equal(continued, true);
  } finally {
    if (previousCanonical === undefined) delete process.env["CLERK_CANONICAL_HOST"];
    else process.env["CLERK_CANONICAL_HOST"] = previousCanonical;
    if (previousParties === undefined) delete process.env["CLERK_AUTHORIZED_PARTIES"];
    else process.env["CLERK_AUTHORIZED_PARTIES"] = previousParties;
  }
});
