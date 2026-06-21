import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Sun,
  Globe2,
  X,
  Filter,
  ListFilter,
  Info,
  Orbit,
  Compass,
  Rewind,
  Map,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Check,
} from "lucide-react";
import { useAppState } from "@/lib/store";
import {
  galaxyData,
  yearRange,
  maxCitations,
  isFiltersActive,
  countMatchingPapers,
  getMatchingPapers,
} from "@/data/galaxy";
import { getDomainColorStr } from "@/lib/colors";
import { ShareButton } from "./ShareButton";
import { GitHubLink } from "./GitHubLink";

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
    selectedObject,
    setSearchActive,
    filters,
    setFilters,
    resetFilters,
    setInfoOpen,
    replayIntro,
    startTour,
  } = useAppState();

  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [domainMenuOpen, setDomainMenuOpen] = useState(false);
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
  const matchingPapers = useMemo(
    () => (filtersActive ? getMatchingPapers(filters) : []),
    [filters, filtersActive],
  );

  const minYear = filters.minYear ?? yearRange.min;
  const maxYear = filters.maxYear ?? yearRange.max;
  const numInputCls =
    "bg-white/5 border-2 border-edge px-2 py-1 font-mono text-xs text-ink outline-none focus:border-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

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

  const domainNameById = useMemo<Record<string, string>>(
    () => Object.fromEntries(galaxyData.domains.map((d) => [d.id, d.name])),
    [],
  );
  const toggleDomain = (id: string) => {
    const next = new Set(filters.domainIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFilters({ domainIds: [...next] });
  };
  const selectedDomainLabel =
    filters.domainIds.length === 0
      ? "All domains"
      : filters.domainIds.length === 1
        ? (domainNameById[filters.domainIds[0]] ?? "1 selected")
        : `${filters.domainIds.length} domains`;

  const expandWithSearch = () => {
    focusOnOpen.current = true;
    setOpen(true);
  };
  const expandWithFilters = () => {
    setOpen(true);
  };

  return (
    <div
      className={`console-panel relative z-30 flex h-full shrink-0 flex-col overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[width] ${
        open ? "w-[min(16rem,80vw)]" : "w-14"
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
              {/* Share */}
              <div className="flex flex-col gap-2">
                <SectionLabel>Share</SectionLabel>
                <div className="flex flex-col gap-1.5">
                  <GitHubLink full />
                  <ShareButton full />
                </div>
              </div>

              {/* Navigate */}
              <div className="flex flex-col gap-1.5 border-t-2 border-edge pt-3">
                <SectionLabel>Navigate</SectionLabel>
                <ConsoleButton
                  onClick={() => setInfoOpen(true)}
                  icon={<Info size={14} />}
                  label="Info"
                />
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
                />
                <ConsoleButton
                  onClick={startTour}
                  icon={<Map size={14} />}
                  label="Tour"
                />
                <ConsoleButton
                  onClick={replayIntro}
                  icon={<Rewind size={14} />}
                  label="Replay"
                />
              </div>

              {/* Search */}
              <div className="flex flex-col gap-2 border-t-2 border-edge pt-3">
                <SectionLabel>Search</SectionLabel>
                <div>
                  <div className="flex items-center gap-2 border-2 border-edge bg-white/5 px-2 focus-within:border-accent">
                    <Search size={15} className="shrink-0 text-ink-dim" />
                    <input
                      ref={inputRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search papers, domains…"
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
              </div>

              {/* Filter */}
              <div className="flex flex-col gap-3 border-t-2 border-edge pt-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Filter
                      size={13}
                      className={filtersActive ? "text-accent" : "text-ink-dim"}
                    />
                    <SectionLabel>Filter</SectionLabel>
                  </span>
                  <span
                    className={`font-mono text-[11px] ${filtersActive ? "text-accent" : "text-ink-dim"}`}
                  >
                    {filtersActive ? `${matchCount}/${totalPapers}` : `${totalPapers} papers`}
                  </span>
                </div>

                {/* Citations — single line: [#] Citations */}
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    aria-label="Minimum citations"
                    min={0}
                    max={maxCitations}
                    value={filters.minCitations}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setFilters({
                        minCitations: Number.isNaN(v)
                          ? 0
                          : Math.min(Math.max(v, 0), maxCitations),
                      });
                    }}
                    className={`w-16 ${numInputCls}`}
                  />
                  <span className="font-mono text-[11px] uppercase tracking-widest text-ink-dim">
                    Citations
                  </span>
                </div>

                {/* Year range — single line: [YYYY] – [YYYY] Year range */}
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    inputMode="numeric"
                    aria-label="Start year"
                    min={yearRange.min}
                    max={maxYear}
                    value={minYear}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (Number.isNaN(v)) return;
                      const c = Math.min(Math.max(v, yearRange.min), maxYear);
                      setFilters({ minYear: c <= yearRange.min ? null : c });
                    }}
                    className={`w-14 ${numInputCls}`}
                  />
                  <span className="font-mono text-xs text-ink-dim">–</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    aria-label="End year"
                    min={minYear}
                    max={yearRange.max}
                    value={maxYear}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (Number.isNaN(v)) return;
                      const c = Math.max(Math.min(v, yearRange.max), minYear);
                      setFilters({ maxYear: c >= yearRange.max ? null : c });
                    }}
                    className={`w-14 ${numInputCls}`}
                  />
                  <span className="font-mono text-[11px] uppercase tracking-widest text-ink-dim">
                    Years
                  </span>
                </div>

                {/* Domain — multi-select dropdown */}
                <div>
                  <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-widest text-ink-dim">
                    Domain
                  </span>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setDomainMenuOpen((o) => !o)}
                      aria-expanded={domainMenuOpen}
                      className="flex w-full items-center justify-between gap-2 border-2 border-edge bg-white/5 px-2 py-1.5 text-left text-xs text-ink transition-colors hover:bg-white/10"
                    >
                      <span className="min-w-0 flex-1 truncate">{selectedDomainLabel}</span>
                      <ChevronDown
                        size={14}
                        className={`shrink-0 text-ink-dim transition-transform ${
                          domainMenuOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {domainMenuOpen && (
                      <div className="mt-1 max-h-[11rem] overflow-y-auto custom-scrollbar border-2 border-edge bg-black/50">
                        <DomainOption
                          checked={filters.domainIds.length === 0}
                          onClick={() => setFilters({ domainIds: [] })}
                        >
                          All domains
                        </DomainOption>
                        {galaxyData.domains.map((d) => (
                          <DomainOption
                            key={d.id}
                            checked={filters.domainIds.includes(d.id)}
                            swatch={getDomainColorStr(domainIndexById[d.id] ?? 0)}
                            onClick={() => toggleDomain(d.id)}
                          >
                            {d.name}
                          </DomainOption>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {filtersActive && (
                  <div className="flex flex-col border-2 border-edge">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <ListFilter size={14} className="text-accent" />
                      <span className="font-display text-[11px] uppercase tracking-wider text-ink">
                        Matching
                      </span>
                      <span className="font-mono text-[11px] text-ink-dim">
                        {matchingPapers.length}
                      </span>
                      <button
                        onClick={resetFilters}
                        title="Clear filters"
                        className="ml-auto flex items-center gap-1 font-display text-[11px] uppercase tracking-wider text-ink-dim transition-colors hover:text-ink"
                      >
                        Clear <X size={12} />
                      </button>
                    </div>
                    <div className="max-h-[30vh] overflow-y-auto custom-scrollbar border-t-2 border-edge">
                      {matchingPapers.length === 0 ? (
                        <div className="px-3 py-5 text-center text-sm text-ink-dim">
                          No papers match these filters.
                        </div>
                      ) : (
                        matchingPapers.map((p) => {
                          const isSelected =
                            selectedObject?.type === "planet" && selectedObject.id === p.id;
                          return (
                            <button
                              key={p.id}
                              onClick={() => pickPaper(p.id)}
                              className={`flex w-full flex-col gap-1.5 border-b border-white/8 px-3 py-2.5 text-left transition-colors last:border-0 ${
                                isSelected ? "bg-accent/20" : "hover:bg-accent/15"
                              }`}
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
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
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
            <RailButton onClick={() => setOpen(true)} label="Expand console">
              <ChevronLeft size={16} />
            </RailButton>
            <Divider />
            <RailButton onClick={() => setInfoOpen(true)} label="Info">
              <Info size={16} />
            </RailButton>
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
            >
              <Compass size={15} />
            </RailButton>
            <RailButton onClick={startTour} label="Tour">
              <Map size={15} />
            </RailButton>
            <RailButton onClick={replayIntro} label="Replay">
              <Rewind size={15} />
            </RailButton>
            <Divider />
            <RailButton onClick={expandWithSearch} label="Search">
              <Search size={16} />
            </RailButton>
            <RailButton active={filtersActive} onClick={expandWithFilters} label="Filters">
              <Filter size={15} />
              {filtersActive && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-accent ring-2 ring-black" />
              )}
            </RailButton>
            <ShareButton />
            <GitHubLink compact />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-widest text-ink-dim">{children}</span>
  );
}

function ConsoleButton({
  active = false,
  onClick,
  icon,
  label,
}: {
  active?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={label}
      style={active ? { background: "var(--accent)" } : undefined}
      className={`flex w-full items-center gap-2 border-2 border-edge px-3 py-2 text-[11px] font-display uppercase tracking-wider transition-all ${
        active ? "text-accent-foreground" : "bg-white/5 text-ink hover:bg-white/10"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function RailButton({
  active = false,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      style={active ? { background: "var(--accent)" } : undefined}
      className={`relative flex h-9 w-9 items-center justify-center border-2 border-edge transition-all ${
        active ? "text-accent-foreground" : "bg-white/5 text-ink hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="my-0.5 h-px w-6 bg-edge/60" />;
}

function DomainOption({
  checked,
  swatch,
  onClick,
  children,
}: {
  checked: boolean;
  swatch?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onClick}
      className="flex w-full items-center gap-2 border-b border-white/8 px-2 py-1.5 text-left text-xs text-ink transition-colors last:border-0 hover:bg-accent/15"
    >
      <span
        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center border-2 border-edge ${
          checked ? "bg-accent" : ""
        }`}
      >
        {checked && <Check size={10} className="text-accent-foreground" />}
      </span>
      {swatch && (
        <span
          className="h-2 w-2 shrink-0 border border-edge"
          style={{ background: swatch }}
        />
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}
