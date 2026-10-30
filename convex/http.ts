import { httpRouter } from "convex/server";
import { httpAction, type ActionCtx } from "./lib/server";
import { refs } from "./lib/refs";
import {
  handleCheckout,
  handlePortal,
  handlePreflight,
  handleWebhook,
  type BillingHttpDeps,
} from "./lib/httpBilling";

/**
 * HTTP routes (migration Phase 3). Billing only; Ask Cosmo, feedback and
 * /health arrive in Phase 4. Everything here is behind the `convex-account`
 * release flag and answers 404 while it is off.
 *
 *   POST/OPTIONS /billing/checkout  start membership checkout (Exo Key auth)
 *   POST/OPTIONS /billing/portal    Stripe customer portal for members
 *   POST         /stripe/webhook    signature-verified Stripe events
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

export default http;
