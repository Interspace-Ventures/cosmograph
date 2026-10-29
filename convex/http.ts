import { httpRouter, makeFunctionReference } from "convex/server";
import type { GenericId } from "convex/values";
import { httpAction } from "./lib/server";
import { handleDownload, handleUpload, ROUTE_PREFIX, UPLOAD_PATH, type ArchiveStore } from "./lib/machineArchive";

/**
 * HTTP routes.
 *
 *   POST /machine-archive/upload     store a pinned, content-addressed build archive (no credentials;
 *                                    only bytes whose sha256 is pinned in lib/machineArchive.ts)
 *   GET  /machine-archive/<sha256>   302 to the stored archive (what the build downloads)
 *
 * Phase 3 of the Convex migration adds billing routes to this same router.
 */

type StorageId = GenericId<"_storage">;
const bySha = makeFunctionReference<"query", { sha256: string }, { storageId: StorageId; size: number } | null>(
  "machineArchive:bySha",
);
const record = makeFunctionReference<"mutation", { sha256: string; storageId: StorageId; size: number }, boolean>(
  "machineArchive:record",
);

const http = httpRouter();

const storeFor = (ctx: Parameters<Parameters<typeof httpAction>[0]>[0]): ArchiveStore => ({
  find: (sha256) => ctx.runQuery(bySha, { sha256 }),
  store: async (bytes, sha256, size) => {
    const storageId = await ctx.storage.store(new Blob([bytes], { type: "application/octet-stream" }));
    await ctx.runMutation(record, { sha256, storageId, size });
  },
  url: (storageId) => ctx.storage.getUrl(storageId as StorageId),
});

http.route({
  path: UPLOAD_PATH,
  method: "POST",
  handler: httpAction(async (ctx, request) => handleUpload(request, storeFor(ctx))),
});

http.route({
  pathPrefix: ROUTE_PREFIX,
  method: "GET",
  handler: httpAction(async (ctx, request) => handleDownload(request, storeFor(ctx))),
});

export default http;
