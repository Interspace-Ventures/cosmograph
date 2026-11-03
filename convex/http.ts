import { httpRouter, makeFunctionReference } from "convex/server";
import type { GenericId } from "convex/values";
import { httpAction, type ActionCtx } from "./lib/server";
import { refs } from "./lib/refs";
import {
  handleCheckout,
  handlePortal,
  handlePreflight,
  handleWebhook,
  type BillingHttpDeps,
} from "./lib/httpBilling";
import { handleDownload, handleUpload, ROUTE_PREFIX, UPLOAD_PATH, type ArchiveStore } from "./lib/machineArchive";

/**
 * HTTP routes.
 *
 * Billing (migration Phase 3). Ask Cosmo, feedback and /health arrive in
 * Phase 4. Billing is behind the `convex-account` release flag and answers
 * 404 while it is off.
 *
 *   POST/OPTIONS /billing/checkout  start membership checkout (Exo Key auth)
 *   POST/OPTIONS /billing/portal    Stripe customer portal for members
 *   POST         /stripe/webhook    signature-verified Stripe events
 *
 * Machine archive (the /world view's build assets, docs/machine-archive.md):
 *
 *   POST /machine-archive/upload     store a pinned, content-addressed build archive (no credentials;
 *                                    only bytes whose sha256 is pinned in lib/machineArchive.ts)
 *   GET  /machine-archive/<sha256>   302 to the stored archive (what the build downloads)
 */

function deps(ctx: Pick<ActionCtx, "auth" | "runAction">): BillingHttpDeps {
  return {
    env: process.env,
    identity: () => ctx.auth.getUserIdentity(),
    checkout: (args) => ctx.runAction(refs.createCheckout, args),
    portal: (args) => ctx.runAction(refs.createPortal, args),
    webhook: (args) => ctx.runAction(refs.processWebhook, args),
  };
}

type StorageId = GenericId<"_storage">;
const bySha = makeFunctionReference<"query", { sha256: string }, { storageId: StorageId; size: number } | null>(
  "machineArchive:bySha",
);
const record = makeFunctionReference<"mutation", { sha256: string; storageId: StorageId; size: number }, boolean>(
  "machineArchive:record",
);

const storeFor = (ctx: Parameters<Parameters<typeof httpAction>[0]>[0]): ArchiveStore => ({
  find: (sha256) => ctx.runQuery(bySha, { sha256 }),
  store: async (bytes, sha256, size) => {
    const storageId = await ctx.storage.store(new Blob([bytes], { type: "application/octet-stream" }));
    await ctx.runMutation(record, { sha256, storageId, size });
  },
  url: (storageId) => ctx.storage.getUrl(storageId as StorageId),
});

const http = httpRouter();

for (const path of ["/billing/checkout", "/billing/portal"] as const) {
  http.route({
    path,
    method: "OPTIONS",
    handler: httpAction(async (_ctx, request) => handlePreflight(request, process.env)),
  });
}

http.route({
  path: "/billing/checkout",
  method: "POST",
  handler: httpAction(async (ctx, request) => handleCheckout(request, deps(ctx))),
});

http.route({
  path: "/billing/portal",
  method: "POST",
  handler: httpAction(async (ctx, request) => handlePortal(request, deps(ctx))),
});

http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => handleWebhook(request, deps(ctx))),
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
