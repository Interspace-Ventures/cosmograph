import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useAppState } from "@/lib/store";
import { galaxyData } from "@/data/galaxy";
import { SITE } from "@/config/site";
import { LEGEND, NAV_MODES } from "@/lib/legend";

export function InfoDrawer() {
  const { infoOpen, setInfoOpen } = useAppState();

  useEffect(() => {
    if (!infoOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInfoOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [infoOpen, setInfoOpen]);

  return (
    <AnimatePresence>
      {infoOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 pointer-events-auto"
        >
          <div
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            onClick={() => setInfoOpen(false)}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="info-drawer-title"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="custom-scrollbar absolute inset-x-0 bottom-0 mx-auto max-h-[85vh] w-full max-w-2xl overflow-y-auto border-t-2 border-edge bg-bg/95 p-7 backdrop-blur-xl"
          >
            <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-ink-dim/30" />
            <button
              onClick={() => setInfoOpen(false)}
              aria-label="Close"
              autoFocus
              className="absolute top-4 right-4 text-ink-dim transition-colors hover:text-ink"
            >
              <X size={18} />
            </button>

            <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
              About this Venture
            </span>
            <h2
              id="info-drawer-title"
              className="mt-1 mb-5 text-2xl font-title font-bold tracking-tight text-ink"
            >
              A galaxy for a life in science
            </h2>

            <div className="space-y-4 text-[13px] leading-relaxed text-ink-dim">
              <p>
                Galactic turns a scientist's lifetime of research into a universe you can fly
                through. Every <span className="text-ink">sun</span> is a field they helped shape,
                every <span className="text-ink">planet</span> a paper they published, and every{" "}
                <span className="text-ink">moon</span> a collaborator who worked alongside them.
                Right now you're exploring the work of{" "}
                <span className="text-ink">{galaxyData.author.name}</span>.
              </p>
              <p>
                It began as a Father's Day gift — a way to make one researcher's life's work feel as
                vast as it truly is. A career in science usually disappears into citation counts and
                PDFs; this is an attempt to let you <em>feel</em> the scale of it, and to say thank
                you to the people who spend their lives expanding what we know.
              </p>
              <p>
                Galactic is open source and built for anyone. Point it at any researcher — a parent,
                a mentor, or yourself — and it rebuilds the entire galaxy from public data on{" "}
                <span className="text-ink">OpenAlex</span>. No identity is hardcoded; everything you
                see is generated from a single data snapshot.
              </p>
              <p>
                Built frontend-only with <span className="text-ink">React</span>,{" "}
                <span className="text-ink">Three.js</span> &{" "}
                <span className="text-ink">React Three Fiber</span>. Bibliographic data comes from
                OpenAlex — {galaxyData.papers.length.toLocaleString()} papers across{" "}
                {galaxyData.domains.length} domains.
              </p>
            </div>

            <div className="mt-8 border-t-2 border-edge pt-6">
              <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                How to read this galaxy
              </span>
              <h3 className="mt-1 mb-4 text-lg font-title font-bold tracking-tight text-ink">
                A lifetime of work, mapped to the stars
              </h3>

              <div className="space-y-4">
                {LEGEND.map(({ icon: Icon, title, body }) => (
                  <div key={title} className="flex items-start gap-3.5">
                    <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center border-2 border-edge bg-white/5 text-accent">
                      <Icon size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-display font-semibold text-ink">{title}</div>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-ink-dim">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 border-t-2 border-edge pt-6">
              <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                Getting around
              </span>
              <h3 className="mt-1 mb-4 text-lg font-title font-bold tracking-tight text-ink">
                Two ways to explore
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="border-2 border-edge bg-white/5 p-4">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-8 w-8 shrink-0 place-items-center border-2 border-edge bg-white/5 text-accent">
                      <NAV_MODES.orbit.icon size={15} />
                    </div>
                    <span className="font-display text-sm font-semibold uppercase tracking-wider text-ink">
                      {NAV_MODES.orbit.name}
                    </span>
                  </div>
                  <p className="mt-2.5 text-[13px] leading-relaxed text-ink-dim">
                    {NAV_MODES.orbit.blurb}
                  </p>
                  <ul className="mt-3 space-y-1.5 font-mono text-[11px] text-ink-dim">
                    <li>
                      <span className="text-ink">Drag (left)</span> · pan across
                    </li>
                    <li>
                      <span className="text-ink">Drag (right)</span> · rotate & tilt the view
                    </li>
                    <li>
                      <span className="text-ink">Scroll</span> · zoom in & out
                    </li>
                    <li>
                      <span className="text-ink">Click</span> a sun or planet for details
                    </li>
                  </ul>
                </div>

                <div className="border-2 border-edge bg-white/5 p-4">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-8 w-8 shrink-0 place-items-center border-2 border-edge bg-white/5 text-accent">
                      <NAV_MODES.fly.icon size={15} />
                    </div>
                    <span className="font-display text-sm font-semibold uppercase tracking-wider text-ink">
                      {NAV_MODES.fly.name}
                    </span>
                  </div>
                  <p className="mt-2.5 text-[13px] leading-relaxed text-ink-dim">
                    {NAV_MODES.fly.blurb}
                  </p>
                  <ul className="mt-3 space-y-1.5 font-mono text-[11px] text-ink-dim">
                    <li>
                      <span className="text-ink">W A S D</span> · fly through space
                    </li>
                    <li>
                      <span className="text-ink">Drag</span> or <span className="text-ink">← ↑ ↓ →</span> · look around
                    </li>
                    <li>
                      <span className="text-ink">Q</span> / <span className="text-ink">E</span> · roll
                    </li>
                    <li>
                      <span className="text-ink">Space</span> / <span className="text-ink">Shift</span> · rise & descend
                    </li>
                  </ul>
                </div>
              </div>

              <p className="mt-3 font-mono text-[10px] leading-relaxed text-ink-dim/70">
                On touch: drag with one finger to pan, pinch to zoom & rotate.
              </p>
            </div>

            <p className="mt-8 border-t-2 border-edge pt-4 font-mono text-[11px] leading-relaxed text-ink-dim">
              Live presence is anonymous and ephemeral: while you explore, only your camera position
              is shared so others can see your wisp and the headcount. Nothing is stored, and it all
              vanishes the moment you leave.
            </p>
            <p className="mt-4 font-mono text-[10px] leading-relaxed text-ink-dim/70">
              v{SITE.version} · <span className="text-ink-dim">{SITE.domain}</span> is an{" "}
              <a
                href={SITE.org.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline-offset-2 hover:underline"
              >
                {SITE.org.name}
              </a>
              .
            </p>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
