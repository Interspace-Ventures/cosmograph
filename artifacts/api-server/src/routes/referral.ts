import { Router, type IRouter } from "express";
import { ClaimReferralBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getReferral, claimReferral } from "../lib/referral";
import { requireFeature } from "../lib/features";

const router: IRouter = Router();

// The signed-in account's stable referral code + how many accounts signed up
// through their link. The code is generated on first call.
router.get(
  "/me/referral",
  requireFeature("referrals"),
  requireAuth,
  async (req, res) => {
    try {
      res.json(await getReferral(req.userId!));
    } catch (err) {
      req.log.error({ err }, "failed to load referral info");
      res
        .status(503)
        .json({ error: "Referral info is unavailable right now." });
    }
  },
);

// Best-effort attribution of a newly created account to the referrer whose code
// it arrived with. Never errors on an ineligible claim — it just returns the
// caller's own referral info.
router.post(
  "/me/referral/claim",
  requireFeature("referrals"),
  requireAuth,
  async (req, res) => {
    const parsed = ClaimReferralBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "A referral code is required." });
      return;
    }
    try {
      res.json(await claimReferral(req.userId!, parsed.data.code, req.log));
    } catch (err) {
      req.log.error({ err }, "failed to claim referral");
      res
        .status(503)
        .json({ error: "Couldn't record the referral right now." });
    }
  },
);

export default router;
