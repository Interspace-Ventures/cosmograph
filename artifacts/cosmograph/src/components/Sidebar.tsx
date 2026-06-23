import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Sun,
  Globe2,
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

interface SearchResult {
  type: "sun" | "planet";
  id: string;
  title: string;
  subtitle: string;
}

type SearchIndexItem = SearchResult & { haystack: string };

export function Sidebar() {
  const {
    setCameraMode,
    cameraMode,
    setSelectedObject,
    setSearchActive,
    filters,
    setInfoOpen,
    replayIntro,
    startTour,
    canExplore,
    consoleOpen: open,
    setConsoleOpen: setOpen,
  } = useAppState();

  const [query, setQuery] = useState("");
  const { openSections, toggleSection } = useSectionState();
  const inputRef = useRef<HTMLInputElement>(null);
  const focusOnOpen = useRef(false);

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
  const searchIndex = useMemo<SearchIndexItem[]>(
    () => [
      ...galaxyData.domains.map((d) => ({
        type: "sun" as const,
        id: d.id,
        title: d.name,
        subtitle: `Domain · ${d.paperCount} papers`,
        haystack: `${d.name} ${d.field}`.toLowerCase(),
      })),
      ...galaxyData.papers.map((p) => ({
        type: "planet" as const,
        id: p.id,
        title: p.title,
        subtitle: `${p.year ?? ""} · ${p.citations.toLocaleString()} citations`,
        haystack: `${p.title} ${p.coAuthors.join(" ")} ${p.year ?? ""}`.toLowerCase(),
      })),
    ],
    [],
  );

  const filtersActive = isFiltersActive(filters);
  const totalPapers = galaxyData.papers.length;
  const matchCount = useMemo(
    () => (filtersActive ? countMatchingPapers(filters) : totalPapers),
    [filters, filtersActive, totalPapers],
  );

  const results: SearchResult[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: SearchResult[] = [];
    for (const item of searchIndex) {
      if (item.haystack.includes(q)) {
        out.push({ type: item.type, id: item.id, title: item.title, subtitle: item.subtitle });
        if (out.length >= 14) break;
      }
    }
    return out;
  }, [query, searchIndex]);

  useEffect(() => {
    setSearchActive(results.length > 0);
  }, [results.length, setSearchActive]);

  useEffect(() => () => setSearchActive(false), [setSearchActive]);

  useEffect(() => {
    if (open && focusOnOpen.current) {
      inputRef.current?.focus();
      focusOnOpen.current = false;
    }
  }, [open]);

  const pick = (r: SearchResult) => {
    setCameraMode("god");
    setSelectedObject({ type: r.type, id: r.id });
    setQuery("");
    inputRef.current?.blur();
  };
  const pickPaper = (id: string) => {
    setCameraMode("god");
    setSelectedObject({ type: "planet", id });
  };

  const expandWithSearch = () => {
    focusOnOpen.current = true;
    setOpen(true);
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
              {/* Account */}
              <CollapsibleSection
                icon={<UserRound size={15} />}
                title="Account"
                isOpen={openSections.account}
                onToggle={() => toggleSection("account")}
                first
              >
                <div className="flex flex-col gap-1.5">
                  <AccountIndicator />
                  <ConsoleButton
                    onClick={() => setInfoOpen(true)}
                    icon={<Info size={14} />}
                    label="Info"
                  />
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

              {/* Find — quick jump search */}
              <CollapsibleSection
                icon={<Search size={15} className="text-ink-dim" />}
                title="Find"
                isOpen={openSections.find}
                onToggle={() => toggleSection("find")}
              >
                <div>
                  <div className="flex items-center gap-2 border-2 border-edge bg-white/5 px-2 focus-within:border-accent">
                    <Search size={15} className="shrink-0 text-ink-dim" />
                    <input
                      ref={inputRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Jump to a paper or domain…"
                      className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink placeholder:text-ink-dim/70 focus:outline-none"
                    />
                    {query && (
                      <button
                        onClick={() => setQuery("")}
                        className="shrink-0 text-ink-dim hover:text-ink"
                        aria-label="Clear search"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  {results.length > 0 && (
                    <div className="mt-1.5 max-h-[34vh] overflow-y-auto custom-scrollbar border-2 border-edge">
                      {results.map((r) => (
                        <button
                          key={`${r.type}-${r.id}`}
                          onClick={() => pick(r)}
                          className="flex w-full items-center gap-2.5 border-b border-white/8 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-accent/15"
                        >
                          {r.type === "sun" ? (
                            <Sun size={14} className="shrink-0 text-accent" />
                          ) : (
                            <Globe2 size={14} className="shrink-0 text-ink-dim" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-ink">{r.title}</span>
                            <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-ink-dim">
                              {r.subtitle}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
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
            {/* Account */}
            <AccountIndicatorRail />
            <RailButton onClick={() => setInfoOpen(true)} label="Info">
              <Info size={16} />
            </RailButton>
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
            {/* Share */}
            <RailTip label="GitHub">
              <GitHubLink compact />
            </RailTip>
            <RailTip label="Share">
              <ShareButton />
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
            {/* Find + Ask */}
            <RailButton onClick={expandWithSearch} label="Find">
              <Search size={16} />
            </RailButton>
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

type SectionKey = "account" | "share" | "navigate" | "find" | "ask";

const SECTION_STORAGE_KEY = "galaxy.console.sections";
const DEFAULT_SECTIONS: Record<SectionKey, boolean> = {
  account: true,
  share: true,
  navigate: true,
  find: true,
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

// A single Q&A turn. The answer text and papers are computed deterministically
// by runAskQuery — the model never returns numbers or paper lists.
interface AskTurn {
  id: number;
  question: string;
  status: "ok" | "unsupported" | "error";
  answer: string;
  papers: Paper[];
  count: number;
}

// Compose the answer text from the locally-computed result. ALL numbers here
// come from `r` (the deterministic run), not from the model.
function composeAnswer(q: AskQuery, r: AskResult): string {
  if (q.unsupported) {
    return "I can only answer questions about this scientist's papers — try topics, years, citation counts, or co-authors. If something's missing, report it below.";
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

  const domainNames = useMemo(() => galaxyData.domains.map((d) => d.name), []);

  const ask = async () => {
    const question = input.trim();
    if (!question || translate.isPending) return;
    setInput("");
    const id = ++turnId.current;
    try {
      const spec = await translate.mutateAsync({
        data: { question, fields: [...ASK_FIELDS], domains: domainNames },
      });
      const result = runAskQuery(spec);
      // Drive the existing dim/highlight path: matched papers light up.
      if (spec.unsupported) resetFilters();
      else setFilters(result.filters);
      setTurns((prev) => [
        ...prev,
        {
          id,
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
          question,
          status: "error",
          answer: "Couldn't reach the translator just now. Please try again.",
          papers: [],
          count: 0,
        },
      ]);
    }
  };

  const clear = () => {
    setTurns([]);
    resetFilters();
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Ask input */}
      <div className="flex items-center gap-2 border-2 border-edge bg-white/5 px-2 focus-within:border-accent">
        <Sparkles size={15} className="shrink-0 text-accent" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ask();
          }}
          placeholder="Ask about this work…"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink placeholder:text-ink-dim/70 focus:outline-none"
        />
        <button
          onClick={ask}
          disabled={!input.trim() || translate.isPending}
          aria-label="Ask"
          className="shrink-0 text-ink-dim transition-colors hover:text-accent disabled:opacity-40"
        >
          {translate.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <SendHorizontal size={16} />
          )}
        </button>
      </div>

      {turns.length === 0 ? (
        <p className="px-1 text-xs leading-relaxed text-ink-dim">
          Try “most cited papers”, “work on stem cells since 2010”, or “how many
          papers with more than 100 citations”. Answers are computed from the
          baked data — never invented.
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
          {/* Question */}
          <div className="self-end max-w-[90%] border-2 border-edge bg-accent/15 px-2.5 py-1.5 text-sm text-ink">
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

      <FeedbackForm />
    </div>
  );
}

// "Report a bug / request a feature" — files a public GitHub issue via the API.
function FeedbackForm() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"bug" | "feature">("bug");
  const [message, setMessage] = useState("");
  const report = useReportFeedback();
  const created = report.data;

  const submit = async () => {
    const msg = message.trim();
    if (!msg || report.isPending) return;
    try {
      await report.mutateAsync({ data: { kind, message: msg } });
      setMessage("");
    } catch {
      /* error surfaced via report.isError below */
    }
  };

  return (
    <div className="border-t-2 border-edge pt-3">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-ink-dim transition-colors hover:text-ink"
        >
          <Bug size={13} /> Report a bug / request a feature
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-widest text-ink-dim">
              Report
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close report form"
              className="text-ink-dim hover:text-ink"
            >
              <X size={13} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setKind("bug")}
              aria-pressed={kind === "bug"}
              style={kind === "bug" ? { background: "var(--accent)" } : undefined}
              className={`flex items-center justify-center gap-1.5 border-2 border-edge px-2 py-1.5 text-[11px] font-display uppercase tracking-wider transition-all ${
                kind === "bug" ? "text-accent-foreground" : "bg-white/5 text-ink hover:bg-white/10"
              }`}
            >
              <Bug size={12} /> Bug
            </button>
            <button
              onClick={() => setKind("feature")}
              aria-pressed={kind === "feature"}
              style={kind === "feature" ? { background: "var(--accent)" } : undefined}
              className={`flex items-center justify-center gap-1.5 border-2 border-edge px-2 py-1.5 text-[11px] font-display uppercase tracking-wider transition-all ${
                kind === "feature" ? "text-accent-foreground" : "bg-white/5 text-ink hover:bg-white/10"
              }`}
            >
              <Lightbulb size={12} /> Feature
            </button>
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder={
              kind === "bug"
                ? "What went wrong? Steps to reproduce help."
                : "What would you like to see?"
            }
            className="resize-none border-2 border-edge bg-white/5 px-2 py-1.5 text-sm text-ink outline-none placeholder:text-ink-dim/70 focus:border-accent"
          />
          {created ? (
            <a
              href={created.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 border-2 border-edge bg-white/5 px-2 py-1.5 text-[11px] font-display uppercase tracking-wider text-accent transition-colors hover:bg-white/10"
            >
              <ExternalLink size={12} /> Filed #{created.number} — view on GitHub
            </a>
          ) : (
            <button
              onClick={submit}
              disabled={!message.trim() || report.isPending}
              className="flex items-center justify-center gap-1.5 border-2 border-edge bg-white/5 px-2 py-1.5 text-[11px] font-display uppercase tracking-wider text-ink transition-all hover:bg-white/10 disabled:opacity-40"
            >
              {report.isPending ? <Loader2 size={12} className="animate-spin" /> : null}
              {report.isPending ? "Filing…" : "Submit"}
            </button>
          )}
          {report.isError && (
            <span className="text-[11px] text-ink-dim">
              Couldn't file that right now. Please try again later.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
