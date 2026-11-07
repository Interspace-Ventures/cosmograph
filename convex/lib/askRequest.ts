import type { AskField, AskMessage, AskRequest, AskSummary } from "./askPrompt";

/**
 * Bounded parse of the Ask Cosmo request body. Same limits the Express route
 * enforced (artifacts/api-server/src/routes/ask.ts, now removed): the model
 * call costs money and everything here is copied into the system prompt, so
 * every string and array is capped before the gateway is touched.
 *
 * The result is rebuilt field by field from the known shape, so an unknown
 * field in the body never reaches the prompt.
 */

/** Whole body. Generous for 24 turns x 8000 chars plus galaxy labels. */
export const MAX_ASK_BODY = 48 * 1024;
export const MAX_QUESTION_CHARS = 500; // the latest visitor question
export const MAX_MESSAGES = 24; // conversation length sent to the model
export const MAX_TOTAL_CHARS = 8000; // total chars across the conversation
export const MAX_LABEL_CHARS = 200; // author name, institution, titles, domains
export const MAX_DOMAINS = 40;
export const MAX_FIELDS = 30;
export const MAX_FIELD_TEXT = 120;

export type AskParse =
  | { ok: true; request: AskRequest }
  | { ok: false; error: string };

const bad = (error: string): AskParse => ({ ok: false, error });
const MALFORMED = "Galaxy context is malformed.";

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

function optNum(v: unknown): number | null | undefined | false {
  if (v === undefined || v === null) return v;
  return isNum(v) ? v : false;
}

function optStr(v: unknown): string | null | undefined | false {
  if (v === undefined || v === null) return v;
  return isStr(v) && v.length <= MAX_LABEL_CHARS ? v : false;
}

function strList(v: unknown, max: number): string[] | null {
  if (!Array.isArray(v) || v.length > max) return null;
  if (!v.every((s) => isStr(s) && s.length <= MAX_LABEL_CHARS)) return null;
  return v as string[];
}

function parseSummary(v: unknown): AskSummary | null {
  if (!isObj(v)) return null;
  if (!isStr(v.authorName) || v.authorName.length > MAX_LABEL_CHARS) return null;
  for (const k of [
    "totalPapers",
    "totalCitations",
    "uniqueCoAuthors",
    "firstYear",
    "lastYear",
    "avgCitations",
  ] as const) {
    if (!isNum(v[k])) return null;
  }
  const topDomains = strList(v.topDomains, MAX_DOMAINS);
  if (!topDomains) return null;
  const institution = optStr(v.institution);
  const mostCitedTitle = optStr(v.mostCitedTitle);
  const hIndex = optNum(v.hIndex);
  const i10Index = optNum(v.i10Index);
  const mostCitedCount = optNum(v.mostCitedCount);
  if (
    institution === false ||
    mostCitedTitle === false ||
    hIndex === false ||
    i10Index === false ||
    mostCitedCount === false
  ) {
    return null;
  }
  return {
    authorName: v.authorName,
    institution,
    totalPapers: v.totalPapers as number,
    totalCitations: v.totalCitations as number,
    hIndex,
    i10Index,
    uniqueCoAuthors: v.uniqueCoAuthors as number,
    firstYear: v.firstYear as number,
    lastYear: v.lastYear as number,
    avgCitations: v.avgCitations as number,
    topDomains,
    mostCitedTitle,
    mostCitedCount,
  };
}

function parseFields(v: unknown): AskField[] | null | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > MAX_FIELDS) return null;
  const out: AskField[] = [];
  for (const f of v) {
    if (!isObj(f) || !isStr(f.name) || !isStr(f.type)) return null;
    if (f.name.length > MAX_FIELD_TEXT || f.type.length > MAX_FIELD_TEXT) return null;
    if (f.description !== undefined) {
      if (!isStr(f.description) || f.description.length > MAX_FIELD_TEXT) return null;
      out.push({ name: f.name, type: f.type, description: f.description });
    } else {
      out.push({ name: f.name, type: f.type });
    }
  }
  return out;
}

function parseMessages(v: unknown): AskMessage[] | null {
  if (!Array.isArray(v)) return null;
  const out: AskMessage[] = [];
  for (const m of v) {
    if (!isObj(m) || !isStr(m.content)) return null;
    if (m.role !== "user" && m.role !== "assistant") return null;
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

export function parseAskBody(text: string): AskParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return bad("A question is required.");
  }
  if (!isObj(raw)) return bad("A question is required.");
  const messages = parseMessages(raw.messages);
  if (!messages) return bad("A question is required.");
  const summary = parseSummary(raw.summary);
  if (!summary) return bad(isObj(raw.summary) ? MALFORMED : "A question is required.");
  const fields = parseFields(raw.fields);
  if (fields === null) return bad(MALFORMED);
  let domains: string[] | undefined;
  if (raw.domains !== undefined) {
    const list = strList(raw.domains, MAX_DOMAINS);
    if (!list) return bad(MALFORMED);
    domains = list;
  }

  if (!messages.length || messages.length > MAX_MESSAGES) {
    return bad("Conversation is empty or too long.");
  }
  const last = messages[messages.length - 1]!;
  if (last.role !== "user") return bad("The last message must be from the visitor.");
  if (last.content.length > MAX_QUESTION_CHARS) {
    return bad(`Your question is too long (max ${MAX_QUESTION_CHARS} characters).`);
  }
  const total = messages.reduce((n, m) => n + m.content.length, 0);
  if (total > MAX_TOTAL_CHARS) {
    return bad("This conversation is too long — start a new one.");
  }

  const request: AskRequest = { messages, summary };
  if (fields) request.fields = fields;
  if (domains) request.domains = domains;
  return { ok: true, request };
}
