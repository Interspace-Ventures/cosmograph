---
name: Ask Cosmos chat protocol
description: How the streaming Ask Cosmos assistant is wired and the honesty invariant that data-turn numbers must never come from the model.
---

# Ask Cosmos — streaming grounded assistant

Ask Cosmos is a single model call that both **routes** and **writes**. It is a
SSE stream from `POST /api/ask/chat`, not the old one-shot `/ask/translate`.

## Wire protocol (model → server → client)
The model emits ONE completion shaped as:
```
{"action":"data|explain|chat|feedback", ...}   ← LINE 1, single-line JSON
===THINK===
short reasoning
===ANSWER===
visitor-facing answer
```
`StreamSplitter` (api-server `src/lib/ask.ts`) is a state machine
(head → preamble → reasoning → answer) that re-emits typed SSE frames:
`action | reasoning | answer | done | error`.

**Why the splitter is fiddly:** chunks arrive mid-token, so a marker can split
across two deltas (`"===TH"`+`"INK==="`). The splitter holds back any tail that
`couldBePrefixOf` a marker so markers never leak as content. It also tolerates a
model that skips a marker, and on `end()` **promotes accumulated reasoning to the
answer** if no `===ANSWER===` ever arrived — otherwise the turn ends on an empty
assistant bubble.

## The honesty invariant (do not regress)
The model must NEVER state a filtered/derived number. For `data` turns the
client (`AskDrawer.tsx`) builds the answer **deterministically** from
`runAskQuery` (`dataAnswer()`), sets it in `onAction`, and **ignores the model's
streamed answer prose** (`onAnswer` skips turns where `actionKind === "data"`).
**Why:** prompting alone ("don't state counts") is not enforcement — the model
can still hallucinate a number. Only the in-browser query result is authoritative.
The only numbers the model may quote verbatim are the exact `AskSummary` /
`getCorpusSummary()` headline figures it is handed; everything else routes to a
`data` action. No actual paper data is ever sent to the server — only the
question, the record *shape* (field names+types), domain names, and the summary.

## Verifying
WebGL can't render headless (see r3f-headless-webgl), so smoke-test the SSE
contract with `curl -sN POST localhost:80/api/ask/chat` and assert: action frame
first, reasoning streams with NO marker text leaked, answer streams, `done`.
