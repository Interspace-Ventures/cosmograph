import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Sun, Globe2, X, Filter, ListFilter, Check } from "lucide-react";
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

interface SearchResult {
  type: "sun" | "planet";
  id: string;
  title: string;
  subtitle: string;
}

const domainIndexById: Record<string, number> = galaxyData.domains.reduce(
  (acc, d, i) => {
    acc[d.id] = i;
    return acc;
  },
  {} as Record<string, number>,
);

const searchIndex: { type: "sun" | "planet"; id: string; title: string; subtitle: string; haystack: string }[] = [
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
];

function compactNumber(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function CommandBar() {
  const {
    setCameraMode,
    setSelectedObject,
    selectedObject,
    setSearchActive,
    filters,
    setFilters,
    resetFilters,
  } = useAppState();
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { stats } = galaxyData;

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

  const pickPaper = (id: string) => {
    setCameraMode("god");
    setSelectedObject({ type: "planet", id });
  };
  const minYear = filters.minYear ?? yearRange.min;
  const maxYear = filters.maxYear ?? yearRange.max;
  const numInputCls =
    "bg-white/5 border-2 border-edge px-2 py-1 font-mono text-xs text-ink outline-none focus:border-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  const domains = galaxyData.domains;
  const domainMeasureRef = useRef<HTMLDivElement>(null);
  const domainWrapRef = useRef<HTMLDivElement>(null);
  const [domainFit, setDomainFit] = useState(domains.length);
  const [domainMenuOpen, setDomainMenuOpen] = useState(false);
  const overflow = domainFit < domains.length;
  const visibleDomains = overflow ? domains.slice(0, Math.max(0, domainFit - 1)) : domains;
  const hiddenDomains = overflow ? domains.slice(visibleDomains.length) : [];
  const hiddenActive =
    filters.domainId != null && hiddenDomains.some((d) => d.id === filters.domainId);

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
  }, [query]);

  useEffect(() => {
    setSearchActive(results.length > 0);
  }, [results.length, setSearchActive]);

  useEffect(() => () => setSearchActive(false), [setSearchActive]);

  useLayoutEffect(() => {
    if (!showFilters) return;
    const el = domainMeasureRef.current;
    if (!el) return;
    const compute = () => {
      const kids = Array.from(el.children) as HTMLElement[];
      if (kids.length === 0) return;
      const top0 = kids[0].offsetTop;
      let count = 0;
      for (let i = 1; i < kids.length; i++) {
        if (kids[i].offsetTop <= top0) count++;
        else break;
      }
      setDomainFit(count);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showFilters]);

  useEffect(() => {
    if (!overflow) setDomainMenuOpen(false);
  }, [overflow]);

  useEffect(() => {
    if (!domainMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (domainWrapRef.current && !domainWrapRef.current.contains(e.target as Node)) {
        setDomainMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [domainMenuOpen]);

  const pick = (r: SearchResult) => {
    setCameraMode("god");
    setSelectedObject({ type: r.type, id: r.id });
    setQuery("");
    setShowFilters(false);
    inputRef.current?.blur();
  };

  return (
    <div className="absolute bottom-11 left-1/2 -translate-x-1/2 w-[min(1080px,calc(100vw-2.5rem))] pointer-events-auto">
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="glass-panel mb-3 flex flex-col max-h-[72vh]"
          >
            <div className="flex flex-col gap-5 p-4 shrink-0">
            <div className="flex items-center justify-between">
              <span className="font-display text-xs uppercase tracking-wider text-ink">Filters</span>
              <span className={`font-mono text-[11px] ${filtersActive ? "text-accent" : "text-ink-dim"}`}>
                {filtersActive ? `${matchCount}/${totalPapers}` : totalPapers} papers
              </span>
            </div>

            <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
              <div>
                <span className="block mb-1.5 font-mono text-[11px] uppercase tracking-widest text-ink-dim">Year Range</span>
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
                    className={`w-[4.5rem] ${numInputCls}`}
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
                    className={`w-[4.5rem] ${numInputCls}`}
                  />
                </div>
              </div>

              <div>
                <span className="block mb-1.5 font-mono text-[11px] uppercase tracking-widest text-ink-dim">Min Citations</span>
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
                      minCitations: Number.isNaN(v) ? 0 : Math.min(Math.max(v, 0), maxCitations),
                    });
                  }}
                  className={`w-20 ${numInputCls}`}
                />
              </div>

              <div ref={domainWrapRef} className="relative min-w-[12rem] flex-1">
                <span className="block mb-1.5 font-mono text-[11px] uppercase tracking-widest text-ink-dim">Domain</span>

                <div
                  ref={domainMeasureRef}
                  aria-hidden
                  className="pointer-events-none invisible absolute inset-x-0 flex flex-wrap gap-1.5"
                >
                  <Chip active={false} onClick={() => {}}>All</Chip>
                  {domains.map((d) => (
                    <Chip key={d.id} active={false} onClick={() => {}}>
                      {d.name}
                    </Chip>
                  ))}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Chip active={filters.domainId === null} onClick={() => setFilters({ domainId: null })}>
                    All
                  </Chip>
                  {visibleDomains.map((d) => (
                    <Chip
                      key={d.id}
                      active={filters.domainId === d.id}
                      onClick={() => setFilters({ domainId: filters.domainId === d.id ? null : d.id })}
                    >
                      {d.name}
                    </Chip>
                  ))}
                  {overflow && (
                    <button
                      type="button"
                      aria-label={`Show ${hiddenDomains.length} more domains`}
                      aria-expanded={domainMenuOpen}
                      onClick={() => setDomainMenuOpen((o) => !o)}
                      className={`px-3 py-2 sm:py-1.5 border-2 border-edge font-mono text-[11px] transition-all ${
                        hiddenActive || domainMenuOpen
                          ? "bg-accent text-accent-foreground"
                          : "bg-white/5 text-ink hover:bg-white/10"
                      }`}
                    >
                      +{hiddenDomains.length}
                    </button>
                  )}
                </div>

                {overflow && domainMenuOpen && (
                  <div className="glass-panel custom-scrollbar absolute bottom-full left-0 right-0 z-20 mb-2 max-h-56 overflow-y-auto p-1.5">
                    {hiddenDomains.map((d) => {
                      const active = filters.domainId === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setFilters({ domainId: active ? null : d.id });
                            setDomainMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-2 py-1.5 text-left font-mono text-[11px] text-ink transition-colors hover:bg-accent/15"
                        >
                          <span
                            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center border-2 ${
                              active ? "border-accent bg-accent" : "border-edge"
                            }`}
                          >
                            {active && <Check size={10} className="text-accent-foreground" />}
                          </span>
                          <span className="truncate">{d.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            </div>

            {filtersActive && (
              <div className="flex min-h-0 flex-col border-t-2 border-edge">
                <div className="flex items-center gap-2 px-4 py-3 shrink-0">
                  <ListFilter size={15} className="text-accent" />
                  <span className="font-display text-xs uppercase tracking-wider text-ink">
                    Matching Papers
                  </span>
                  <span className="font-mono text-[11px] text-ink-dim">{matchingPapers.length}</span>
                  <button
                    onClick={resetFilters}
                    title="Clear filters"
                    className="ml-auto flex items-center gap-1 font-display text-[11px] uppercase tracking-wider text-ink-dim transition-colors hover:text-ink"
                  >
                    Clear <X size={13} />
                  </button>
                </div>

                <div className="overflow-y-auto custom-scrollbar border-t border-white/8">
                  {matchingPapers.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-ink-dim">
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
                          className={`flex w-full flex-col gap-1.5 px-4 py-2.5 text-left border-b border-white/8 last:border-0 transition-colors ${
                            isSelected ? "bg-accent/20" : "hover:bg-accent/15"
                          }`}
                        >
                          <span className="block text-sm leading-snug text-ink line-clamp-2">
                            {p.title}
                          </span>
                          <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-ink-dim">
                            {p.year != null && <span>{p.year}</span>}
                            <span className="text-accent">{p.citations.toLocaleString()} cites</span>
                            {p.domainName && (
                              <span className="flex min-w-0 items-center gap-1">
                                <span
                                  className="h-2 w-2 shrink-0 border border-edge"
                                  style={{
                                    background: getDomainColorStr(domainIndexById[p.domainId] ?? 0),
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
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="glass-panel mb-3 max-h-[34vh] md:max-h-[46vh] overflow-y-auto custom-scrollbar"
          >
            {results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => pick(r)}
                className="flex w-full items-center gap-3 px-4 py-3 md:py-2.5 text-left border-b border-white/8 last:border-0 hover:bg-accent/15 transition-colors"
              >
                {r.type === "sun" ? (
                  <Sun size={15} className="shrink-0 text-accent" />
                ) : (
                  <Globe2 size={15} className="shrink-0 text-ink-dim" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{r.title}</span>
                  <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-ink-dim">
                    {r.subtitle}
                  </span>
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel flex items-stretch gap-2 p-2"
      >
        <div className="hidden md:flex items-center gap-5 px-3 shrink-0">
          <Stat label="Papers" value={stats.totalPapers.toLocaleString()} />
          <Stat label="Citations" value={stats.totalCitations.toLocaleString()} />
          <Stat label="Co-authors" value={stats.uniqueCoAuthors.toLocaleString()} />
          <Stat label="Years" value={String(stats.yearsActive)} />
          <Stat label="Words" value={`${compactNumber(stats.estimatedWords)}+`} />
        </div>

        <div className="hidden md:block w-[2px] self-stretch bg-edge/60" />

        <div className="relative flex min-w-0 flex-1 items-center gap-2 px-2">
          <Search size={16} className="shrink-0 text-ink-dim" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search papers, domains, co-authors…"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink placeholder:text-ink-dim/70 focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="shrink-0 text-ink-dim hover:text-ink">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowFilters((s) => !s)}
            title="Filters"
            className={`relative flex items-center justify-center h-11 w-11 md:h-9 md:w-9 border-2 border-edge transition-all ${
              showFilters || filtersActive ? "bg-accent text-accent-foreground" : "bg-white/5 text-ink hover:bg-white/10"
            }`}
          >
            <Filter size={15} />
            {filtersActive && !showFilters && (
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-accent ring-2 ring-black" />
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 sm:py-1.5 border-2 border-edge font-mono text-[11px] transition-all ${
        active ? "bg-accent text-accent-foreground" : "bg-white/5 text-ink hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-sm leading-none text-ink">{value}</span>
      <span className="mt-1 font-mono text-[9px] uppercase tracking-widest text-ink-dim">{label}</span>
    </div>
  );
}
