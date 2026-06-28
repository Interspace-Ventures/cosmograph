import { useAppState } from "@/lib/store";
import { AnimatePresence, motion } from "framer-motion";
import { ScrollIntro } from "./ScrollIntro";
import { DetailPanel } from "./DetailPanel";
import { TourOverlay } from "./TourOverlay";
import { Footer } from "./Footer";
import { InfoDrawer } from "./InfoDrawer";
import { AskDrawer } from "./AskDrawer";
import { CustomizeDrawer } from "./CustomizeDrawer";
import { BannerHost } from "./BannerHost";
import { EngagePrompt } from "./EngagePrompt";
import { galaxyData } from "@/data/galaxy";
import { useIsMobile } from "@/hooks/use-mobile";
import { presence } from "@/lib/presence";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { ExternalLink, Github, Heart, Share2, Star } from "lucide-react";
import { useGithubStars, formatStars } from "@/lib/useGithubStars";
import { SITE } from "@/config/site";
import { ShareModal } from "./ShareModal";

const EMPTY_IDS: string[] = [];

export function Overlay() {
  const { introFinished, selectedObject, hoveredObject, tourActive, consoleOpen } =
    useAppState();
  const isMobile = useIsMobile();

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      <AnimatePresence>
        {!introFinished && <ScrollIntro key="intro" />}
      </AnimatePresence>

      {introFinished && (
        <>
          {!tourActive && (
            <>
              <BannerHost />
              <Header />
              <HeaderActions />

              <AnimatePresence>
                {hoveredObject && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="absolute top-24 left-1/2 -translate-x-1/2 glass-panel px-4 py-2 max-w-md text-center pointer-events-none"
                  >
                    <span className="font-mono text-[10px] uppercase tracking-widest text-accent mr-2">
                      {hoveredObject.type === "sun" ? "Domain" : "Paper"}
                    </span>
                    <span className="text-sm paper-ink line-clamp-1">
                      {hoveredObject.name}
                    </span>
                    {hoveredObject.type === "sun" &&
                      (() => {
                        const d = galaxyData.domains.find(
                          (x) => x.id === hoveredObject.id,
                        );
                        if (!d) return null;
                        return (
                          <div className="mt-1.5 flex items-center justify-center gap-4 font-mono text-[11px] text-ink-dim">
                            <span>
                              <span className="text-ink">{d.paperCount}</span>{" "}
                              papers
                            </span>
                            <span className="text-ink-dim/40">·</span>
                            <span>
                              <span className="text-ink">
                                {d.totalCitations.toLocaleString()}
                              </span>{" "}
                              citations
                            </span>
                          </div>
                        );
                      })()}
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {selectedObject && !(isMobile && consoleOpen) && (
                  <div className="absolute z-30 left-3 right-3 bottom-[4.25rem] max-h-[42vh] md:inset-x-auto md:right-auto md:bottom-auto md:top-36 md:left-5 md:w-[min(384px,calc(100vw-2.5rem))] md:max-h-[calc(100vh-15rem)] md:!block overflow-y-auto custom-scrollbar pointer-events-auto block">
                    <DetailPanel />
                  </div>
                )}
              </AnimatePresence>

              <Footer />
              <EngagePrompt />
            </>
          )}
          <TourOverlay />
          <InfoDrawer />
          <AskDrawer />
          <CustomizeDrawer />
        </>
      )}
    </div>
  );
}

function Header() {
  const { stats } = galaxyData;
  const { bannerHeight } = useAppState();
  return (
    <div
      className="absolute left-0 p-6 pr-16 pb-10 transition-[top] duration-300 ease-out"
      style={{
        top: bannerHeight,
        background:
          "radial-gradient(130% 130% at 0% 0%, rgba(8,9,13,0.82) 0%, rgba(8,9,13,0.5) 40%, transparent 72%)",
      }}
    >
      <div className="flex items-center gap-2.5">
        <img
          src={`${import.meta.env.BASE_URL}logo-mark.svg`}
          alt=""
          aria-hidden="true"
          className="pointer-events-none h-8 w-8"
        />
        <h1 className="pointer-events-none text-3xl font-title font-bold tracking-tight text-ink">
          Cosmograph
        </h1>
      </div>
      <p className="pointer-events-none text-ink/75 font-mono text-[11px] mt-1 uppercase tracking-[0.12em]">
        Scientific Work at Galactic Scale · {galaxyData.author.name}
      </p>
      <div className="pointer-events-none mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <HeaderStat label="Papers" value={stats.totalPapers.toLocaleString()} />
        <HeaderStat
          label="Citations"
          value={stats.totalCitations.toLocaleString()}
        />
        <HeaderStat
          label="Co-authors"
          value={stats.uniqueCoAuthors.toLocaleString()}
        />
        <HeaderStat label="Years" value={String(stats.yearsActive)} />
        <HeaderStat
          label="Words"
          value={`${compactNumber(stats.estimatedWords)}+`}
        />
      </div>
      <LivePresence />
    </div>
  );
}

// GitHub + Share pulled out of the console into two standalone buttons pinned
// top-right. On mobile the console docks to the bottom so the top-right is free
// (right-0); on desktop the console occupies the right edge, so these slide left
// of it by the live console width and stay clear of the panel.
function HeaderActions() {
  const { consoleOpen, bannerHeight } = useAppState();
  const isMobile = useIsMobile();
  const [shareOpen, setShareOpen] = useState(false);
  const { stars, url } = useGithubStars();
  const desktopRight = consoleOpen ? "min(12rem, 80vw)" : "3.5rem";
  return (
    <div
      className={`absolute right-0 z-20 flex items-center gap-2 px-3 transition-[right,top] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isMobile ? "py-3" : "py-1"
      }`}
      style={{
        top: bannerHeight,
        right: isMobile ? "0px" : `calc(${desktopRight} + 0.5rem)`,
      }}
    >
      <a
        href={SITE.github.sponsors}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Sponsor this project"
        className="pointer-events-auto flex h-9 items-center gap-2 border-2 border-edge bg-white/5 px-3 text-ink backdrop-blur-sm transition-colors hover:bg-white/10"
      >
        <Heart size={15} className="shrink-0 text-accent" />
        <span className="font-display text-[11px] uppercase tracking-wider">
          Sponsor
        </span>
        <ExternalLink size={12} className="shrink-0 text-ink-dim" />
      </a>
      <a
        href={url ?? SITE.github.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View source on GitHub"
        className="pointer-events-auto flex h-9 items-center gap-2 border-2 border-edge bg-white/5 px-3 text-ink backdrop-blur-sm transition-colors hover:bg-white/10"
      >
        <Github size={15} className="shrink-0" />
        <span className="font-display text-[11px] uppercase tracking-wider">
          GitHub
        </span>
        {stars !== null && (
          <span className="inline-flex items-center gap-0.5 font-mono text-[11px] text-accent">
            <Star size={11} className="fill-current" />
            {formatStars(stars)}
          </span>
        )}
      </a>
      <button
        onClick={() => setShareOpen(true)}
        aria-label="Share this Cosmograph"
        className="pointer-events-auto flex h-9 items-center gap-2 border-2 border-edge bg-white/5 px-3 text-ink backdrop-blur-sm transition-colors hover:bg-white/10"
      >
        <Share2 size={15} className="shrink-0" />
        <span className="font-display text-[11px] uppercase tracking-wider">
          Share
        </span>
      </button>
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 font-mono text-[11px] text-ink-dim">
      <span className="text-ink">{value}</span>
      <span className="text-[10px] uppercase tracking-widest">{label}</span>
    </span>
  );
}

function compactNumber(n: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function LivePresence() {
  const count = useSyncExternalStore(
    presence.subscribe,
    presence.getCount,
    () => 0,
  );
  const revealed = useSyncExternalStore(
    presence.subscribe,
    presence.getRevealed,
    () => false,
  );
  const peerIds = useSyncExternalStore(
    presence.subscribe,
    presence.getPeerIds,
    () => EMPTY_IDS,
  );
  const announced = useRef(false);

  // Announce other cosmonauts once they fade in after the grace period; re-arm
  // when everyone leaves so the next wave gets its own toast.
  useEffect(() => {
    if (revealed && peerIds.length > 0 && !announced.current) {
      announced.current = true;
      toast("More cosmonauts arriving", {
        description: "Other explorers are streaming the stars with you.",
      });
    }
    if (peerIds.length === 0) announced.current = false;
  }, [revealed, peerIds]);

  if (count < 1) return null;
  return (
    <div className="pointer-events-none mt-2 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-dim">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
      </span>
      <span className="text-ink">{count}</span> cosmonaut
      {count === 1 ? "" : "s"} streaming now
    </div>
  );
}
