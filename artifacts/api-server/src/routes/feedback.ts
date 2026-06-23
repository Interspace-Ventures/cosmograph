import { Router, type IRouter } from "express";
import { ReportFeedbackBody } from "@workspace/api-zod";
import { createGithubIssue } from "../lib/github";

const router: IRouter = Router();

const MAX_MESSAGE = 4000;

// File a visitor's bug report / feature request as a public GitHub issue.
router.post("/feedback/issue", async (req, res) => {
  const parsed = ReportFeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A kind ('bug' or 'feature') and message are required." });
    return;
  }
  const message = parsed.data.message.trim().slice(0, MAX_MESSAGE);
  if (!message) {
    res.status(400).json({ error: "The message cannot be empty." });
    return;
  }
  const isBug = parsed.data.kind === "bug";
  const title = `${isBug ? "[Bug] " : "[Feature] "}${message.split("\n")[0].slice(0, 80)}`;
  const body = `${message}\n\n---\n_Filed from the Cosmograph "Ask the galaxy" panel._`;
  const labels = [isBug ? "bug" : "enhancement"];

  try {
    const issue = await createGithubIssue(title, body, labels, req.log);
    res.status(201).json(issue);
  } catch (err) {
    req.log.error({ err }, "failed to create github issue");
    res.status(502).json({ error: "Could not file your report right now. Please try again later." });
  }
});

export default router;
