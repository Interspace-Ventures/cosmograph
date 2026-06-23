import { openai } from "@workspace/integrations-openai-ai-server";
import { TranslateAskResponse } from "@workspace/api-zod";
import type { AskQuery, AskRequest } from "@workspace/api-zod";
import type { Logger } from "pino";

// The LLM is used ONLY as a translator: it converts a plain-English question
// into a structured query spec. It must never compute counts, lists, or any
// numbers — the browser runs the returned spec deterministically over its local
// data. We send only the question and a description of the data shape, never the
// actual papers.

const MODEL = "gpt-5-mini";

function buildSystemPrompt(req: AskRequest): string {
  const fields = (req.fields ?? [])
    .map((f) => `- ${f.name} (${f.type})${f.description ? `: ${f.description}` : ""}`)
    .join("\n");
  const domains =
    req.domains && req.domains.length
      ? req.domains.map((d) => `"${d}"`).join(", ")
      : "(none provided)";

  return `You translate a natural-language question about a single scientist's research corpus into a STRICT JSON query spec. You never answer the question, never count, never list papers, never invent numbers. You only fill query slots; deterministic code runs the query locally.

Each record is a "paper" with this shape:
${fields}

Research domains (categories) in this corpus: ${domains}

Return ONLY a JSON object with these keys (omit a key or use null when not relevant):
- intent: "count" when the user wants a number/how-many, "list" when they want to see matching papers (including superlatives like "most cited" / "top N").
- text: a single keyword/topic to match across a paper's title, topic, subfield, field, domain name and venue (e.g. "cancer", "stem cell"). Use the user's topic word; prefer a domain name when the user clearly means a domain. null if no topic.
- coAuthor: a co-author name substring to match, or null.
- minYear / maxYear: inclusive publication-year bounds, or null. "since 2010" => minYear 2010. "before 2005" => maxYear 2004. "in the 1990s" => minYear 1990, maxYear 1999.
- minCitations / maxCitations: citation-count bounds, or null. "more than 100 citations" => minCitations 101. "at least 50" => minCitations 50.
- minCoAuthors / maxCoAuthors: number of co-authors/collaborators, or null. "more than 2 collaborators" => minCoAuthors 3. "solo / no co-authors" => maxCoAuthors 0.
- sortBy: "citations" | "year" | "coAuthors" | null. For "most cited" use "citations"; for "newest/latest" use "year"; for "most collaborative" use "coAuthors".
- sortDir: "asc" | "desc" | null. "most"/"newest"/"highest" => "desc"; "least"/"oldest"/"fewest" => "asc".
- limit: integer max papers for a list (e.g. "top 5" => 5), or null.
- unsupported: true ONLY when the question cannot be expressed with the slots above (e.g. asks for something not in the data shape).

Rules:
- Output valid JSON only, no prose, no markdown.
- Never put a computed count or any answer text in the JSON.
- When in doubt between count and list, choose "list".`;
}

// Clamp + coerce a model field to a non-negative integer or null.
function toIntOrNull(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.trunc(v);
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : null;
}

function toStrOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

// Normalize the raw model JSON into a contract-valid AskQuery. Defends against
// missing/extra/malformed fields so a sloppy model response never breaks the UI.
function normalize(raw: unknown): AskQuery {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const intent = pickEnum(o.intent, ["count", "list"] as const) ?? "list";
  const limit = toIntOrNull(o.limit);
  const query: AskQuery = {
    intent,
    text: toStrOrNull(o.text),
    coAuthor: toStrOrNull(o.coAuthor),
    minYear: toIntOrNull(o.minYear),
    maxYear: toIntOrNull(o.maxYear),
    minCitations: toIntOrNull(o.minCitations),
    maxCitations: toIntOrNull(o.maxCitations),
    minCoAuthors: toIntOrNull(o.minCoAuthors),
    maxCoAuthors: toIntOrNull(o.maxCoAuthors),
    sortBy: pickEnum(o.sortBy, ["citations", "year", "coAuthors"] as const),
    sortDir: pickEnum(o.sortDir, ["asc", "desc"] as const),
    limit: limit != null ? Math.min(Math.max(limit, 1), 100) : null,
    unsupported: o.unsupported === true,
  };
  // Final guard: ensure the object satisfies the published contract.
  return TranslateAskResponse.parse(query) as AskQuery;
}

export async function translateQuestion(
  req: AskRequest,
  log: Logger,
): Promise<AskQuery> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildSystemPrompt(req) },
      { role: "user", content: req.question },
    ],
  });
  const content = completion.choices[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    log.error({ err, content: content.slice(0, 500) }, "ask: model returned non-JSON");
    throw new Error("Model returned invalid JSON");
  }
  return normalize(parsed);
}
