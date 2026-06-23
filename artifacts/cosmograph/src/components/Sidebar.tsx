import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Info,
  Orbit,
  Compass,
  Rewind,
  Map,
  Navigation,
  Share2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Sparkles,
  Heart,
  Lock,
  UserRound,
  MessageCircleQuestion,
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
  isFiltersActive,
  countMatchingPapers,
  runAskQuery,
  type AskQuery,
  type AskResult,
  type Paper,
} from "@/data/galaxy";
import { getDomainColorStr } from "@/lib/colors";
import { SITE } from "@/config/site";
import { ShareButton } from "./ShareButton";
import { GitHubLink } from "./GitHubLink";
import { AccountIndicator, AccountIndicatorRail } from "./AccountIndicator";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "./ui/tooltip";

export function Sidebar() {
  const {
    setCameraMode,
    cameraMode,
    setSelectedObject,
    filters,
    setInfoOpen,
    replayIntro,
    startTour,
    canExplore,
    consoleOpen: open,
    setConsoleOpen: setOpen,
  } = useAppState();

  const { openSections, toggleSection } = useSectionState();

  // Built from live galaxyData at mount; the whole Sidebar remounts on a dataset
  // swap (key={datasetVersion}), so these stay in sync with the active scientist.
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

  const filtersActive = isFiltersActive(filters);
  const totalPapers = galaxyData.papers.length;
  const matchCount = useMemo(
    () => (filtersActive ? countMatchingPapers(filters) : totalPapers),
    [filters, filtersActive, totalPapers],
  );

  const pickPaper = (id: string) => {
    setCameraMode("god");
    setSelectedObject({ type: "planet", id });
  };

  const expandWithAsk = () => {
    setOpen(true);
  };

  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={400}>
    <div
      className={`console-panel absolute right-0 top-0 z-30 flex h-full flex-col overflow-hidden transition-[width] duration-[450ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[width] ${
        open ? "w-[min(14rem,80vw)]" : "w-14"
      }`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          <motion.div
            key="panel"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.18 }}
            className="flex h-full w-full flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b-2 border-edge px-3 py-2">
              <span className="font-display text-xs uppercase tracking-wider text-ink">
                Flight Console
              </span>
              <button
                onClick={() => setOpen(false)}
                title="Collapse console"
                aria-label="Collapse console"
                className="flex h-7 w-7 items-center justify-center border-2 border-edge bg-white/5 text-ink-dim transition-colors hover:bg-white/10 hover:text-ink"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            {/* Scroll body */}
            <div className="flex flex-col gap-4 overflow-y-auto custom-scrollbar p-3">
              {/* Info */}
              <ConsoleButton
                onClick={() => setInfoOpen(true)}
                icon={<Info size={14} />}
                label="Info"
              />

              {/* Profile */}
              <CollapsibleSection
                icon={<UserRound size={15} />}
                title="Profile"
                isOpen={openSections.account}
                onToggle={() => toggleSection("account")}
              >
                <div className="flex flex-col gap-1.5">
                  <AccountIndicator />
                </div>
              </CollapsibleSection>

              {/* Share */}
              <CollapsibleSection
                icon={<Share2 size={15} />}
                title="Share"
                isOpen={openSections.share}
                onToggle={() => toggleSection("share")}
              >
                <div className="flex flex-col gap-1.5">
                  <GitHubLink full />
                  <ShareButton full />
                  <a
                    href={SITE.github.sponsors}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Support development via GitHub Sponsors"
                    className="flex h-9 w-full items-center gap-2 border-2 border-edge bg-white/5 px-3 text-ink transition-all hover:bg-white/10"
                  >
                    <Heart size={14} className="shrink-0 text-accent" />
                    <span className="font-display text-[11px] uppercase tracking-wider">
                      Donate
                    </span>
                  </a>
                </div>
              </CollapsibleSection>

              {/* Navigate */}
              <CollapsibleSection
                icon={<Navigation size={15} />}
                title="Navigate"
                isOpen={openSections.navigate}
                onToggle={() => toggleSection("navigate")}
              >
                <div className="flex flex-col gap-1.5">
                  <ConsoleButton
                    active={cameraMode === "god"}
                    onClick={() => setCameraMode("god")}
                    icon={<Orbit size={14} />}
                    label="Orbit"
                  />
                  <ConsoleButton
                    active={cameraMode === "spaceship"}
                    onClick={() => setCameraMode("spaceship")}
                    icon={<Compass size={14} />}
                    label="Fly"
                    locked={!canExplore}
                  />
                  <ConsoleButton
                    onClick={startTour}
                    icon={<Map size={14} />}
                    label="Tour"
                    locked={!canExplore}
                  />
                  <ConsoleButton
                    onClick={replayIntro}
                    icon={<Rewind size={14} />}
                    label="Replay"
                  />
                </div>
              </CollapsibleSection>

              {/* Ask the galaxy */}
              <CollapsibleSection
                icon={
                  <MessageCircleQuestion
                    size={15}
                    className={filtersActive ? "text-accent" : "text-ink-dim"}
                  />
                }
                title="Ask"
                isOpen={openSections.ask}
                onToggle={() => toggleSection("ask")}
                right={
                  filtersActive ? (
                    <span className="font-mono text-[11px] text-accent">
                      {matchCount}/{totalPapers}
                    </span>
                  ) : undefined
                }
              >
                <AskPanel domainIndexById={domainIndexById} onPickPaper={pickPaper} />
              </CollapsibleSection>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="rail"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.18 }}
            className="flex h-full w-full flex-col items-center gap-1 p-1.5"
          >
            {/* Header — mirrors the expanded console header (collapse toggle) */}
            <RailButton onClick={() => setOpen(true)} label="Expand console">
              <ChevronLeft size={16} />
            </RailButton>
            <Divider />
            {/* Info + Profile */}
            <RailButton onClick={() => setInfoOpen(true)} label="Info">
              <Info size={16} />
            </RailButton>
            <AccountIndicatorRail />
            <Divider />
            {/* Share */}
            <RailTip label="GitHub">
              <GitHubLink compact />
            </RailTip>
            <RailTip label="Share">
              <ShareButton />
            </RailTip>
            <RailTip label="Donate">
              <a
                href={SITE.github.sponsors}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Donate via GitHub Sponsors"
                className="relative flex h-9 w-9 items-center justify-center border-2 border-edge bg-white/5 text-accent transition-all hover:bg-white/10"
              >
                <Heart size={15} />
              </a>
            </RailTip>
            <Divider />
            {/* Navigate */}
            <RailButton
              active={cameraMode === "god"}
              onClick={() => setCameraMode("god")}
              label="Orbit"
            >
              <Orbit size={15} />
            </RailButton>
            <RailButton
              active={cameraMode === "spaceship"}
              onClick={() => setCameraMode("spaceship")}
              label="Fly"
              locked={!canExplore}
            >
              <Compass size={15} />
            </RailButton>
            <RailButton onClick={startTour} label="Tour" locked={!canExplore}>
              <Map size={16} />
            </RailButton>
            <RailButton onClick={replayIntro} label="Replay">
              <Rewind size={16} />
            </RailButton>
            <Divider />
            {/* Ask */}
            <RailButton active={filtersActive} onClick={expandWithAsk} label="Ask">
              <MessageCircleQuestion size={15} />
              {filtersActive && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-accent ring-2 ring-black" />
              )}
            </RailButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </TooltipProvider>
  );
}

type SectionKey = "account" | "share" | "navigate" | "ask";

const SECTION_STORAGE_KEY = "galaxy.console.sections";
const DEFAULT_SECTIONS: Record<SectionKey, boolean> = {
  account: true,
  share: true,
  navigate: true,
  ask: true,
};

function useSectionState() {
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(
    () => {
      try {
        const raw = localStorage.getItem(SECTION_STORAGE_KEY);
        if (raw) return { ...DEFAULT_SECTIONS, ...JSON.parse(raw) };
      } catch {
        /* ignore */
      }
      return DEFAULT_SECTIONS;
    },
  );
  const toggleSection = (key: SectionKey) =>
    setOpenSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  return { openSections, toggleSection };
}

function CollapsibleSection({
  icon,
  title,
  isOpen,
  onToggle,
  right,
  first = false,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  right?: React.ReactNode;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={first ? "" : "border-t-2 border-edge pt-3"}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <SectionLabel icon={icon}>{title}</SectionLabel>
        <span className="flex items-center gap-2">
          {right}
          <ChevronDown
            size={14}
            className={`shrink-0 text-ink-dim transition-transform ${
              isOpen ? "" : "-rotate-90"
            }`}
          />
        </span>
      </button>
      {isOpen && <div className="mt-3">{children}</div>}
    </div>
  );
}

function SectionLabel({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-2 font-mono text-[13px] uppercase tracking-widest text-ink-dim">
      {icon}
      {children}
    </span>
  );
}

function ConsoleButton({
  active = false,
  onClick,
  icon,
  label,
  locked = false,
}: {
  active?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  locked?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={locked ? `${label} — unlock to explore` : label}
      style={active ? { background: "var(--accent)" } : undefined}
      className={`flex w-full items-center gap-2 border-2 border-edge px-3 py-2 text-[11px] font-display uppercase tracking-wider transition-all ${
        active ? "text-accent-foreground" : "bg-white/5 text-ink hover:bg-white/10"
      }`}
    >
      {icon}
      {label}
      {locked && <Lock size={11} className="ml-auto opacity-70" />}
    </button>
  );
}

function RailTipContent({ children }: { children: React.ReactNode }) {
  return (
    <TooltipContent
      side="left"
      sideOffset={8}
      className="rounded-none border-2 border-edge bg-black/90 px-2 py-1 font-display text-[10px] uppercase tracking-wider text-ink"
    >
      {children}
    </TooltipContent>
  );
}

// Tooltip wrapper for rail items that render their own root element
// (links, the share button, the account glyph). The span trigger receives the
// hover handlers so we don't depend on each child forwarding refs/props.
function RailTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{children}</span>
      </TooltipTrigger>
      <RailTipContent>{label}</RailTipContent>
    </Tooltip>
  );
}

function RailButton({
  active = false,
  onClick,
  label,
  children,
  locked = false,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  locked?: boolean;
}) {
  const tip = locked ? `${label} — unlock to explore` : label;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-pressed={active}
          aria-label={tip}
          style={active ? { background: "var(--accent)" } : undefined}
          className={`relative flex h-9 w-9 items-center justify-center border-2 border-edge transition-all ${
            active ? "text-accent-foreground" : "bg-white/5 text-ink hover:bg-white/10"
          }`}
        >
          {children}
          {locked && (
            <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Lock size={8} />
            </span>
          )}
        </button>
      </TooltipTrigger>
      <RailTipContent>{tip}</RailTipContent>
    </Tooltip>
  );
}

function Divider() {
  return <div className="my-0.5 h-px w-6 bg-edge/60" />;
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
// For "bug"/"feature" turns the message is filed to Linear and the turn carries
// the resulting issue link.
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
    return "I can only answer questions about this scientist's papers — try topics, years, citation counts, or co-authors. If something's missing, switch to Bug or Feature above to tell the team.";
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
  const [mode, setMode] = useState<AskMode>("ask");
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const turnId = useRef(0);
  const translate = useTranslateAsk();
  const report = useReportFeedback();

  const domainNames = useMemo(() => galaxyData.domains.map((d) => d.name), []);
  const busy = translate.isPending || report.isPending;

  // Ask mode: translate → run the deterministic query → light up matches.
  const runAsk = async (question: string, id: number) => {
    try {
      const spec = await translate.mutateAsync({
        data: { question, fields: [...ASK_FIELDS], domains: domainNames },
      });
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

  // Bug/Feature mode: file the message straight to Linear, link the issue.
  const runReport = async (kind: "bug" | "feature", message: string, id: number) => {
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
              ? "Thanks — filed as a bug report. The team will take a look."
              : "Thanks — filed as a feature request. The team will take a look.",
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

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const id = ++turnId.current;
    if (mode === "ask") void runAsk(text, id);
    else void runReport(mode, text, id);
  };

  const clear = () => {
    setTurns([]);
    resetFilters();
  };

  const placeholder =
    mode === "ask"
      ? "Ask about this work…"
      : mode === "bug"
        ? "Describe the bug — steps to reproduce help…"
        : "Describe the feature you'd like…";

  const InputIcon = mode === "ask" ? Sparkles : mode === "bug" ? Bug : Lightbulb;

  return (
    <div className="flex flex-col gap-3">
      {/* Mode pills — Ask the galaxy, or send a bug / feature report */}
      <div className="grid grid-cols-3 gap-1.5">
        <ModePill active={mode === "ask"} onClick={() => setMode("ask")} icon={<Sparkles size={12} />} label="Ask" />
        <ModePill active={mode === "bug"} onClick={() => setMode("bug")} icon={<Bug size={12} />} label="Bug" />
        <ModePill active={mode === "feature"} onClick={() => setMode("feature")} icon={<Lightbulb size={12} />} label="Feature" />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 border-2 border-edge bg-white/5 px-2 focus-within:border-accent">
        <InputIcon size={15} className="shrink-0 text-accent" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink placeholder:text-ink-dim/70 focus:outline-none"
        />
        <button
          onClick={send}
          disabled={!input.trim() || busy}
          aria-label={mode === "ask" ? "Ask" : "Send report"}
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
        <p className="px-1 text-xs leading-relaxed text-ink-dim">
          {mode === "ask"
            ? "Try “most cited papers”, “work on stem cells since 2010”, or “how many papers with more than 100 citations”. Answers are computed from the baked data — never invented. Switch to Bug or Feature to send feedback to the team."
            : mode === "bug"
              ? "Spotted something broken? Describe it and we'll file it for the team."
              : "Have an idea to make this better? Send it and we'll file it for the team."}
        </p>
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

// Segmented control selecting the chat mode: ask the galaxy, report a bug, or
// request a feature.
function ModePill({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={active ? { background: "var(--accent)" } : undefined}
      className={`flex items-center justify-center gap-1 border-2 border-edge px-2 py-1.5 text-[10px] font-display uppercase tracking-wider transition-all ${
        active ? "text-accent-foreground" : "bg-white/5 text-ink hover:bg-white/10"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
