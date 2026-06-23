import { Router, type IRouter } from "express";
import {
  ConfirmCheckoutBody,
  CreateCheckoutBody,
  UnlockResearcherBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import {
  getEntitlement,
  createCheckout,
  confirmCheckout,
  unlockResearcher,
  InvalidAuthorError,
  NotAMemberError,
  AddonChargeFailedError,
} from "../lib/billing";

const router: IRouter = Router();

// Membership state + which researchers the signed-in account has unlocked.
router.get("/me/entitlement", requireAuth, async (req, res) => {
  const result = await getEntitlement(req.userId!);
  res.json(result);
});

// Unlock a researcher for an existing member. The first few are included in the
// base membership; beyond that an immediate prorated add-on is charged.
router.post("/me/unlock", requireAuth, async (req, res) => {
  const parsed = UnlockResearcherBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid researcher id is required." });
    return;
  }
  try {
    const result = await unlockResearcher(
      req.userId!,
      parsed.data.author,
      req.log,
    );
    res.json(result);
  } catch (err) {
    if (err instanceof InvalidAuthorError) {
      res.status(400).json({ error: err.message });
    } else if (err instanceof NotAMemberError) {
      res.status(402).json({ error: err.message });
    } else if (err instanceof AddonChargeFailedError) {
      res.status(402).json({ error: err.message });
    } else {
      req.log.error({ err }, "failed to unlock researcher");
      res.status(503).json({ error: "Unlock is unavailable right now." });
    }
  }
});

// Start the one-time unlock checkout (or report the account already owns it).
router.post("/billing/checkout", requireAuth, async (req, res) => {
  const origin = `${req.protocol}://${req.get("host")}`;
  const parsed = CreateCheckoutBody.safeParse(req.body ?? {});
  const author = parsed.success ? parsed.data.author : null;
  try {
    const result = await createCheckout(req.userId!, origin, req.log, author);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "failed to create checkout session");
    res.status(503).json({ error: "Checkout is unavailable right now." });
  }
});

// Verify a returned checkout session and grant the unlock when paid.
router.post("/billing/confirm", requireAuth, async (req, res) => {
  const parsed = ConfirmCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  try {
    const result = await confirmCheckout(
      req.userId!,
      parsed.data.sessionId,
      req.log,
    );
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "failed to confirm checkout session");
    res.status(502).json({ error: "Could not confirm payment." });
  }
});

export default router;
