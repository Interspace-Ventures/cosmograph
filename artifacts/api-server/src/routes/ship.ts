import { Router, type IRouter } from "express";
import { SaveShipBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getShip, saveShip, InvalidSeedError } from "../lib/ship";

const router: IRouter = Router();

// The signed-in account's saved cosmonaut ship seed (null if none saved yet).
router.get("/me/ship", requireAuth, async (req, res) => {
  res.json(await getShip(req.userId!));
});

// Persist the account's chosen ship seed.
router.put("/me/ship", requireAuth, async (req, res) => {
  const parsed = SaveShipBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid ship seed is required." });
    return;
  }
  try {
    const result = await saveShip(req.userId!, parsed.data.seed);
    res.json(result);
  } catch (err) {
    if (err instanceof InvalidSeedError) {
      res.status(400).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "failed to save ship");
    res.status(503).json({ error: "Saving your ship is unavailable right now." });
  }
});

export default router;
