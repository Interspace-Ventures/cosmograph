import { Router, type IRouter } from "express";
import { TranslateAskBody } from "@workspace/api-zod";
import { translateQuestion } from "../lib/ask";

const router: IRouter = Router();

// Translate a plain-English question into a structured query spec. The model
// only fills query slots; the browser computes the actual answer locally over
// its baked data, so no paper data leaves the visitor's browser.
router.post("/ask/translate", async (req, res) => {
  const parsed = TranslateAskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A question is required." });
    return;
  }
  try {
    const query = await translateQuestion(parsed.data, req.log);
    res.json(query);
  } catch (err) {
    req.log.error({ err }, "failed to translate question");
    res.status(502).json({ error: "The question translator is unavailable right now." });
  }
});

export default router;
