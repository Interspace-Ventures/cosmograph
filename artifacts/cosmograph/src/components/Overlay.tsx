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
import { SocialActions } from "./SocialActions";
import { galaxyData } from "@/data/galaxy";
import { presence } from "@/lib/presence";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";

const EMPTY_IDS: string[] = [];

export function Overlay() {
  const { introFinished, selectedObject, hoveredObject, tourActive } =
    useAppState();

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
                {selectedObject && (
                  <div className="absolute z-30 left-3 right-3 bottom-[5.5rem] max-h-[42vh] md:inset-x-auto md:right-auto md:bottom-auto md:top-36 md:left-5 md:w-[min(384px,calc(100vw-2.5rem))] md:max-h-[calc(100vh-15rem)] md:!block overflow-y-auto custom-scrollbar pointer-events-auto block">
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
        <SocialActions />
      </div>
      <p className="pointer-events-none text-ink/75 font-mono text-[13px] mt-1 uppercase tracking-[0.12em]">
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

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 font-mono text-[13px] text-ink-dim">
      <span className="text-ink">{value}</span>
      <span className="text-[12px] uppercase tracking-widest">{label}</span>
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
    <div className="pointer-events-none mt-2 inline-flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-widest text-ink-dim">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
      </span>
      <span className="text-ink">{count}</span> cosmonaut
      {count === 1 ? "" : "s"} streaming now
    </div>
  );
}
