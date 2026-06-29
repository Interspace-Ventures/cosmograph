import type { AskQuery } from "@/data/galaxy";

// Client reader for the "Ask Cosmos" SSE stream (POST /api/ask/chat). The server
// streams typed frames: a single `action` (so the galaxy can react immediately),
// then `reasoning` deltas (the collapsible "Thinking…" trace), then `answer`
// deltas, then `done` (or `error`). We POST the conversation and read the body as
// a stream — EventSource can't POST, so we parse `data:` frames by hand.

export type AskAction =
  | { action: "data"; query: AskQuery }
  | { action: "feedback"; feedbackKind: "bug" | "feature"; message: string }
  | { action: "explain" }
  | { action: "chat" };

// The frame shapes mirror the server's AskEvent union.
type AskFrame =
  | { type: "action"; payload: AskAction }
  | { type: "reasoning"; text: string }
  | { type: "answer"; text: string }
  | { type: "done" }
  | { type: "error"; error: string };

export interface AskMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AskField {
  name: string;
  type: string;
  description?: string;
}

// Matches the server's AskSummary contract (the only numbers the model may state).
export interface AskCorpusSummary {
  authorName: string;
  institution?: string | null;
  totalPapers: number;
  totalCitations: number;
  hIndex?: number | null;
  i10Index?: number | null;
  uniqueCoAuthors: number;
  firstYear: number;
  lastYear: number;
  avgCitations: number;
  topDomains: string[];
  mostCitedTitle?: string | null;
  mostCitedCount?: number | null;
}

export interface AskStreamRequest {
  messages: AskMessage[];
  fields: AskField[];
  domains: string[];
  summary: AskCorpusSummary;
}

export interface AskStreamHandlers {
  onAction?: (action: AskAction) => void;
  onReasoning?: (textDelta: string) => void;
  onAnswer?: (textDelta: string) => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
}

function dispatch(frame: AskFrame, h: AskStreamHandlers): void {
  switch (frame.type) {
    case "action":
      h.onAction?.(frame.payload);
      break;
    case "reasoning":
      h.onReasoning?.(frame.text);
      break;
    case "answer":
      h.onAnswer?.(frame.text);
      break;
    case "error":
      h.onError?.(frame.error);
      break;
    case "done":
      break;
  }
}

// Parse one complete SSE event block (frames are separated by a blank line) and
// dispatch it. Each block has one or more `data:` lines whose concatenation is
// our JSON frame.
function handleEventBlock(block: string, h: AskStreamHandlers): void {
  const data = block
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trimStart())
    .join("\n");
  if (!data) return;
  let frame: AskFrame;
  try {
    frame = JSON.parse(data) as AskFrame;
  } catch {
    return; // ignore malformed frame
  }
  dispatch(frame, h);
}

// Stream one assistant turn. Resolves when the stream ends; rejects only on a
// network/transport failure (model errors arrive as an `error` frame → onError).
export async function streamAsk(
  body: AskStreamRequest,
  h: AskStreamHandlers,
): Promise<void> {
  const res = await fetch("/api/ask/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal: h.signal,
  });

  if (!res.ok || !res.body) {
    let message = "The assistant is unavailable right now.";
    try {
      const err = (await res.json()) as { error?: string };
      if (err?.error) message = err.error;
    } catch {
      // non-JSON error body — keep the default message
    }
    h.onError?.(message);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // Split off complete event blocks (separated by a blank line).
    let sep: number;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      handleEventBlock(block, h);
    }
  }
  // Flush any trailing block without a final blank line.
  if (buf.trim()) handleEventBlock(buf, h);
}
