import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Sparkles,
  SendHorizontal,
  Loader2,
  Bug,
  Lightbulb,
  ExternalLink,
} from "lucide-react";
import { useTranslateAsk, useReportFeedback } from "@workspace/api-client-react";
import { useAppState } from "@/lib/store";
import {
  galaxyData,
  runAskQuery,
  type AskQuery,
  type AskResult,
  type Paper,
} from "@/data/galaxy";
import { getDomainColorStr } from "@/lib/colors";
import { MessageCircleStar } from "./MessageCircleStar";

export function AskDrawer() {
  const { askOpen, setAskOpen, consoleOpen, setCameraMode, setSelectedObject } =
    useAppState();
  // Sit to the LEFT of the right-hand Mission Control instead of under it: offset
  // by the live console width (expanded vs collapsed rail) and cap our own width
  // so we never overflow the remaining space.
  const consoleW = consoleOpen ? "min(14rem,80vw)" : "3.5rem";

  // Built from live galaxyData at mount; the whole Overlay remounts on a dataset
  // swap (key={datasetVersion}), so this stays in sync with the active scientist.
  const domainIndexById = useMemo<Record<string, number>>(
    () =>
      galaxyData.domains.reduce(
        (acc, d, i) => {
          acc[d.id] = i;
          return acc;
        },
        {} as Record<string, number>,
      ),
    [],
  );

  const pickPaper = (id: string) => {
    setCameraMode("god");
    setSelectedObject({ type: "planet", id });
  };

  useEffect(() => {
    if (!askOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAskOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [askOpen, setAskOpen]);

  return (
    <AnimatePresence>
      {askOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 pointer-events-auto"
        >
          <div
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            onClick={() => setAskOpen(false)}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="ask-drawer-title"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            style={{ ["--console-w" as string]: consoleW }}
            className="custom-scrollbar absolute inset-0 flex flex-col overflow-y-auto border-l-2 border-edge bg-bg/95 p-7 backdrop-blur-xl sm:left-auto sm:right-[var(--console-w)] sm:w-[min(34rem,calc(100vw-var(--console-w)-0.5rem))]"
          >
            <button
              onClick={() => setAskOpen(false)}
              aria-label="Close"
              autoFocus
              className="absolute top-4 right-4 text-ink-dim transition-colors hover:text-ink"
            >
              <X size={18} />
            </button>

            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-accent">
              <MessageCircleStar size={12} /> Ask the galaxy
            </span>
            <h2
              id="ask-drawer-title"
              className="mt-1 mb-2 text-2xl font-title font-bold tracking-tight text-ink"
            >
              Ask anything about this work
            </h2>
            <p className="mb-6 text-[13px] leading-relaxed text-ink-dim">
              Ask a natural-language question and matching papers light up across the
              galaxy. Answers are computed from the data, never invented — you can also
              report a bug or request a feature right here.
            </p>

            <AskPanel domainIndexById={domainIndexById} onPickPaper={pickPaper} />
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// The paper-record shape sent to the translator. Field names + types only —
// never any actual paper data (everything stays local in the browser).
const ASK_FIELDS = [
  { name: "title", type: "string" },
  { name: "year", type: "number", description: "Publication year." },
  { name: "citations", type: "number", description: "Total citation count." },
  { name: "topic", type: "string", description: "Fine-grained OpenAlex topic." },
  { name: "subfield", type: "string" },
  { name: "field", type: "string" },
  { name: "domainName", type: "string", description: "The research domain (sun) this paper orbits." },
  { name: "venue", type: "string", description: "Journal or conference." },
  { name: "coAuthors", type: "string[]", description: "Names of collaborators." },
  { name: "coAuthorCount", type: "number", description: "Number of collaborators." },
] as const;

type AskMode = "ask" | "bug" | "feature";

// A single conversation turn. For "ask" turns the answer + papers are computed
// deterministically by runAskQuery (the model never returns numbers or lists).
// For "bug"/"feature" turns the translator detected feedback, the message was
// filed to Linear, and the turn carries the resulting issue link.
interface AskTurn {
  id: number;
  mode: AskMode;
  question: string;
  status: "ok" | "unsupported" | "error";
  answer: string;
  papers: Paper[];
  count: number;
  issueUrl?: string;
  issueNumber?: number;
}

// Compose the answer text from the locally-computed result. ALL numbers here
// come from `r` (the deterministic run), not from the model.
function composeAnswer(q: AskQuery, r: AskResult): string {
  if (q.unsupported) {
    return "I can only answer questions about this researcher's papers — try topics, years, citation counts, or co-authors. Spotted a bug or have an idea? Just say so (e.g. “I want to report a bug…”) and I'll file it with the team.";
  }
  if (r.count === 0) {
    return `No papers match that — searched all ${r.total}.`;
  }
  if (q.intent === "count") {
    return `${r.count} of ${r.total} papers match — they're lit up in the galaxy.`;
  }
  const shown = r.matched.length;
  const noun = r.count === 1 ? "paper" : "papers";
  if (shown < r.count) {
    return `${r.count} ${noun} match — showing the top ${shown}, lit up in the galaxy.`;
  }
  return `${r.count} ${noun} match — lit up in the galaxy.`;
}

function AskPanel({
  domainIndexById,
  onPickPaper,
}: {
  domainIndexById: Record<string, number>;
  onPickPaper: (id: string) => void;
}) {
  const { setFilters, resetFilters } = useAppState();
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const turnId = useRef(0);
  const translate = useTranslateAsk();
  const report = useReportFeedback();

  const domainNames = useMemo(() => galaxyData.domains.map((d) => d.name), []);
  const busy = translate.isPending || report.isPending;

  // File a translator-detected bug report / feature request to Linear, then
  // append a turn linking the created issue.
  const fileFeedback = async (
    kind: "bug" | "feature",
    message: string,
    id: number,
  ) => {
    try {
      const issue = await report.mutateAsync({ data: { kind, message } });
      setTurns((prev) => [
        ...prev,
        {
          id,
          mode: kind,
          question: message,
          status: "ok",
          answer:
            kind === "bug"
              ? "Thanks — I filed that as a bug report. The team will take a look."
              : "Thanks — I filed that as a feature request. The team will take a look.",
          papers: [],
          count: 0,
          issueUrl: issue.url,
          issueNumber: issue.number,
        },
      ]);
    } catch {
      setTurns((prev) => [
        ...prev,
        {
          id,
          mode: kind,
          question: message,
          status: "error",
          answer: "Couldn't file that just now. Please try again later.",
          papers: [],
          count: 0,
        },
      ]);
    }
  };

  // One input does it all: translate → if the translator detected a bug/feature
  // report, file it to Linear; otherwise run the deterministic query + light up
  // matches.
  const ask = async (question: string, id: number) => {
    try {
      const spec = await translate.mutateAsync({
        data: { question, fields: [...ASK_FIELDS], domains: domainNames },
      });
      if (spec.intent === "feedback") {
        await fileFeedback(spec.feedbackKind ?? "bug", question, id);
        return;
      }
      const result = runAskQuery(spec);
      if (spec.unsupported) resetFilters();
      else setFilters(result.filters);
      setTurns((prev) => [
        ...prev,
        {
          id,
          mode: "ask",
          question,
          status: spec.unsupported ? "unsupported" : "ok",
          answer: composeAnswer(spec, result),
          papers: result.matched,
          count: result.count,
        },
      ]);
    } catch {
      setTurns((prev) => [
        ...prev,
        {
          id,
          mode: "ask",
          question,
          status: "error",
          answer: "Couldn't reach the translator just now. Please try again.",
          papers: [],
          count: 0,
        },
      ]);
    }
  };

  const submit = (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput("");
    const id = ++turnId.current;
    void ask(text, id);
  };

  const send = () => submit(input);

  const clear = () => {
    setTurns([]);
    resetFilters();
  };

  // Starter prompts shown before the first question — one is seeded from the
  // active scientist's top research domain so it stays relevant after a swap.
  const suggestions = useMemo(() => {
    const chips = ["Most cited papers", "Papers since 2015", "Over 100 citations"];
    const topDomain = galaxyData.domains[0]?.name;
    if (topDomain) chips.splice(1, 0, `Work on ${topDomain}`);
    return chips;
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {/* Input */}
      <div className="flex items-center gap-2 border-2 border-edge bg-white/5 px-2 focus-within:border-accent">
        <Sparkles size={15} className="shrink-0 text-accent" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Ask about this work, or report a bug…"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink placeholder:text-ink-dim/70 focus:outline-none"
        />
        <button
          onClick={send}
          disabled={!input.trim() || busy}
          aria-label="Send"
          className="shrink-0 text-ink-dim transition-colors hover:text-accent disabled:opacity-40"
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <SendHorizontal size={16} />
          )}
        </button>
      </div>

      {turns.length === 0 ? (
        <div className="flex flex-col gap-2 px-0.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-dim">
            Try asking
          </span>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => submit(s)}
                disabled={busy}
                className="border-2 border-edge bg-white/5 px-2.5 py-1 text-[11px] text-ink-dim transition-colors hover:border-accent hover:text-ink disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>
          <span className="text-[10px] leading-relaxed text-ink-dim/70">
            Answers are computed from the data, never invented. You can also report
            a bug or request a feature here.
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-widest text-ink-dim">
            Conversation
          </span>
          <button
            onClick={clear}
            title="Clear conversation"
            className="flex items-center gap-1 font-display text-[11px] uppercase tracking-wider text-ink-dim transition-colors hover:text-ink"
          >
            Clear <X size={12} />
          </button>
        </div>
      )}

      {turns.map((t) => (
        <div key={t.id} className="flex flex-col gap-1.5">
          {/* Message */}
          <div className="self-end max-w-[90%] border-2 border-edge bg-accent/15 px-2.5 py-1.5 text-sm text-ink">
            {t.mode !== "ask" && (
              <span className="mb-0.5 flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-accent">
                {t.mode === "bug" ? <Bug size={9} /> : <Lightbulb size={9} />}
                {t.mode === "bug" ? "Bug report" : "Feature request"}
              </span>
            )}
            {t.question}
          </div>
          {/* Answer */}
          <div
            className={`max-w-[95%] border-2 px-2.5 py-1.5 text-sm leading-snug ${
              t.status === "error"
                ? "border-edge text-ink-dim"
                : "border-edge bg-white/5 text-ink"
            }`}
          >
            {t.answer}
          </div>
          {/* Filed-issue link (bug / feature turns) */}
          {t.issueUrl && (
            <a
              href={t.issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 self-start border-2 border-edge bg-white/5 px-2.5 py-1.5 text-[11px] font-display uppercase tracking-wider text-accent transition-colors hover:bg-white/10"
            >
              <ExternalLink size={12} /> Filed #{t.issueNumber} — view on Linear
            </a>
          )}
          {/* Matching papers */}
          {t.papers.length > 0 && (
            <div className="max-h-[28vh] overflow-y-auto custom-scrollbar border-2 border-edge">
              {t.papers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onPickPaper(p.id)}
                  className="flex w-full flex-col gap-1.5 border-b border-white/8 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-accent/15"
                >
                  <span className="block text-sm leading-snug text-ink line-clamp-2">
                    {p.title}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-ink-dim">
                    {p.year != null && <span>{p.year}</span>}
                    <span className="text-accent">
                      {p.citations.toLocaleString()} cites
                    </span>
                    {p.domainName && (
                      <span className="flex min-w-0 items-center gap-1">
                        <span
                          className="h-2 w-2 shrink-0 border border-edge"
                          style={{
                            background: getDomainColorStr(
                              domainIndexById[p.domainId] ?? 0,
                            ),
                          }}
                        />
                        <span className="truncate">{p.domainName}</span>
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
