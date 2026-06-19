import { useAppState } from "@/lib/store";
import { galaxyData, getDomain, papersByDomain } from "@/data/galaxy";
import { motion } from "framer-motion";
import { X, ExternalLink } from "lucide-react";
import { getDomainColorStr } from "@/lib/colors";

export function DetailPanel() {
  const { selectedObject, setSelectedObject } = useAppState();

  if (!selectedObject) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="glass-panel rounded-xl flex flex-col"
    >
      <div className="flex justify-between items-start p-4 border-b border-white/10">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-display">
          {selectedObject.type === 'sun' ? 'Domain Database' : 'Paper Database'}
        </div>
        <button 
          onClick={() => setSelectedObject(null)}
          className="text-white/50 hover:text-white transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-6">
        {selectedObject.type === 'sun' ? (
          <DomainDetail id={selectedObject.id} />
        ) : (
          <PlanetDetail id={selectedObject.id} />
        )}
      </div>
    </motion.div>
  );
}

function DomainDetail({ id }: { id: string }) {
  const domain = getDomain(id);
  const colorStr = getDomainColorStr(galaxyData.domains.findIndex(d => d.id === id));
  
  if (!domain) return <div>Domain not found</div>;

  const papers = papersByDomain[id] || [];
  const topPapers = [...papers].sort((a, b) => b.citations - a.citations).slice(0, 8);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-white mb-2 leading-tight" style={{ color: colorStr }}>
          {domain.name}
        </h2>
        <p className="text-muted-foreground text-sm">{domain.field}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Papers</div>
          <div className="text-xl font-mono text-white">{domain.paperCount}</div>
        </div>
        <div className="bg-white/5 rounded-lg p-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Citations</div>
          <div className="text-xl font-mono text-white">{domain.totalCitations.toLocaleString()}</div>
        </div>
      </div>

      <div className="mt-6">
        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Top Papers</div>
        <div className="space-y-2">
          {topPapers.map(p => (
            <div key={p.id} className="bg-white/5 rounded-lg p-3 text-sm">
              <div className="text-white/90 line-clamp-2 leading-snug mb-2">{p.title}</div>
              <div className="flex gap-2 text-xs">
                <span className="text-primary font-mono">{p.citations} citations</span>
                {p.year && <span className="text-muted-foreground font-mono">{p.year}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlanetDetail({ id }: { id: string }) {
  const paper = galaxyData.papers.find(p => p.id === id);
  if (!paper) return <div>Paper not found</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white leading-snug mb-3">
          {paper.title}
        </h2>
        
        <div className="flex flex-wrap gap-2 text-xs">
          {paper.year && (
            <span className="px-2 py-1 bg-white/10 rounded-md text-white/80 font-mono">
              {paper.year}
            </span>
          )}
          <span className="px-2 py-1 bg-primary/20 text-primary border border-primary/30 rounded-md font-mono">
            {paper.citations.toLocaleString()} Citations
          </span>
          {paper.type && (
            <span className="px-2 py-1 bg-white/5 rounded-md text-muted-foreground">
              {paper.type}
            </span>
          )}
        </div>
      </div>

      {paper.venue && (
        <div className="text-sm">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Venue</div>
          <div className="text-white/80">{paper.venue}</div>
        </div>
      )}

      {paper.coAuthors.length > 0 && (
        <div className="text-sm">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
            Co-authors ({paper.coAuthorCount})
          </div>
          <div className="flex flex-wrap gap-1 max-h-48 overflow-y-auto custom-scrollbar pr-2 pb-2">
            {paper.coAuthors.map((author, i) => (
              <span key={i} className="px-2 py-1 bg-white/5 border border-white/10 rounded-md text-xs text-white/70">
                {author}
              </span>
            ))}
          </div>
        </div>
      )}

      {paper.url && (
        <a 
          href={paper.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm uppercase tracking-wider font-display"
        >
          <span>View Source</span>
          <ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}
