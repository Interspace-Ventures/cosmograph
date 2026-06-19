import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ListFilter } from "lucide-react";
import { useAppState } from "@/lib/store";
import { galaxyData, getMatchingPapers, isFiltersActive } from "@/data/galaxy";
import { getDomainColorStr } from "@/lib/colors";

const domainIndexById: Record<string, number> = galaxyData.domains.reduce(
  (acc, d, i) => {
    acc[d.id] = i;
    return acc;
  },
  {} as Record<string, number>,
);

export function FilteredPapersPanel() {
  const { filters, selectedObject, setSelectedObject, setCameraMode } = useAppState();

  const filtersActive = isFiltersActive(filters);
  const papers = useMemo(
    () => (filtersActive ? getMatchingPapers(filters) : []),
    [filters, filtersActive],
  );

  const pick = (id: string) => {
    setCameraMode("god");
    setSelectedObject({ type: "planet", id });
  };

  return (
    <div className="absolute bottom-28 left-5 z-20 w-[min(320px,calc(100vw-2.5rem))] pointer-events-auto">
      <AnimatePresence>
        {filtersActive && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="glass-panel flex flex-col max-h-[calc(100vh-18rem)]"
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b-2 border-edge shrink-0">
              <ListFilter size={15} className="text-accent" />
              <span className="font-display text-xs uppercase tracking-wider text-ink">
                Matching Papers
              </span>
              <span className="ml-auto font-mono text-[11px] text-ink-dim">
                {papers.length}
              </span>
            </div>

            <div className="overflow-y-auto custom-scrollbar">
              {papers.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-ink-dim">
                  No papers match these filters.
                </div>
              ) : (
                papers.map((p) => {
                  const isSelected =
                    selectedObject?.type === "planet" && selectedObject.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => pick(p.id)}
                      className={`flex w-full flex-col gap-1.5 px-4 py-2.5 text-left border-b border-white/8 last:border-0 transition-colors ${
                        isSelected ? "bg-accent/20" : "hover:bg-accent/15"
                      }`}
                    >
                      <span className="block text-sm leading-snug text-ink line-clamp-2">
                        {p.title}
                      </span>
                      <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-ink-dim">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
