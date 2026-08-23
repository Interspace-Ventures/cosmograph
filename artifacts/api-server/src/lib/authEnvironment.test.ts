import assert from "node:assert/strict";
import test from "node:test";
import { authEnvironmentErrors } from "./authEnvironment";

test("allows isolated development Clerk in staging", () => {
  assert.deepEqual(authEnvironmentErrors({
    appEnvironment: "staging",
    authorizedParties: "https://staging.cosmograph.space",
    publishableKey: "pk_test_example",
    secretKey: "sk_test_example",
  }), []);
});

test("requires live Clerk keys in production", () => {
  assert.deepEqual(authEnvironmentErrors({
    appEnvironment: "production",
    authorizedParties: "https://cosmograph.space",
    publishableKey: "pk_test_example",
    secretKey: "sk_test_example",
  }), ["Production-like environments require matching Clerk live keys"]);
});
