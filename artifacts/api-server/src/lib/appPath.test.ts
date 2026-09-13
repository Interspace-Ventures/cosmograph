import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAppBasePath } from "./appPath";

test("normalizes configured App base paths", () => {
  assert.equal(normalizeAppBasePath(undefined), "");
  assert.equal(normalizeAppBasePath("/"), "");
  assert.equal(normalizeAppBasePath("cosmograph/"), "/cosmograph");
});
