import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const appPackage = JSON.parse(
  readFileSync(resolve(root, "artifacts/cosmograph/package.json"), "utf8"),
) as { version?: string };
const changelog = readFileSync(
  resolve(root, "artifacts/cosmograph/src/data/changelog.ts"),
  "utf8",
);
const currentVersion = changelog.match(
  /export const CHANGELOG:[\s\S]*?version:\s*["']([^"']+)["']/,
)?.[1];

assert.ok(
  currentVersion,
  "Could not read the newest Cosmograph changelog version",
);
assert.equal(
  appPackage.version,
  currentVersion,
  `Cosmograph package version ${appPackage.version ?? "(missing)"} does not match changelog ${currentVersion}`,
);

console.log(
  `Release version ${currentVersion} is aligned across package and changelog.`,
);
