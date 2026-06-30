import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Sparkles, ExternalLink } from "lucide-react";
import { Drawer } from "./Drawer";
import { useReportFeedback } from "@workspace/api-client-react";
import { useAppState } from "@/lib/store";
import {
  galaxyData,
  runAskQuery,
  getCorpusSummary,
  getAskFields,
  type Paper,
  type AskResult,
} from "@/data/galaxy";
import { streamAsk, type AskAction, type AskMessage } from "@/lib/askStream";
import { getDomainColorStr } from "@/lib/colors";
import { MessageCircleStar } from "./MessageCircleStar";
import {
  ChatMessage,
  ChatThinking,
  ChatComposer,
  StreamCaret,
} from "./ui/chat";

export function AskDrawer() {
  const { askOpen, setAskOpen, setCameraMode, setSelectedObject } =
    useAppState();

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

  return (
    <Drawer
      open={askOpen}
      onClose={() => setAskOpen(false)}
      labelledBy="ask-drawer-title"
    >
      <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-accent">
        <MessageCircleStar size={12} /> Ask Cosmo
      </span>
      <h2
        id="ask-drawer-title"
        className="mt-1 mb-2 text-2xl font-title font-bold tracking-tight text-ink"
      >
        Ask anything about this work
      </h2>
      <p className="mb-6 text-[13px] leading-relaxed text-ink-dim">
        Chat about the science, ask how Cosmograph works, or report a bug. Ask a
        data question and matching papers light up across the galaxy — every count
        is computed from the data, never invented.
      </p>

      <AskPanel domainIndexById={domainIndexById} onPickPaper={pickPaper} />
    </Drawer>
  );
}

// A single conversation turn shown in the UI. The assistant streams a reasoning
// trace then an answer; for "data" turns the count + papers are computed locally
// (runAskQuery), and for "feedback" turns the report is filed to Linear and the
// turn carries the resulting issue link.
interface Turn {
  id: number;
  question: string;
  // Set once the model classifies the turn (drives feedback labels / data UI).
  actionKind?: AskAction["action"];
  feedbackKind?: "bug" | "feature";
  reasoning: string;
  answer: string;
  status: "streaming" | "done" | "error";
  // Deterministic results for a "data" turn.
  papers: Paper[];
  matchCount: number | null;
  totalCount: number | null;
  issueUrl?: string;
  issueNumber?: number;
}

// Build the answer for a "data" turn deterministically from the in-browser
// query result. The model's free-form prose is intentionally ignored for data
// turns so a stated count can NEVER be a model hallucination — every number here
// comes from runAskQuery over the local corpus.
function dataAnswer(action: Extract<AskAction, { action: "data" }>, r: AskResult): string {
  if (r.count === 0) {
    return "No papers match that — nothing lit up. Try loosening the filter or asking another way.";
  }
  if (action.query.intent === "count") {
    const noun = r.count === 1 ? "paper matches" : "papers match";
    return `${r.count.toLocaleString()} of ${r.total.toLocaleString()} ${noun} — they're lit up across the galaxy now.`;
  }
  // list
  const shown = r.matched.length;
  if (shown < r.count) {
    return `Showing the top ${shown} of ${r.count.toLocaleString()} matching papers, lit up in the galaxy and listed below — click any to open its details.`;
  }
  const noun = r.count === 1 ? "paper matches" : "papers match";
  return `${r.count.toLocaleString()} ${noun} — they're lit up in the galaxy and listed below; click any to open its details.`;
}

function newTurn(id: number, question: string): Turn {
  return {
    id,
    question,
    reasoning: "",
    answer: "",
    status: "streaming",
    papers: [],
    matchCount: null,
    totalCount: null,
  };
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
  const [turns, setTurns] = useState<Turn[]>([]);
  const turnId = useRef(0);
  const report = useReportFeedback();
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  // The rolling conversation sent to the model for multi-turn context. Mirrors
  // the visible turns but as plain role/content messages.
  const historyRef = useRef<AskMessage[]>([]);

  const domainNames = useMemo(() => galaxyData.domains.map((d) => d.name), []);

  // Keep the latest message in view as content streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  // Stop streaming on unmount / drawer close.
  useEffect(() => () => abortRef.current?.abort(), []);

  const patchTurn = useCallback((id: number, patch: Partial<Turn>) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const appendTurn = useCallback(
    (id: number, key: "reasoning" | "answer", delta: string) => {
      setTurns((prev) =>
        prev.map((t) => (t.id === id ? { ...t, [key]: t[key] + delta } : t)),
      );
    },
    [],
  );

  // Handle the model's classification. "data" runs the deterministic query and
  // lights up the galaxy; "feedback" files a Linear issue; explain/chat are prose
  // only.
  const onAction = useCallback(
    (id: number, action: AskAction) => {
      patchTurn(id, { actionKind: action.action });
      if (action.action === "data") {
        const result = runAskQuery(action.query);
        setFilters(result.filters);
        patchTurn(id, {
          papers: result.matched,
          matchCount: result.count,
          totalCount: result.total,
          // Authoritative, deterministic answer — model prose is ignored below.
          answer: dataAnswer(action, result),
        });
      } else if (action.action === "feedback") {
        patchTurn(id, { feedbackKind: action.feedbackKind });
        void report
          .mutateAsync({
            data: {
              kind: action.feedbackKind,
              message: action.message || "(no description)",
            },
          })
          .then((issue) =>
            patchTurn(id, { issueUrl: issue.url, issueNumber: issue.number }),
          )
          .catch(() => {
            /* the model's prose still thanks them; link just won't show */
          });
      }
    },
    [patchTurn, setFilters, report],
  );

  const ask = useCallback(
    async (question: string, id: number) => {
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;
      const messages: AskMessage[] = [
        ...historyRef.current,
        { role: "user", content: question },
      ];
      try {
        await streamAsk(
          {
            messages,
            fields: getAskFields(),
            domains: domainNames,
            summary: getCorpusSummary(),
          },
          {
            signal: controller.signal,
            onAction: (a) => onAction(id, a),
            onReasoning: (d) => appendTurn(id, "reasoning", d),
            onAnswer: (d) =>
              // Data turns use the deterministic answer set in onAction; ignore
              // the model's prose so a stated number can never be hallucinated.
              setTurns((prev) =>
                prev.map((t) =>
                  t.id === id && t.actionKind !== "data"
                    ? { ...t, answer: t.answer + d }
                    : t,
                ),
              ),
            onError: (msg) =>
              patchTurn(id, {
                status: "error",
                answer: msg,
              }),
          },
        );
        // Commit the assistant's answer into the rolling history for context.
        setTurns((prev) => {
          const t = prev.find((x) => x.id === id);
          if (t && t.status !== "error") {
            historyRef.current = [
              ...messages,
              { role: "assistant", content: t.answer },
            ];
          }
          return prev.map((x) =>
            x.id === id && x.status !== "error"
              ? { ...x, status: "done" }
              : x,
          );
        });
      } catch {
        // Aborted or network failure mid-stream.
        patchTurn(id, {
          status: "error",
          answer:
            "Lost the connection to the assistant. The galaxy still works — try again.",
        });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setBusy(false);
      }
    },
    [domainNames, onAction, appendTurn, patchTurn],
  );

  const submit = (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput("");
    const id = ++turnId.current;
    setTurns((prev) => [...prev, newTurn(id, text)]);
    void ask(text, id);
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const clear = () => {
    abortRef.current?.abort();
    setTurns([]);
    historyRef.current = [];
    resetFilters();
  };

  // Starter prompts shown before the first question — one is seeded from the
  // active scientist's top research domain so it stays relevant after a swap.
  const suggestions = useMemo(() => {
    const chips = ["Most cited papers", "How does this galaxy work?", "Papers since 2015"];
    const topDomain = galaxyData.domains[0]?.name;
    if (topDomain) chips.splice(1, 0, `Work on ${topDomain}`);
    return chips;
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <ChatComposer
        value={input}
        onChange={setInput}
        onSend={() => submit(input)}
        onStop={stop}
        busy={busy}
        placeholder="Ask about this work, or report a bug…"
        leading={<Sparkles size={15} />}
      />

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
            Answers are computed from the data, never invented. Off-topic? Cosmo
            keeps things about the science.
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

      <div
        ref={scrollRef}
        className="flex max-h-[52vh] flex-col gap-3 overflow-y-auto custom-scrollbar scroll-fade"
      >
        {turns.map((t) => (
          <div key={t.id} className="flex flex-col gap-1.5">
            <ChatMessage role="user" feedbackKind={t.feedbackKind}>
              {t.question}
            </ChatMessage>

            <ChatThinking
              text={t.reasoning}
              active={t.status === "streaming" && !t.answer}
            />

            {/* Deterministic count for a data turn (the model never states this). */}
            {t.matchCount != null && t.totalCount != null && (
              <span className="self-start font-mono text-[10px] uppercase tracking-widest text-accent">
                {t.matchCount} of {t.totalCount} papers match
              </span>
            )}

            {(t.answer || t.status !== "streaming") && (
              <ChatMessage role="assistant">
                {t.answer}
                {t.status === "streaming" && t.answer && <StreamCaret />}
              </ChatMessage>
            )}

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
    </div>
  );
}
