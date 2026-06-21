import { AnimatePresence, motion } from "framer-motion";
import { Loader2, AlertTriangle } from "lucide-react";
import { useAppState } from "@/lib/store";

export function DatasetLoadingOverlay() {
  const { datasetStatus, datasetError, loadProgress, dismissDatasetError } =
    useAppState();
  const visible = datasetStatus === "loading" || datasetStatus === "error";

  const fetched = loadProgress?.fetched ?? 0;
  const total = loadProgress?.total ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((fetched / total) * 100)) : 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] grid place-items-center bg-black/80 backdrop-blur-md pointer-events-auto"
        >
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            className="w-full max-w-sm border-2 border-edge bg-bg/95 p-7 text-center"
          >
            {datasetStatus === "loading" ? (
              <>
                <Loader2
                  size={34}
                  className="mx-auto mb-4 animate-spin text-accent"
                />
                <h2 className="font-title text-lg font-bold tracking-tight text-ink">
                  Charting a new galaxy
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">
                  Pulling this scientist's lifetime of work from OpenAlex and
                  rebuilding the universe around them.
                </p>

                <div className="mt-5">
                  <div className="h-1.5 w-full overflow-hidden border border-edge bg-white/5">
                    <motion.div
                      className="h-full bg-accent"
                      initial={false}
                      animate={{ width: total > 0 ? `${pct}%` : "40%" }}
                      transition={{ ease: "easeOut", duration: 0.4 }}
                    />
                  </div>
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim">
                    {total > 0
                      ? `${fetched.toLocaleString()} / ${total.toLocaleString()} papers`
                      : "Contacting OpenAlex…"}
                  </p>
                </div>
              </>
            ) : (
              <>
                <AlertTriangle
                  size={32}
                  className="mx-auto mb-4 text-red-400"
                />
                <h2 className="font-title text-lg font-bold tracking-tight text-ink">
                  Couldn't chart that galaxy
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">
                  {datasetError ??
                    "Something went wrong loading this scientist from OpenAlex."}
                </p>
                <button
                  onClick={dismissDatasetError}
                  className="mt-5 w-full border-2 border-edge bg-white/5 py-2.5 font-display text-[12px] uppercase tracking-wider text-ink transition-colors hover:bg-white/10"
                >
                  Back to the galaxy
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
