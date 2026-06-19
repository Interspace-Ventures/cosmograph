import { galaxyData } from "@/data/galaxy";
import { motion } from "framer-motion";

export function StatsPanel() {
  const { stats, author } = galaxyData;

  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 1, delay: 0.5 }}
      className="glass-panel rounded-xl p-6 text-sm"
    >
      <div className="mb-6">
        <h2 className="text-xl font-display font-bold text-white mb-1">{author.name}</h2>
        <p className="text-muted-foreground text-xs uppercase tracking-wider">{author.institution}</p>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <StatBox label="Papers" value={stats.totalPapers} />
          <StatBox label="Citations" value={stats.totalCitations.toLocaleString()} />
          <StatBox label="h-index" value={author.hIndex ?? "-"} />
          <StatBox label="i10-index" value={author.i10Index ?? "-"} />
          <StatBox label="Co-authors" value={stats.uniqueCoAuthors} />
          <StatBox label="Active Years" value={`${stats.firstYear} - ${stats.lastYear}`} />
        </div>

        <div className="pt-4 border-t border-white/10">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Most Cited Paper</p>
          <p className="font-medium text-white line-clamp-2 leading-snug">{stats.mostCited.title}</p>
          <p className="text-primary mt-1">{stats.mostCited.citations.toLocaleString()} citations</p>
        </div>
      </div>
    </motion.div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/5 rounded-lg p-3 border border-white/5">
      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      <div className="text-lg font-mono text-white">{value}</div>
    </div>
  );
}
