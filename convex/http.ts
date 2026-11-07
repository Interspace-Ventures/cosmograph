import { httpRouter } from "convex/server";
import { httpAction, type ActionCtx } from "./lib/server";
import { handleAsk, handleAskPreflight, handleHealth, type AskHttpDeps } from "./lib/httpAsk";
import { gatewayStatus, streamCompletion } from "./lib/aiGateway";
import { refs } from "./lib/refs";
import {
  handleCheckout,
  handlePortal,
  handlePreflight,
  handleWebhook,
  type BillingHttpDeps,
} from "./lib/httpBilling";

/**
 * HTTP routes. Billing (migration Phase 3) is behind the `convex-account`
 * release flag and answers 404 while it is off. Ask Cosmo runs here on the
 * Convex AI Gateway, behind its own `ask-cosmo` flag. Feedback intake stays on
 * Express for now.
 *
 *   POST/OPTIONS /billing/checkout  start membership checkout (Exo Key auth)
 *   POST/OPTIONS /billing/portal    Stripe customer portal for members
 *   POST         /stripe/webhook    signature-verified Stripe events
 *   POST/OPTIONS /ask/chat          Ask Cosmo, streamed as Server-Sent Events
 *   GET          /health            Ask Cosmo gateway state (reason codes only)
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

function askDeps(ctx: Pick<ActionCtx, "meta" | "runMutation">): AskHttpDeps {
  return {
    env: process.env,
    clientIp: async () => (await ctx.meta.getRequestMetadata()).ip,
    take: (args) => ctx.runMutation(refs.askTake, args),
    complete: (messages, signal) => streamCompletion(messages, { signal }),
    gateway: () => gatewayStatus(),
  };
}

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
  path: "/ask/chat",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => handleAskPreflight(request, process.env)),
});

http.route({
  path: "/ask/chat",
  method: "POST",
  handler: httpAction(async (ctx, request) => handleAsk(request, askDeps(ctx))),
});

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async (ctx) => handleHealth(askDeps(ctx))),
});

export default http;
