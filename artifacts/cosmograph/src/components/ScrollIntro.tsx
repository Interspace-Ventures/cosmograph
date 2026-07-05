import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Play, Compass } from "lucide-react";
import { useAppState } from "@/lib/store";
import { galaxyData } from "@/data/galaxy";
import { Cockpit } from "./Cockpit";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);
  return reduced;
}

interface Beat {
  start: number;
  end: number;
  kicker: string;
  value: string;
  caption: string;
}

function buildBeats(): Beat[] {
  const s = galaxyData.stats;
  return [
  {
    start: 0.06,
    end: 0.2,
    kicker: "It began over five decades ago",
    value: String(s.yearsActive),
    caption: `years of discovery · ${s.firstYear}–${s.lastYear}`,
  },
  {
    start: 0.21,
    end: 0.34,
    kicker: "A lifetime of inquiry, written down",
    value: s.totalPapers.toLocaleString(),
    caption: "published papers",
  },
  {
    start: 0.35,
    end: 0.48,
    kicker: "Ideas that travelled the world",
    value: s.totalCitations.toLocaleString(),
    caption: "citations earned",
  },
  {
    start: 0.49,
    end: 0.62,
    kicker: "No discovery made alone",
    value: s.uniqueCoAuthors.toLocaleString(),
    caption: "collaborators along the way",
  },
  {
    start: 0.63,
    end: 0.76,
    kicker: "Spanning many frontiers of science",
    value: String(s.domainCount),
    caption: "research domains",
  },
  {
    start: 0.77,
    end: 0.9,
    kicker: "At least",
    value: `${new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(s.estimatedWords)}+`,
    caption: `words written — about ${Math.round(
      s.estimatedWords / 90_000,
    ).toLocaleString()} novels' worth`,
  },
  ];
}

function beatOpacity(p: number, start: number, end: number) {
  const fade = 0.045;
  if (p <= start || p >= end) return 0;
  return clamp(Math.min((p - start) / fade, (end - p) / fade), 0, 1);
}

export function ScrollIntro() {
  const {
    introStarted,
    setIntroStarted,
    setIntroFinished,
    startTour,
    introProgressRef,
  } = useAppState();
  const reduced = usePrefersReducedMotion();
  // Recomputed per mount so the intro stat beats reflect the active scientist
  // after a live dataset swap (ScrollIntro remounts via key={datasetVersion}).
  const beats = useMemo(() => buildBeats(), []);
  const [progress, setProgress] = useState(0);
  const targetRef = useRef(0);
  const flownRef = useRef(false);
  const warpRef = useRef<HTMLDivElement>(null);

  // Map wheel / touch input to a 0→1 target while flying.
  useEffect(() => {
    if (!introStarted || reduced) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetRef.current = clamp(targetRef.current + e.deltaY / 4200, 0, 1);
    };

    let lastY = 0;
    const onTouchStart = (e: TouchEvent) => {
      lastY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const y = e.touches[0].clientY;
      targetRef.current = clamp(targetRef.current + (lastY - y) / 750, 0, 1);
      lastY = y;
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: false });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, [introStarted, reduced]);

  // Ease the displayed progress toward the scroll target; drive camera + warp.
  useEffect(() => {
    if (!introStarted) return;
    let raf = 0;
    let prev = introProgressRef.current;
    const tick = () => {
      const cur = introProgressRef.current;
      const next = cur + (targetRef.current - cur) * 0.07;
      introProgressRef.current = next;

      // Once the visitor has flown in, scrolling all the way back to the very
      // start returns them to the title screen.
      if (next > 0.06) flownRef.current = true;
      if (flownRef.current && targetRef.current <= 0.0001 && next < 0.005) {
        flownRef.current = false;
        introProgressRef.current = 0;
        targetRef.current = 0;
        setProgress(0);
        setIntroStarted(false);
        return;
      }

      const speed = clamp(Math.abs(next - prev) * 48, 0, 1);
      prev = next;
      if (warpRef.current) {
        warpRef.current.style.opacity = String(Math.min(1, speed * 1.15));
        warpRef.current.style.transform = `scale(${1 + speed * 0.7})`;
      }

      setProgress(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [introStarted, introProgressRef]);

  const finishExplore = () => {
    introProgressRef.current = 1;
    setIntroFinished(true);
  };
  const finishTour = () => {
    introProgressRef.current = 1;
    setIntroFinished(true);
    startTour();
  };

  const showTitle = !introStarted;
  const atEnd = introStarted && progress >= 0.965;

  return (
    <motion.div
      className="absolute inset-0 z-50 pointer-events-none"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 1.2, ease: "easeInOut" } }}
    >
      {/* Swallow stray canvas clicks during the intro */}
      <div className="absolute inset-0 z-30 pointer-events-auto" />

      {!atEnd && <Cockpit warpRef={warpRef} />}

      {/* Scroll progress rail */}
      {introStarted && !reduced && (
        <div className="absolute right-7 top-1/2 z-50 hidden h-40 w-px -translate-y-1/2 bg-ink/15 md:block">
          <div
            className="absolute left-0 top-0 w-px bg-accent"
            style={{ height: `${progress * 100}%` }}
          />
        </div>
      )}

      {/* TITLE SCREEN */}
      <AnimatePresence>
        {showTitle && (
          <motion.div
            key="title"
            className="absolute inset-0 z-50 flex flex-col items-center justify-center px-6 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4 }}
          >
            <motion.p
              className="mb-3 font-mono text-xs uppercase tracking-[0.4em] text-ink-dim md:text-sm"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.4, ease: "easeOut" }}
            >
              Welcome to
            </motion.p>
            <motion.h1
              className="mb-4 font-title text-7xl font-bold tracking-tight text-ink md:text-9xl"
              initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 1.8, ease: "easeOut" }}
            >
              Cosmograph
            </motion.h1>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.5, delay: 0.6 }}
              className="space-y-2"
            >
              <p className="font-display text-lg font-semibold uppercase tracking-[0.3em] text-accent md:text-2xl">
                Research at Galactic Scale
              </p>
              <p className="font-mono text-base tracking-widest text-ink-dim md:text-xl">
                {galaxyData.author.name}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 1.2 }}
              className="pointer-events-auto mt-14 flex flex-col items-center gap-4"
            >
              <button
                onClick={() => (reduced ? finishExplore() : setIntroStarted(true))}
                style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
                className="glass-panel glass-panel-interactive px-10 py-3.5 font-display text-sm font-semibold uppercase tracking-[0.25em]"
              >
                {reduced ? "Enter the Galaxy" : "Ad Astra"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NUX SCROLLYTELLING PANELS */}
      {introStarted && !reduced && !atEnd && (
        <div className="absolute inset-x-0 top-0 bottom-[32vh] z-50 flex items-center justify-center px-6">
          {beats.map((b, i) => {
            const op = beatOpacity(progress, b.start, b.end);
            if (op <= 0.001) return null;
            const local = (progress - b.start) / (b.end - b.start);
            return (
              <div
                key={i}
                className="absolute max-w-xl text-center"
                style={{
                  opacity: op,
                  transform: `translateY(${(0.5 - local) * 40}px)`,
                }}
              >
                <p className="mb-3 font-display text-xs uppercase tracking-[0.35em] text-accent md:text-sm">
                  {b.kicker}
                </p>
                <div className="font-title text-7xl font-bold tracking-tight text-ink md:text-8xl">
                  {b.value}
                </div>
                <p className="mt-3 font-mono text-sm uppercase tracking-[0.2em] text-ink-dim md:text-base">
                  {b.caption}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* SCROLL HINT */}
      {introStarted && !reduced && progress < 0.05 && (
        <motion.div
          className="absolute inset-x-0 bottom-[34vh] z-50 flex flex-col items-center gap-1 text-ink-dim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.35em]">
            Scroll to fly
          </span>
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          >
            <ChevronDown className="h-4 w-4 text-accent" />
          </motion.div>
        </motion.div>
      )}

      {/* ENDPOINTS */}
      <AnimatePresence>
        {atEnd && (
          <motion.div
            key="end"
            className="absolute inset-0 z-50 flex flex-col items-center justify-center px-6 text-center"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.78)_0%,rgba(0,0,0,0.5)_38%,transparent_72%)]" />
            <p className="relative mb-12 font-display text-xs uppercase tracking-[0.35em] text-accent [text-shadow:0_2px_18px_rgba(0,0,0,0.9)] md:text-sm">
              Welcome to the {galaxyData.author.name} galaxy
            </p>
            <div className="pointer-events-auto relative flex flex-col items-center gap-4 sm:flex-row">
              <button
                onClick={finishTour}
                style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
                className="glass-panel glass-panel-interactive flex items-center gap-2.5 px-9 py-3.5 font-display text-sm font-semibold uppercase tracking-[0.2em]"
              >
                <Play className="h-4 w-4" />
                Tour
              </button>
              <button
                onClick={finishExplore}
                className="glass-panel glass-panel-interactive flex items-center gap-2.5 px-9 py-3.5 font-display text-sm uppercase tracking-[0.2em] text-ink"
              >
                <Compass className="h-4 w-4" />
                Explore
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SKIP */}
      {introStarted && !atEnd && (
        <button
          onClick={finishExplore}
          className="pointer-events-auto absolute top-6 left-1/2 z-50 -translate-x-1/2 font-mono text-[11px] uppercase tracking-[0.3em] text-ink-dim transition-colors hover:text-ink"
        >
          Skip intro ›
        </button>
      )}
    </motion.div>
  );
}
