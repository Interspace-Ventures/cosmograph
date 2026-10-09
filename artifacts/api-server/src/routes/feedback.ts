import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { ReportFeedbackBody } from "@workspace/api-zod";
import { createExoWorkItem } from "../lib/exoIntake";
import { requireFeature } from "../lib/features";
import { DailyBudget, envInt } from "../lib/spendGuard";
import { requireSameOrigin } from "../middlewares/sameOrigin";

const router: IRouter = Router();

const MAX_MESSAGE = 4000;
// Reports land in EXO's work queue, so a script must not be able to flood it.
const feedbackBudget = new DailyBudget({
  perClient: envInt("FEEDBACK_DAILY_PER_CLIENT", 10),
  global: envInt("FEEDBACK_DAILY_GLOBAL", 300),
});
const feedbackLimiter = rateLimit({
  windowMs: 60_000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many reports just now. Please wait a minute and try again." },
});

// File a visitor's bug report / feature request through EXO's private intake.
router.post(
  "/feedback/issue",
  requireFeature("ask-cosmo"),
  requireSameOrigin,
  feedbackLimiter,
  async (req, res) => {
    const parsed = ReportFeedbackBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "A kind ('bug' or 'feature') and message are required.",
      });
      return;
    }
    const message = parsed.data.message.trim().slice(0, MAX_MESSAGE);
    if (!message) {
      res.status(400).json({ error: "The message cannot be empty." });
      return;
    }
    if (!feedbackBudget.take(req.ip ?? "unknown").ok) {
      res.status(429).json({ error: "We've received a lot of reports today. Please try again tomorrow." });
      return;
    }
    const isBug = parsed.data.kind === "bug";
    const title = `${isBug ? "[Bug] " : "[Feature] "}${message.split("\n")[0].slice(0, 80)}`;
    const body = `${message}\n\n---\n_Filed from the Cosmograph "Ask the galaxy" panel._`;

    try {
      const issue = await createExoWorkItem({ kind: parsed.data.kind, title, description: body });
      res.status(201).json(issue);
    } catch (err) {
      req.log.error({ err }, "failed to create EXO work item");
      res.status(502).json({
        error: "Could not file your report right now. Please try again later.",
      });
    }
  },
);

export default router;
