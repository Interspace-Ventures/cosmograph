import { Router, type IRouter, type Response } from "express";
import { returnOrigin } from "../lib/publicOrigin";
import {
  ConfirmCheckoutBody,
  CreateCheckoutBody,
  UnlockResearcherBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import {
  getEntitlement,
  createCheckout,
  createPortalSession,
  confirmCheckout,
  unlockResearcher,
  InvalidAuthorError,
  NotAMemberError,
  AddonChargeFailedError,
  CheckoutLimitError,
  BillingUnavailableError,
  type MemberPlan,
} from "../lib/billing";
import { stripeConfigured } from "../lib/stripeClient";

const router: IRouter = Router();

const billingOff = (res: Response) =>
  res.status(503).json({ error: "Membership checkout opens soon." });

// Membership state for the signed-in account. Pure DB read.
router.get("/me/entitlement", requireAuth, async (req, res) => {
  res.json(await getEntitlement(req.userId!));
});

// Members pin researchers to their account (no extra charge).
router.post("/me/unlock", requireAuth, async (req, res) => {
  const parsed = UnlockResearcherBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid researcher id is required." });
    return;
  }
  try {
    res.json(await unlockResearcher(req.userId!, parsed.data.author, req.log));
  } catch (err) {
    if (err instanceof InvalidAuthorError) res.status(400).json({ error: err.message });
    else if (err instanceof NotAMemberError) res.status(402).json({ error: err.message });
    else if (err instanceof AddonChargeFailedError) res.status(409).json({ error: err.message });
    else {
      req.log.error({ err }, "failed to unlock researcher");
      res.status(503).json({ error: "Unlock is unavailable right now." });
    }
  }
});

// Start checkout for { plan: "annual" | "lifetime" } (default annual).
router.post("/billing/checkout", requireAuth, async (req, res) => {
  if (!stripeConfigured()) return void billingOff(res);
  const parsed = CreateCheckoutBody.safeParse(req.body ?? {});
  const author = parsed.success ? parsed.data.author : null;
  const rawPlan = (req.body as { plan?: unknown } | undefined)?.plan;
  if (rawPlan !== undefined && rawPlan !== "annual" && rawPlan !== "lifetime") {
    res.status(400).json({ error: "Unknown plan." });
    return;
  }
  const plan: MemberPlan = rawPlan === "lifetime" ? "lifetime" : "annual";
  try {
    // Return URLs come from the origin allowlist, never from Host.
    res.json(await createCheckout(req.userId!, plan, returnOrigin(req), req.log, author));
  } catch (err) {
    if (err instanceof CheckoutLimitError) res.status(429).json({ error: err.message });
    else if (err instanceof BillingUnavailableError) {
      req.log.error({ err }, "billing unavailable");
      res.status(503).json({ error: err.message });
    } else {
      req.log.error({ err }, "failed to create checkout session");
      res.status(503).json({ error: "Checkout is unavailable right now." });
    }
  }
});

// Verify a returned checkout session (belt-and-braces with the webhook).
router.post("/billing/confirm", requireAuth, async (req, res) => {
  if (!stripeConfigured()) return void billingOff(res);
  const parsed = ConfirmCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  try {
    res.json(await confirmCheckout(req.userId!, parsed.data.sessionId, req.log));
  } catch (err) {
    req.log.error({ err }, "failed to confirm checkout session");
    res.status(502).json({ error: "Could not confirm payment." });
  }
});

// Stripe customer portal: cancel, change card, invoices. One click to cancel.
router.post("/billing/portal", requireAuth, async (req, res) => {
  if (!stripeConfigured()) return void billingOff(res);
  try {
    res.json({ url: await createPortalSession(req.userId!, returnOrigin(req)) });
  } catch (err) {
    if (err instanceof NotAMemberError) {
      res.status(404).json({ error: "No billing account yet." });
      return;
    }
    req.log.error({ err }, "failed to create portal session");
    res.status(503).json({ error: "Billing portal is unavailable right now." });
  }
});

export default router;
