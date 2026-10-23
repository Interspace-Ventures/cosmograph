// Applies lib/db/migrations/*.sql (excluding *.down.sql) in filename order,
// once each, recording applied files in `cosmograph_migrations`. Run BEFORE
// `drizzle-kit push` (see scripts/post-merge.sh) so push sees the already
// renamed columns instead of prompting to drop/create them.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL must be set to run migrations.");
  process.exit(1);
}

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const files = (await readdir(dir))
  .filter((name) => name.endsWith(".sql") && !name.endsWith(".down.sql"))
  .sort();

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(
    "CREATE TABLE IF NOT EXISTS cosmograph_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const { rows } = await client.query("SELECT name FROM cosmograph_migrations");
  const applied = new Set(rows.map((row) => row.name));
  for (const name of files) {
    if (applied.has(name)) continue;
    const sql = await readFile(path.join(dir, name), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO cosmograph_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
      console.log(`applied ${name}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  }
} finally {
  await client.end();
}
