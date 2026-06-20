import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Sun, Globe2, Moon, Orbit, Network } from "lucide-react";
import { useAppState } from "@/lib/store";
import { galaxyData } from "@/data/galaxy";
import { SITE } from "@/config/site";

const LEGEND = [
  {
    icon: Sun,
    title: "Suns are research domains",
    body: "Each sun is a research field represented in this body of work. The larger the sun, the more papers published in that domain.",
  },
  {
    icon: Globe2,
    title: "Planets are papers",
    body: "Every planet orbiting a sun is a single published paper. The larger the planet, the more times it has been cited.",
  },
  {
    icon: Moon,
    title: "Moons are co-authors",
    body: "Select a paper and its moons appear — the collaborators who co-authored it.",
  },
  {
    icon: Orbit,
    title: "Orbits show relevance",
    body: "A planet's distance from its sun reflects how central the paper is to that domain.",
  },
  {
    icon: Network,
    title: "Nearby suns are related",
    body: "Solar systems are grouped by broad research field, so suns clustered together belong to the same area of science — while distant clusters are different fields entirely.",
  },
];

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
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="custom-scrollbar absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l-2 border-edge bg-bg/95 p-7 backdrop-blur-xl"
          >
            <button
              onClick={() => setInfoOpen(false)}
              aria-label="Close"
              autoFocus
              className="absolute top-4 right-4 text-ink-dim transition-colors hover:text-ink"
            >
              <X size={18} />
            </button>

            <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
              About this project
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

            <p className="mt-8 border-t-2 border-edge pt-4 font-mono text-[11px] leading-relaxed text-ink-dim">
              Built frontend-only with React, Three.js & React Three Fiber. Bibliographic data from
              OpenAlex — {galaxyData.papers.length.toLocaleString()} papers across{" "}
              {galaxyData.domains.length} domains.
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
