# Structured Glass — "Ask Cosmos" chat

This note documents how the **Ask Cosmos** assistant is built and, more
importantly, how its chat surface is dressed in Cosmograph's **Structured Glass**
design language rather than the rounded, bubbly default of most chat UIs.

## What it is

Ask Cosmos is a **grounded, streaming, multi-turn assistant** that lives in the
Mission Control console's "Ask" drawer. One model call does four jobs:

1. **Data questions** — "most cited papers since 2010", "how many on stem cells".
   The model never states a filtered number. It only fills a structured query
   spec; the browser runs `runAskQuery` over the locally-baked snapshot, lights
   up the matching planets, and renders the real count + paper list.
2. **Explain** — "what do the moons mean?", "how do I fly?" — answered from a
   compact, identity-free app guide baked into the system prompt.
3. **Chat** — grounded conversation about the scientist. The model may quote
   only the exact headline summary figures it is given; anything derived routes
   to a data turn.
4. **Feedback** — bug reports / feature requests are classified, summarized, and
   filed to Linear via the existing `/api/feedback/issue` route.

Off-topic prompts and jailbreak attempts ("ignore your instructions…") are
politely declined and redirected back to the science.

## The wire protocol

`POST /api/ask/chat` returns a **Server-Sent Events** stream (declared in the
OpenAPI contract as `text/event-stream`; the generated hook is ignored and the
client reads the body by hand, because `EventSource` can't POST).

The model is prompted to emit a single completion shaped like:

```
{"action":"data","query":{…}}      ← LINE 1: one-line JSON action
===THINK===
short reasoning, 1–2 sentences      ← the "Thinking…" trace
===ANSWER===
the visitor-facing answer
```

`src/lib/ask.ts` runs a small **state machine** (`StreamSplitter`) that consumes
the raw token stream and re-emits **typed SSE frames** — `action`, `reasoning`,
`answer`, `done`, `error`. Markers are matched across chunk boundaries by holding
back any tail that could still be the start of a marker, so a marker split over
two tokens (`"===TH"` + `"INK==="`) is never leaked as content. If the model
skips a marker the splitter degrades gracefully (treats text as reasoning, and
promotes reasoning to the answer if no answer section ever arrives).

**Honesty guarantee:** the only numbers the model may state are the exact
`AskSummary` figures passed in. Every filtered/derived count is computed in the
browser by `runAskQuery`, never by the model. No actual paper data leaves the
browser — only the question, the record *shape* (field names + types), the domain
names, and the public headline summary are sent.

## Reskinning shadcn chat in Structured Glass

The chat primitives live in `src/components/ui/chat.tsx`. They follow the same
rules as the rest of Cosmograph's UI (see `index.css` — the whole radius scale is
collapsed to `0px`, with `border-edge` / `ink` / `accent` tokens):

- **Square edges, hard borders.** Message bubbles, the composer, the issue link,
  and suggestion chips are all `border-2 border-edge` rectangles — no
  `rounded-*`. User messages get an `bg-accent/15` wash and sit right; assistant
  messages sit left on `bg-white/5`.
- **The "Thinking…" trace.** While reasoning streams, the label is a `.shimmer-text`
  accent sweep (a clipped gradient animation) reading **Thinking…**. Once the
  answer begins, it auto-collapses to **Thought for a moment ▸** — an expandable
  disclosure with a rotating chevron and an italic, left-ruled reasoning block.
- **Streaming caret.** A 2px accent block (`StreamCaret`) pulses at the end of the
  answer while tokens arrive, then disappears on `done`.
- **Composer.** A single bordered row with a leading accent glyph; the send arrow
  is a hand-drawn square-capped SVG (matching the sharp aesthetic), and it flips
  to a square **stop** button mid-stream to abort the fetch.
- **Scroll fade.** The conversation column uses `.scroll-fade` (a CSS mask) so
  messages dissolve into the panel chrome at the top/bottom instead of being
  hard-clipped, plus the shared `custom-scrollbar`.
- **Motion respects users.** `.shimmer-text` and the caret honor
  `prefers-reduced-motion` — the shimmer falls back to a steady dim label.

## Data flow recap

```
user text
  └─ AskDrawer.submit → streamAsk() (src/lib/askStream.ts)
       POST /api/ask/chat  { messages, fields, domains, summary }
         └─ routes/ask.ts (rate + length caps) → lib/ask.ts streamAsk()
              └─ OpenAI (gpt-5-mini, reasoning_effort:"low", stream)
                   └─ StreamSplitter → SSE frames
  ◄─ onAction  → data: runAskQuery + setFilters (galaxy lights up)
                 feedback: useReportFeedback → Linear issue link
  ◄─ onReasoning → ChatThinking (live "Thinking…")
  ◄─ onAnswer   → assistant bubble (streaming caret)
  ◄─ done       → commit answer into rolling history (multi-turn context)
```

Everything degrades gracefully: if the server/translator is unreachable the
galaxy still works and the Ask panel just shows an error turn.
