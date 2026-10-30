"use node";

import Stripe from "stripe";
import { v } from "convex/values";
import { internalAction } from "./lib/server";
import { billingConfig, billingError, type BillingConfig } from "./lib/billingConfig";
import { loadStripeSecrets } from "./lib/opSecrets";
import { runCheckout, runPortal } from "./lib/checkout";
import { runWebhook } from "./lib/webhook";
import type { StripeLike } from "./lib/stripeLike";
import { refs } from "./lib/refs";

/**
 * Node-runtime billing actions (internal; reached only through http.ts).
 * Stripe secrets are loaded from 1Password per lib/opSecrets.ts and kept in
 * memory; the Stripe client is created from them on demand. No Stripe secret
 * is ever deployment env, a function argument, a return value or a log line.
 */

let client: { key: string; stripe: StripeLike } | null = null;

function stripeFor(secretKey: string): StripeLike {
  if (!client || client.key !== secretKey) {
    client = {
      key: secretKey,
      stripe: new Stripe(secretKey, {
        maxNetworkRetries: 2,
        timeout: 20_000,
      }) as unknown as StripeLike,
    };
  }
  return client.stripe;
}

function config(): BillingConfig {
  const cfg = billingConfig();
  if (!cfg) throw billingError("BILLING_UNAVAILABLE");
  return cfg;
}

export const createCheckout = internalAction({
  args: {
    subject: v.string(),
    email: v.optional(v.string()),
    plan: v.union(v.literal("annual"), v.literal("lifetime")),
    origin: v.string(),
    returnPath: v.string(),
    author: v.optional(v.string()),
    ship: v.optional(v.string()),
  },
  returns: v.object({ alreadyEntitled: v.boolean(), url: v.optional(v.string()) }),
  handler: async (ctx, args): Promise<{ alreadyEntitled: boolean; url?: string }> => {
    const cfg = config();
    return await runCheckout(args, {
      cfg,
      prepare: (a) => ctx.runMutation(refs.prepareCheckout, a),
      saveCustomer: (a) => ctx.runMutation(refs.setStripeCustomer, a),
      stripe: async () => stripeFor((await loadStripeSecrets(cfg)).secretKey),
      now: () => Date.now(),
    });
  },
});

export const createPortal = internalAction({
  args: { subject: v.string(), origin: v.string(), returnPath: v.string() },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args): Promise<{ url: string }> => {
    const cfg = config();
    return await runPortal(args, {
      cfg,
      prepare: (a) => ctx.runMutation(refs.preparePortal, a),
      stripe: async () => stripeFor((await loadStripeSecrets(cfg)).secretKey),
    });
  },
});

export const processWebhook = internalAction({
  args: { payload: v.string(), signature: v.string() },
  returns: v.object({ status: v.number() }),
  handler: async (ctx, args): Promise<{ status: number }> => {
    const cfg = billingConfig();
    if (!cfg) return { status: 503 };
    const { status } = await runWebhook(args.payload, args.signature, {
      cfg,
      secrets: () => loadStripeSecrets(cfg),
      stripeFor,
      seen: (eventId) => ctx.runQuery(refs.eventSeen, { eventId }),
      apply: (a) => ctx.runMutation(refs.applyEvent, a),
    });
    return { status };
  },
});
