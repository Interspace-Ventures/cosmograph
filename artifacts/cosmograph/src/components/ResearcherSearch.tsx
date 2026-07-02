import { useEffect, useState } from "react";
import { Search, Loader2, Quote, Undo2 } from "lucide-react";
import { useAppState } from "@/lib/store";
import { searchAuthors, type AuthorCandidate } from "@/lib/openalex";

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

export function ResearcherSearch() {
  const {
    loadAuthor,
    activeAuthorLabel,
    activeAuthorId,
    setInfoOpen,
    setCustomizeOpen,
    previousAuthor,
    returnToPreviousAuthor,
  } = useAppState();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AuthorCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setError(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await searchAuthors(q, 6, ac.signal);
        if (!ac.signal.aborted) {
          setResults(r);
          setError(null);
        }
      } catch (e) {
        if (!ac.signal.aborted) {
          const status = (e as { status?: number })?.status;
          setError(
            status === 429
              ? "OpenAlex is rate-limiting search right now — please try again in a little while."
              : "Search failed — check your connection and try again.",
          );
          setResults([]);
        }
      } finally {
        if (!ac.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [query]);

  const pick = (c: AuthorCandidate) => {
    setInfoOpen(false);
    setCustomizeOpen(false);
    setQuery("");
    setResults([]);
    void loadAuthor(c);
  };

  return (
    <div>
      <p className="mb-3 font-mono text-[10px] leading-relaxed text-ink-dim/70">
        Now exploring: <span className="text-ink-dim">{activeAuthorLabel}</span>
      </p>
      {previousAuthor && previousAuthor.id !== activeAuthorId && (
        <button
          onClick={returnToPreviousAuthor}
          className="mb-3 inline-flex max-w-full items-center gap-1.5 border-2 border-edge px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-dim transition-colors hover:border-accent/70 hover:text-ink"
        >
          <Undo2 size={12} className="shrink-0" />
          <span className="truncate">Return to {previousAuthor.name}</span>
        </button>
      )}
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name (e.g. Jennifer Doudna)"
          aria-label="Search for a researcher by name"
          className="w-full border-2 border-edge bg-bg/60 py-2.5 pl-9 pr-9 text-sm text-ink placeholder:text-ink-dim/60 outline-none transition-colors focus:border-accent/70"
        />
        {searching && (
          <Loader2
            size={15}
            className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-accent"
          />
        )}
      </div>

      {error && (
        <p className="mt-2.5 font-mono text-[11px] text-red-400">{error}</p>
      )}

      {results.length > 0 && (
        <ul className="mt-3 divide-y divide-edge border-2 border-edge bg-bg/60">
          {results.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => pick(c)}
                className="flex w-full items-start justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-white/5"
              >
                <span className="min-w-0">
                  <span className="block truncate font-display text-sm font-semibold text-ink">
                    {c.name}
                  </span>
                  {c.institution && (
                    <span className="block truncate text-[12px] text-ink-dim">
                      {c.institution}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 flex-col items-end font-mono text-[10px] text-ink-dim">
                  <span>{formatCount(c.worksCount)} works</span>
                  <span className="inline-flex items-center gap-0.5 text-accent">
                    <Quote size={9} className="fill-current" />
                    {formatCount(c.citedByCount)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.trim().length >= 2 && !searching && !error && results.length === 0 && (
        <p className="mt-2.5 font-mono text-[11px] text-ink-dim">
          No researchers found for "{query.trim()}".
        </p>
      )}
    </div>
  );
}
