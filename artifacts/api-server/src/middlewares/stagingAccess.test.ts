import assert from "node:assert/strict";
import test from "node:test";
import {
  isPublicStagingPath,
  signInLocation,
  stagingAccessDecision,
  stagingAccessRequired,
} from "./stagingAccess";

test("only enables the staging gate for explicit true values", () => {
  assert.equal(stagingAccessRequired(undefined), false);
  assert.equal(stagingAccessRequired("false"), false);
  assert.equal(stagingAccessRequired("true"), true);
  assert.equal(stagingAccessRequired("ON"), true);
});

test("keeps health, authentication, and sign-in assets public", () => {
  assert.equal(isPublicStagingPath("/api/health"), true);
  assert.equal(isPublicStagingPath("/sign-in"), true);
  assert.equal(isPublicStagingPath("/auth/callback"), true);
  assert.equal(isPublicStagingPath("/auth/other"), false);
  assert.equal(isPublicStagingPath("/assets/index.js"), true);
  assert.equal(isPublicStagingPath("/api/ask"), false);
});

test("redirects anonymous browser navigation to Exo sign-in", () => {
  assert.equal(
    stagingAccessDecision({
      enabled: true,
      method: "GET",
      pathname: "/",
      acceptsHtml: true,
    }),
    "redirect",
  );
});

test("rejects anonymous API access and allows authenticated requests", () => {
  assert.equal(
    stagingAccessDecision({
      enabled: true,
      method: "POST",
      pathname: "/api/feedback",
      acceptsHtml: false,
    }),
    "unauthorized",
  );
  assert.equal(
    stagingAccessDecision({
      enabled: true,
      method: "GET",
      pathname: "/api/github-stars",
      acceptsHtml: true,
    }),
    "unauthorized",
  );
  assert.equal(
    stagingAccessDecision({
      enabled: true,
      userId: "exo_subject_test",
      method: "GET",
      pathname: "/",
      acceptsHtml: true,
    }),
    "allow",
  );
});

test("sign-in redirect carries only same-app return paths", () => {
  assert.equal(signInLocation("/"), "/sign-in");
  assert.equal(
    signInLocation("/?author=A123"),
    `/sign-in?next=${encodeURIComponent("/?author=A123")}`,
  );
  assert.equal(signInLocation("//evil.example/x"), "/sign-in");
  assert.equal(signInLocation("/sign-in?next=/x"), "/sign-in");
  assert.equal(signInLocation("/auth/callback?code=1"), "/sign-in");
});
