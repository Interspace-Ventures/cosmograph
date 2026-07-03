import { useAppState } from "@/lib/store";
import { galaxyData, getDomain, papersByDomain } from "@/data/galaxy";
import { motion } from "framer-motion";
import { X, ExternalLink } from "lucide-react";
import { getDomainColorStr } from "@/lib/colors";
import { useLayoutEffect, useRef, useState } from "react";

export function DetailPanel() {
  const { selectedObject, setSelectedObject } = useAppState();

  if (!selectedObject) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      className="glass-panel flex flex-col"
    >
      <div className="flex justify-between items-center p-4 border-b-2 border-edge">
        <div className="font-mono text-[10px] uppercase tracking-widest text-ink-dim">
          {selectedObject.type === "sun" ? "Domain" : "Paper"}
        </div>
        <button
          onClick={() => setSelectedObject(null)}
          className="text-ink-dim hover:text-ink transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-5">
        {selectedObject.type === "sun" ? (
          <DomainDetail id={selectedObject.id} />
        ) : (
          <PlanetDetail id={selectedObject.id} />
        )}
      </div>
    </motion.div>
  );
}

function DomainDetail({ id }: { id: string }) {
  const { setCameraMode, setSelectedObject } = useAppState();
  const domain = getDomain(id);
  const colorStr = getDomainColorStr(
    galaxyData.domains.findIndex((d) => d.id === id),
  );

  const goToPaper = (paperId: string) => {
    setCameraMode("god");
    setSelectedObject({ type: "planet", id: paperId });
  };

  if (!domain) return <div className="text-ink-dim">Domain not found</div>;

  const papers = papersByDomain[id] || [];
  const topPapers = [...papers]
    .sort((a, b) => b.citations - a.citations)
    .slice(0, 8);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span
            className="h-3 w-3 border-2 border-edge"
            style={{ background: colorStr }}
          />
          <h2 className="text-xl font-display font-extrabold leading-tight paper-ink">
            {domain.name}
          </h2>
        </div>
        <p className="text-ink-dim text-sm">{domain.field}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Metric label="Papers" value={String(domain.paperCount)} />
        <Metric
          label="Citations"
          value={domain.totalCitations.toLocaleString()}
        />
      </div>

      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-ink-dim mb-3">
          Top Papers
        </div>
        <div className="space-y-2">
          {topPapers.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => goToPaper(p.id)}
              title="Fly to this planet"
              className="block w-full text-left bg-white/5 border-2 border-edge p-3 text-sm transition-colors hover:bg-accent/15 hover:border-accent"
            >
              <div className="paper-ink line-clamp-2 leading-snug mb-2">
                {p.title}
              </div>
              <div className="flex gap-3 font-mono text-[11px]">
                <span className="text-accent">{p.citations} citations</span>
                {p.year && <span className="text-ink-dim">{p.year}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlanetDetail({ id }: { id: string }) {
  const paper = galaxyData.papers.find((p) => p.id === id);
  if (!paper) return <div className="text-ink-dim">Paper not found</div>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-display font-bold leading-snug mb-3 paper-ink">
          {paper.title}
        </h2>

        <div className="flex flex-wrap gap-2 font-mono text-[11px]">
          {paper.year && (
            <span className="px-2 py-1 bg-white/8 border-2 border-edge text-ink">
              {paper.year}
            </span>
          )}
          <span className="px-2 py-1 bg-accent text-accent-foreground border-2 border-edge">
            {paper.citations.toLocaleString()} citations
          </span>
          {paper.type && (
            <span className="px-2 py-1 bg-white/5 border-2 border-edge text-ink-dim">
              {paper.type}
            </span>
          )}
        </div>
      </div>

      {paper.venue && (
        <div className="text-sm">
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink-dim mb-1">
            Venue
          </div>
          <div className="paper-ink">{paper.venue}</div>
        </div>
      )}

      {paper.coAuthors.length > 0 && (
        <div className="text-sm">
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink-dim mb-2">
            Co-authors ({paper.coAuthorCount})
          </div>
          <CoAuthorChips
            authors={paper.coAuthors}
            total={paper.coAuthorCount}
          />
        </div>
      )}

      {paper.url && (
        <a
          href={paper.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ background: "var(--accent)" }}
          className="glass-panel glass-panel-interactive flex items-center justify-center gap-2 w-full py-3 text-accent-foreground font-display text-xs uppercase tracking-widest"
        >
          <span>View Source</span>
          <ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}

const CHIP_GAP = 6; // matches gap-1.5

/**
 * Co-author chips confined to a single line: we measure (in a hidden clone of
 * the row) how many name chips fit alongside a "+N" chip and collapse the rest
 * into it. Clicking "+N" expands to the full scrollable list; "Show less"
 * collapses back. Re-measures on container resize (the panel width changes
 * with the viewport and the console rail).
 */
function CoAuthorChips({
  authors,
  total,
}: {
  authors: string[];
  total: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(authors.length);
  const measureRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;

    const compute = () => {
      const children = Array.from(el.children) as HTMLElement[];
      const probe = children.pop(); // last child is the "+N" width probe
      if (!probe) return;
      const width = el.clientWidth;
      if (width <= 0) return;

      let used = 0;
      let count = 0;
      for (const chip of children) {
        const next = used + (count > 0 ? CHIP_GAP : 0) + chip.offsetWidth;
        if (next > width) break;
        used = next;
        count++;
      }

      // Everything fits and the snapshot isn't truncated — no "+N" needed.
      if (count >= children.length && total <= authors.length) {
        setVisible(children.length);
        return;
      }

      // Otherwise make room for the "+N" chip on the same line.
      while (count > 0 && used + CHIP_GAP + probe.offsetWidth > width) {
        used -= children[count - 1].offsetWidth + (count > 1 ? CHIP_GAP : 0);
        count--;
      }
      setVisible(Math.max(1, count));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [authors, total]);

  const hidden = total - visible;
  const chipClass =
    "px-2 py-1 bg-white/5 border-2 border-edge text-[11px] text-ink-dim";
  const moreClass =
    "px-2 py-1 bg-white/10 border-2 border-edge text-[11px] text-ink hover:bg-accent/20 hover:border-accent transition-colors";

  return (
    <div className="relative">
      {/* Invisible measuring row: all chips + a "+N" probe, never wraps. */}
      <div
        ref={measureRef}
        aria-hidden="true"
        className="absolute inset-x-0 top-0 flex flex-nowrap gap-1.5 overflow-hidden invisible pointer-events-none"
      >
        {authors.map((author, i) => (
          <span key={i} className={`${chipClass} whitespace-nowrap shrink-0`}>
            {author}
          </span>
        ))}
        <span className={`${moreClass} whitespace-nowrap shrink-0`}>
          +{total}
        </span>
      </div>

      {expanded ? (
        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1 pb-1">
          {authors.map((author, i) => (
            <span key={i} className={chipClass}>
              {author}
            </span>
          ))}
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className={moreClass}
          >
            Show less
          </button>
        </div>
      ) : (
        <div className="flex flex-nowrap gap-1.5 overflow-hidden">
          {authors.slice(0, visible).map((author, i) => (
            <span key={i} className={`${chipClass} whitespace-nowrap shrink-0`}>
              {author}
            </span>
          ))}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              title={`Show all ${total} co-authors`}
              className={`${moreClass} whitespace-nowrap shrink-0`}
            >
              +{hidden}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/5 border-2 border-edge p-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink-dim mb-1">
        {label}
      </div>
      <div className="font-mono text-lg text-ink">{value}</div>
    </div>
  );
}
