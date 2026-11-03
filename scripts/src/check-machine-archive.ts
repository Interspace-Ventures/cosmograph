import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The build downloads the archive named in machine-archive.json; Convex only
// accepts and serves archives pinned in convex/lib/machineArchive.ts. Both must
// name the same sha256 and size, or the deployed upload endpoint would refuse
// the archive the build asks for.
const root = resolve(import.meta.dirname, "..", "..");
const config = JSON.parse(
  readFileSync(resolve(root, "artifacts/cosmograph/machine-archive.json"), "utf8"),
) as { archive?: { sha256?: string; size?: number } | null; files?: Record<string, string> };
const pinned = readFileSync(resolve(root, "convex/lib/machineArchive.ts"), "utf8");

if (!config.archive?.sha256) {
  console.log("No machine archive configured; nothing to check.");
} else {
  const { sha256, size } = config.archive;
  assert.match(sha256, /^[a-f0-9]{64}$/, "machine-archive.json archive.sha256 is not a sha256");
  const entry = pinned.match(new RegExp(`"${sha256}":\\s*\\{\\s*size:\\s*(\\d+)`));
  assert.ok(entry, `archive ${sha256} is not pinned in convex/lib/machineArchive.ts`);
  assert.equal(Number(entry[1]), size, "pinned archive size differs from machine-archive.json");
  const files = Object.entries(config.files ?? {});
  assert.ok(files.length > 0, "machine-archive.json lists no files");
  for (const [name, hash] of files) {
    assert.match(name, /^[a-z0-9][a-z0-9-]{0,80}\.js$/, `unsafe module name ${name}`);
    assert.match(hash, /^[a-f0-9]{64}$/, `bad sha256 for ${name}`);
  }
  console.log(`Machine archive ${sha256.slice(0, 12)} (${size} B, ${files.length} modules) is pinned in Convex.`);
}
