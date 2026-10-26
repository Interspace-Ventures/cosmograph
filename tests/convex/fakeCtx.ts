/**
 * A minimal in-memory stand-in for a Convex query/mutation ctx, enough to run
 * the Phase 2 handlers under node:test without a deployment. Rows come back in
 * insertion order, matching Convex index order (`_creationTime` breaks ties).
 */
import type { UserIdentity } from "convex/server";

type Row = Record<string, unknown> & { _id: string; _creationTime: number };

export class FakeDb {
  tables = new Map<string, Row[]>();
  private nextId = 1;
  clock = 1_000_000;

  rows(table: string): Row[] {
    let rows = this.tables.get(table);
    if (!rows) {
      rows = [];
      this.tables.set(table, rows);
    }
    return rows;
  }

  async insert(table: string, value: Record<string, unknown>) {
    const _id = `${table}:${this.nextId++}`;
    this.clock += 1;
    this.rows(table).push({ ...value, _id, _creationTime: this.clock });
    return _id;
  }

  async get(id: string) {
    const table = id.split(":")[0];
    return this.rows(table).find((r) => r._id === id) ?? null;
  }

  async patch(id: string, value: Record<string, unknown>) {
    const row = await this.get(id);
    if (!row) throw new Error(`no row ${id}`);
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) delete row[k];
      else row[k] = v;
    }
  }

  query(table: string) {
    const all = () => this.rows(table);
    let filters: Array<[string, unknown]> = [];
    const run = () =>
      all().filter((row) => filters.every(([f, v]) => row[f] === v));
    const builder = {
      withIndex(
        _name: string,
        fn?: (q: { eq: (f: string, v: unknown) => unknown }) => unknown,
      ) {
        const q = {
          eq(field: string, value: unknown) {
            filters = [...filters, [field, value]];
            return q;
          },
        };
        fn?.(q);
        return builder;
      },
      async collect() {
        return run().map((r) => ({ ...r }));
      },
      async first() {
        const r = run()[0];
        return r ? { ...r } : null;
      },
      async take(n: number) {
        return run()
          .slice(0, n)
          .map((r) => ({ ...r }));
      },
    };
    return builder;
  }
}

export function identity(
  subject: string,
  extra: Record<string, unknown> = {},
): UserIdentity {
  return {
    subject,
    issuer: "https://issuer.example/exo-id",
    tokenIdentifier: `https://issuer.example/exo-id|${subject}`,
    ...extra,
  } as UserIdentity;
}

export function makeCtx(db: FakeDb, who: UserIdentity | null) {
  return {
    db,
    auth: { getUserIdentity: async () => who },
  } as never;
}
