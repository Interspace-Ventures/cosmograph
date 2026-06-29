import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { ChatAskBody } from "@workspace/api-zod";
import { streamAsk, type AskEvent } from "../lib/ask";

// The assistant hits a paid LLM on every call, so it gets its own tighter per-IP
// budget on top of the global 120 req/min REST limiter (app.ts), plus hard caps
// on question length and conversation length — so one visitor or bot can't run up
// cost or abuse the model. Tune all knobs here (kept in code, like presence).
const ASK_WINDOW_MS = 60_000; // rolling per-IP window
const ASK_MAX_PER_WINDOW = 12; // chat calls allowed per IP per window
const MAX_QUESTION_CHARS = 500; // reject a longer latest question before the LLM call
const MAX_MESSAGES = 24; // cap conversation length sent to the model
const MAX_TOTAL_CHARS = 8000; // total chars across the conversation

const askLimiter = rateLimit({
  windowMs: ASK_WINDOW_MS,
  max: ASK_MAX_PER_WINDOW,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many questions — please slow down and try again shortly." },
});

const router: IRouter = Router();

// Stream a grounded answer as Server-Sent Events. The model classifies the turn
// and emits a structured action first (so the galaxy reacts immediately), then
// streams a reasoning trace and the answer. The browser computes any real counts
// locally, so no paper data leaves the visitor's browser.
router.post("/ask/chat", askLimiter, async (req, res) => {
  const parsed = ChatAskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A question is required." });
    return;
  }
  const { messages } = parsed.data;
  if (!messages.length || messages.length > MAX_MESSAGES) {
    res.status(400).json({ error: "Conversation is empty or too long." });
    return;
  }
  const last = messages[messages.length - 1];
  if (last.role !== "user") {
    res.status(400).json({ error: "The last message must be from the visitor." });
    return;
  }
  if (last.content.length > MAX_QUESTION_CHARS) {
    res
      .status(400)
      .json({ error: `Your question is too long (max ${MAX_QUESTION_CHARS} characters).` });
    return;
  }
  const totalChars = messages.reduce((n, m) => n + m.content.length, 0);
  if (totalChars > MAX_TOTAL_CHARS) {
    res.status(400).json({ error: "This conversation is too long — start a new one." });
    return;
  }

  // SSE handshake. Disable proxy buffering so frames flush immediately.
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let closed = false;
  req.on("close", () => {
    closed = true;
  });

  const send = (e: AskEvent) => {
    if (closed) return;
    res.write(`data: ${JSON.stringify(e)}\n\n`);
  };

  try {
    await streamAsk(parsed.data, req.log, send);
  } catch (err) {
    req.log.error({ err }, "ask: chat stream failed");
    send({ type: "error", error: "The assistant is unavailable right now." });
  } finally {
    if (!closed) res.end();
  }
});

export default router;
