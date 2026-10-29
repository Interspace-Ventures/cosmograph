import { v } from "convex/values";
import { internalMutation, internalQuery } from "./lib/server";
import { PINNED_ARCHIVES } from "./lib/machineArchive";

/** Internal only: the HTTP routes in http.ts are the public surface. */
export const bySha = internalQuery({
  args: { sha256: v.string() },
  returns: v.union(v.null(), v.object({ storageId: v.id("_storage"), size: v.number() })),
  handler: async (ctx, { sha256 }) => {
    const row = await ctx.db
      .query("machineArchives")
      .withIndex("by_sha256", (q) => q.eq("sha256", sha256))
      .first();
    return row ? { storageId: row.storageId, size: row.size } : null;
  },
});

/** Records a stored archive once. Re-checks the pin so nothing else can be recorded. */
export const record = internalMutation({
  args: { sha256: v.string(), storageId: v.id("_storage"), size: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { sha256, storageId, size }) => {
    if (PINNED_ARCHIVES[sha256]?.size !== size) {
      await ctx.storage.delete(storageId);
      return false;
    }
    const existing = await ctx.db
      .query("machineArchives")
      .withIndex("by_sha256", (q) => q.eq("sha256", sha256))
      .first();
    if (existing) {
      // a concurrent upload won the race; keep one copy
      if (existing.storageId !== storageId) await ctx.storage.delete(storageId);
      return false;
    }
    await ctx.db.insert("machineArchives", { sha256, storageId, size });
    return true;
  },
});
