import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Orbit, Compass, SlidersHorizontal, Sun, Globe2, X } from "lucide-react";
import { useAppState } from "@/lib/store";
import { galaxyData } from "@/data/galaxy";

interface SearchResult {
  type: "sun" | "planet";
  id: string;
  title: string;
  subtitle: string;
}

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

export function CommandBar() {
  const { cameraMode, setCameraMode, galaxyTilt, setGalaxyTilt, setSelectedObject } = useAppState();
  const [query, setQuery] = useState("");
  const [showTilt, setShowTilt] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { stats, author } = galaxyData;

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

  const pick = (r: SearchResult) => {
    setCameraMode("god");
    setSelectedObject({ type: r.type, id: r.id });
    setQuery("");
    inputRef.current?.blur();
  };

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-[min(1080px,calc(100vw-2.5rem))] pointer-events-auto">
      <AnimatePresence>
        {showTilt && cameraMode === "god" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="glass-panel mb-3 p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[11px] uppercase tracking-widest text-ink-dim">Galaxy Tilt</span>
              <span className="font-mono text-[11px] text-ink">{Math.round((galaxyTilt * 180) / Math.PI)}°</span>
            </div>
            <input
              type="range"
              min={-Math.PI / 2}
              max={Math.PI / 2}
              step={0.01}
              value={galaxyTilt}
              onChange={(e) => setGalaxyTilt(parseFloat(e.target.value))}
              className="w-full h-1 bg-white/15 appearance-none cursor-pointer accent-accent"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="glass-panel mb-3 max-h-[46vh] overflow-y-auto custom-scrollbar"
          >
            {results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => pick(r)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left border-b border-white/8 last:border-0 hover:bg-accent/15 transition-colors"
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
          <Stat label="h-index" value={author.hIndex != null ? String(author.hIndex) : "—"} />
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
            onClick={() => setShowTilt((s) => !s)}
            disabled={cameraMode !== "god"}
            title="Galaxy tilt"
            className={`flex items-center justify-center h-9 w-9 border-2 border-edge transition-all disabled:opacity-30 ${
              showTilt && cameraMode === "god" ? "bg-accent text-accent-foreground" : "bg-white/5 text-ink hover:bg-white/10"
            }`}
          >
            <SlidersHorizontal size={15} />
          </button>
          <ModeButton
            active={cameraMode === "god"}
            onClick={() => setCameraMode("god")}
            icon={<Orbit size={15} />}
            label="Orbit"
          />
          <ModeButton
            active={cameraMode === "spaceship"}
            onClick={() => setCameraMode("spaceship")}
            icon={<Compass size={15} />}
            label="Fly"
          />
        </div>
      </motion.div>
    </div>
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

function ModeButton({
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
      className={`flex items-center gap-1.5 h-9 px-3 border-2 border-edge font-display text-xs uppercase tracking-wider transition-all ${
        active ? "bg-accent text-accent-foreground" : "bg-white/5 text-ink hover:bg-white/10"
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
