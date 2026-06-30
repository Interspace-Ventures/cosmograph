import { Router, type IRouter } from "express";
import {
  SaveShipBody,
  ClaimSkinBody,
  ConfirmCheckoutBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import {
  getShip,
  saveShip,
  claimOrCheckoutSkin,
  confirmSkin,
  InvalidSeedError,
  InvalidShipTypeError,
  ShipTypeNotOwnedError,
} from "../lib/ship";

const router: IRouter = Router();

// The signed-in account's saved ship: seed, equipped type, owned types, and how
// many premium types its membership still includes for free.
router.get("/me/ship", requireAuth, async (req, res) => {
  res.json(await getShip(req.userId!));
});

// Persist the account's chosen ship seed and equipped type. A premium type must
// already be owned (claimed/purchased) or this returns 403.
router.put("/me/ship", requireAuth, async (req, res) => {
  const parsed = SaveShipBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid ship seed is required." });
    return;
  }
  try {
    const result = await saveShip(
      req.userId!,
      parsed.data.seed,
      parsed.data.type ?? null,
    );
    res.json(result);
  } catch (err) {
    if (err instanceof InvalidSeedError || err instanceof InvalidShipTypeError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof ShipTypeNotOwnedError) {
      res.status(403).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "failed to save ship");
    res
      .status(503)
      .json({ error: "Saving your ship is unavailable right now." });
  }
});

// Claim a premium ship type: free for members with an included slot left,
// otherwise returns a hosted Stripe Checkout URL for the $1 one-time purchase.
router.post("/me/ship/claim", requireAuth, async (req, res) => {
  const parsed = ClaimSkinBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid ship type is required." });
    return;
  }
  const origin = `${req.protocol}://${req.get("host")}`;
  try {
    const result = await claimOrCheckoutSkin(
      req.userId!,
      parsed.data.type,
      origin,
      parsed.data.author ?? null,
      req.log,
    );
    res.json(result);
  } catch (err) {
    if (err instanceof InvalidShipTypeError) {
      res.status(400).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "failed to claim ship type");
    res.status(503).json({ error: "Ship store is unavailable right now." });
  }
});

// Verify a returned skin checkout session and grant the type when paid.
router.post("/me/ship/confirm", requireAuth, async (req, res) => {
  const parsed = ConfirmCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  try {
    const result = await confirmSkin(
      req.userId!,
      parsed.data.sessionId,
      req.log,
    );
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "failed to confirm skin checkout");
    res.status(502).json({ error: "Could not confirm payment." });
  }
});

export default router;
