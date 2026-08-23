import assert from "node:assert/strict";
import test from "node:test";
import {
  isPublicStagingPath,
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
  assert.equal(isPublicStagingPath("/sign-in/sso-callback"), true);
  assert.equal(isPublicStagingPath("/assets/index.js"), true);
  assert.equal(isPublicStagingPath("/api/ask"), false);
});

test("redirects anonymous browser navigation to Clerk sign-in", () => {
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

test("rejects anonymous API access and allows explicitly authorized requests", () => {
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
      userId: "user_test",
      authorizedUserIds: ["user_test"],
      method: "GET",
      pathname: "/",
      acceptsHtml: true,
    }),
    "allow",
  );
  assert.equal(
    stagingAccessDecision({
      enabled: true,
      userId: "user_uninvited",
      authorizedUserIds: ["user_test"],
      method: "GET",
      pathname: "/",
      acceptsHtml: true,
    }),
    "redirect",
  );
});
