import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Info,
  Orbit,
  Compass,
  Rewind,
  Map,
  Navigation,
  Share2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Heart,
  Lock,
  Github,
  LayoutGrid,
  Rocket,
  Telescope,
  Sparkles,
} from "lucide-react";
import { useAppState } from "@/lib/store";
import { isFiltersActive } from "@/data/galaxy";
import { SITE } from "@/config/site";
import { ShareButton } from "./ShareButton";
import { GitHubLink } from "./GitHubLink";
import { AccountIndicator, AccountIndicatorRail } from "./AccountIndicator";
import { MessageCircleStar } from "./MessageCircleStar";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "./ui/tooltip";

export function Sidebar() {
  const {
    setCameraMode,
    cameraMode,
    filters,
    setInfoOpen,
    setAskOpen,
    setChangelogOpen,
    setCustomizeOpen,
    replayIntro,
    startTour,
    canExplore,
    consoleOpen: open,
    setConsoleOpen: setOpen,
  } = useAppState();

  const { openSections, toggleSection } = useSectionState();

  const filtersActive = isFiltersActive(filters);

  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={400}>
    <div
      className={`console-panel absolute right-0 top-0 z-30 flex h-full flex-col overflow-hidden transition-[width] duration-[450ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[width] ${
        open ? "w-[min(14rem,80vw)]" : "w-14"
      }`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          <motion.div
            key="panel"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.18 }}
            className="flex h-full w-full flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b-2 border-edge px-3 py-2">
              <span className="font-display text-xs uppercase tracking-wider text-ink">
                Mission Control
              </span>
              <button
                onClick={() => setOpen(false)}
                title="Collapse console"
                aria-label="Collapse console"
                className="flex h-7 w-7 items-center justify-center border-2 border-edge bg-white/5 text-ink-dim transition-colors hover:bg-white/10 hover:text-ink"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            {/* Scroll body */}
            <div className="flex flex-col gap-4 overflow-y-auto custom-scrollbar p-3">
              {/* Account — avatar + access status, shown above Platform when signed in */}
              <AccountIndicator />
              {/* Platform — info, account, meta & primary actions */}
              <CollapsibleSection
                icon={<LayoutGrid size={15} />}
                title="Platform"
                isOpen={openSections.platform}
                onToggle={() => toggleSection("platform")}
                flush
              >
                <div className="flex flex-col gap-1.5">
                  <ConsoleButton
                    onClick={() => setInfoOpen(true)}
                    icon={<Info size={14} />}
                    label="Info"
                  />
                  <ConsoleButton
                    onClick={() => setChangelogOpen(true)}
                    icon={<Rocket size={14} />}
                    label="Changelog"
                  />
                  <a
                    href={SITE.github.sponsors}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Sponsor development via GitHub Sponsors (opens in a new tab)"
                    className="flex h-9 w-full items-center gap-2 border-2 border-accent bg-accent/20 px-3 text-white transition-all hover:bg-accent/30"
                  >
                    <Heart size={14} className="shrink-0 text-white" />
                    <span className="font-display text-[11px] uppercase tracking-wider">
                      Sponsor
                    </span>
                    <Github
                      size={14}
                      className="ml-auto shrink-0 text-white/70"
                    />
                  </a>
                  <ConsoleButton
                    active={filtersActive}
                    onClick={() => setAskOpen(true)}
                    icon={
                      <MessageCircleStar
                        size={14}
                        className={filtersActive ? "text-accent" : undefined}
                      />
                    }
                    label="Ask"
                  />

                  {/* Personalize — paid */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setCustomizeOpen(true)}
                        className="flex h-9 w-full items-center gap-2 border-2 border-accent bg-accent/20 px-3 text-white transition-all hover:bg-accent/30"
                      >
                        <Telescope size={14} className="shrink-0 text-white" />
                        <span className="font-display text-[11px] uppercase tracking-wider">
                          Personalize
                        </span>
                        <Sparkles size={13} className="ml-auto shrink-0 text-white/90" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="left"
                      sideOffset={8}
                      className="rounded-none border-2 border-edge bg-black/90 px-2 py-1 font-display text-[10px] uppercase tracking-wider text-ink"
                    >
                      Choose scientist for cosmograph
                    </TooltipContent>
                  </Tooltip>
                </div>
              </CollapsibleSection>

              {/* Share */}
              <CollapsibleSection
                icon={<Share2 size={15} />}
                title="Share"
                isOpen={openSections.share}
                onToggle={() => toggleSection("share")}
              >
                <div className="flex flex-col gap-1.5">
                  <GitHubLink full />
                  <ShareButton full />
                </div>
              </CollapsibleSection>

              {/* Navigate */}
              <CollapsibleSection
                icon={<Navigation size={15} />}
                title="Navigate"
                isOpen={openSections.navigate}
                onToggle={() => toggleSection("navigate")}
              >
                <div className="flex flex-col gap-1.5">
                  <ConsoleButton
                    active={cameraMode === "god"}
                    onClick={() => setCameraMode("god")}
                    icon={<Orbit size={14} />}
                    label="Orbit"
                  />
                  <ConsoleButton
                    active={cameraMode === "spaceship"}
                    onClick={() => setCameraMode("spaceship")}
                    icon={<Compass size={14} />}
                    label="Fly"
                    locked={!canExplore}
                  />
                  <ConsoleButton
                    onClick={startTour}
                    icon={<Map size={14} />}
                    label="Tour"
                    locked={!canExplore}
                  />
                  <ConsoleButton
                    onClick={replayIntro}
                    icon={<Rewind size={14} />}
                    label="Replay"
                  />
                </div>
              </CollapsibleSection>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="rail"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.18 }}
            className="flex h-full w-full flex-col items-center gap-1 p-1.5"
          >
            {/* Header — mirrors the expanded console header (collapse toggle) */}
            <RailButton onClick={() => setOpen(true)} label="Expand console">
              <ChevronLeft size={16} />
            </RailButton>
            <Divider />
            {/* Platform — info, account, meta & primary actions */}
            <RailButton onClick={() => setInfoOpen(true)} label="Info">
              <Info size={16} />
            </RailButton>
            <AccountIndicatorRail />
            <RailButton onClick={() => setChangelogOpen(true)} label="Changelog">
              <Rocket size={15} />
            </RailButton>
            <RailTip label="Sponsor">
              <a
                href={SITE.github.sponsors}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Sponsor via GitHub Sponsors (opens in a new tab)"
                className="relative flex h-9 w-9 items-center justify-center border-2 border-accent bg-accent/20 text-white transition-all hover:bg-accent/30"
              >
                <Heart size={15} />
              </a>
            </RailTip>
            <RailButton active={filtersActive} onClick={() => setAskOpen(true)} label="Ask">
              <MessageCircleStar size={15} />
              {filtersActive && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-accent ring-2 ring-black" />
              )}
            </RailButton>
            <RailTip label="Personalize">
              <button
                type="button"
                onClick={() => setCustomizeOpen(true)}
                className="relative flex h-9 w-9 items-center justify-center border-2 border-accent bg-accent/20 text-white transition-all hover:bg-accent/30"
              >
                <Telescope size={15} />
                <span className="absolute -top-1.5 -right-1.5 grid h-4 w-4 place-items-center rounded-full bg-accent leading-none text-black ring-2 ring-black">
                  <Sparkles size={9} />
                </span>
              </button>
            </RailTip>
            <Divider />
            {/* Share */}
            <RailTip label="GitHub">
              <GitHubLink compact />
            </RailTip>
            <RailTip label="Share">
              <ShareButton />
            </RailTip>
            <Divider />
            {/* Navigate */}
            <RailButton
              active={cameraMode === "god"}
              onClick={() => setCameraMode("god")}
              label="Orbit"
            >
              <Orbit size={15} />
            </RailButton>
            <RailButton
              active={cameraMode === "spaceship"}
              onClick={() => setCameraMode("spaceship")}
              label="Fly"
              locked={!canExplore}
            >
              <Compass size={15} />
            </RailButton>
            <RailButton onClick={startTour} label="Tour" locked={!canExplore}>
              <Map size={16} />
            </RailButton>
            <RailButton onClick={replayIntro} label="Replay">
              <Rewind size={16} />
            </RailButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </TooltipProvider>
  );
}

type SectionKey = "share" | "navigate" | "platform";

const SECTION_STORAGE_KEY = "galaxy.console.sections";
const DEFAULT_SECTIONS: Record<SectionKey, boolean> = {
  share: true,
  navigate: true,
  platform: true,
};

function useSectionState() {
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(
    () => {
      try {
        const raw = localStorage.getItem(SECTION_STORAGE_KEY);
        if (raw) return { ...DEFAULT_SECTIONS, ...JSON.parse(raw) };
      } catch {
        /* ignore */
      }
      return DEFAULT_SECTIONS;
    },
  );
  const toggleSection = (key: SectionKey) =>
    setOpenSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  return { openSections, toggleSection };
}

function CollapsibleSection({
  icon,
  title,
  isOpen,
  onToggle,
  children,
  flush = false,
}: {
  icon?: React.ReactNode;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <div className={flush ? "" : "border-t-2 border-edge pt-3"}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <SectionLabel icon={icon}>{title}</SectionLabel>
        <span className="flex items-center gap-2">
          <ChevronDown
            size={14}
            className={`shrink-0 text-ink-dim transition-transform ${
              isOpen ? "" : "-rotate-90"
            }`}
          />
        </span>
      </button>
      {isOpen && <div className="mt-3">{children}</div>}
    </div>
  );
}

function SectionLabel({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-2 font-mono text-[13px] uppercase tracking-widest text-ink-dim">
      {icon}
      {children}
    </span>
  );
}

function ConsoleButton({
  active = false,
  onClick,
  icon,
  label,
  locked = false,
}: {
  active?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  locked?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={locked ? `${label} — unlock to explore` : label}
      style={active ? { background: "var(--accent)" } : undefined}
      className={`flex w-full items-center gap-2 border-2 border-edge px-3 py-2 text-[11px] font-display uppercase tracking-wider transition-all ${
        active ? "text-accent-foreground" : "bg-white/5 text-ink hover:bg-white/10"
      }`}
    >
      {icon}
      {label}
      {locked && <Lock size={11} className="ml-auto opacity-70" />}
    </button>
  );
}

function RailTipContent({ children }: { children: React.ReactNode }) {
  return (
    <TooltipContent
      side="left"
      sideOffset={8}
      className="rounded-none border-2 border-edge bg-black/90 px-2 py-1 font-display text-[10px] uppercase tracking-wider text-ink"
    >
      {children}
    </TooltipContent>
  );
}

// Tooltip wrapper for rail items that render their own root element
// (links, the share button, the account glyph). The span trigger receives the
// hover handlers so we don't depend on each child forwarding refs/props.
function RailTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{children}</span>
      </TooltipTrigger>
      <RailTipContent>{label}</RailTipContent>
    </Tooltip>
  );
}

function RailButton({
  active = false,
  onClick,
  label,
  children,
  locked = false,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  locked?: boolean;
}) {
  const tip = locked ? `${label} — unlock to explore` : label;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-pressed={active}
          aria-label={tip}
          style={active ? { background: "var(--accent)" } : undefined}
          className={`relative flex h-9 w-9 items-center justify-center border-2 border-edge transition-all ${
            active ? "text-accent-foreground" : "bg-white/5 text-ink hover:bg-white/10"
          }`}
        >
          {children}
          {locked && (
            <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Lock size={8} />
            </span>
          )}
        </button>
      </TooltipTrigger>
      <RailTipContent>{tip}</RailTipContent>
    </Tooltip>
  );
}

function Divider() {
  return <div className="my-0.5 h-px w-6 bg-edge/60" />;
}
