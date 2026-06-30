import { useState } from "react";
import { motion } from "framer-motion";
import { Show } from "@clerk/react";
import {
  Info,
  Orbit,
  Rocket,
  Lock,
  Map,
  Telescope,
  Heart,
  Github,
  Star,
  Share2,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAppState } from "@/lib/store";
import { useIsMobile } from "@/hooks/use-mobile";
import { isFiltersActive } from "@/data/galaxy";
import { AccountIndicatorRail } from "./AccountIndicator";
import { MessageCircleStar } from "./MessageCircleStar";
import { useGithubStars, formatStars } from "@/lib/useGithubStars";
import { SITE } from "@/config/site";
import { ShareModal } from "./ShareModal";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "./ui/tooltip";

/**
 * The cockpit dashboard — a single bottom HUD that replaces BOTH the old
 * Mission Control side rail AND the top-right Sponsor/GitHub/Share buttons.
 * Every control the galaxy needs lives here in one bar: the account avatar, the
 * Orbit/Fly toggle, and the buttons that raise the rich panels (Info, Ask
 * Cosmos, Personalize) plus the project/social actions. Those rich panels rise
 * from the bottom just above this bar (see Drawer.tsx).
 *
 * Desktop: a centred glass bar with hover tooltips. Mobile: the same bar runs
 * full-width and scrolls horizontally, with a small persistent caption under
 * each icon (hover tooltips are useless on touch).
 */
export function Dashboard() {
  const {
    filters,
    setInfoOpen,
    infoOpen,
    setInfoTab,
    setAskOpen,
    askOpen,
    setCustomizeOpen,
    customizeOpen,
    startTour,
    canExplore,
    cameraMode,
  } = useAppState();
  const isMobile = useIsMobile();
  const [shareOpen, setShareOpen] = useState(false);
  const { stars, url } = useGithubStars();
  const filtersActive = isFiltersActive(filters);

  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={400}>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-2 sm:px-3 sm:pb-3">
        <div className="custom-scrollbar pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto border-2 border-edge bg-bg/80 px-2 py-2 backdrop-blur-xl">
          {/* Account — avatar only; signed-out renders nothing (so does the rule). */}
          <Show when="signed-in">
            <AccountIndicatorRail />
            <Divider />
          </Show>

          {/* Camera mode — the centrepiece throttle. */}
          <CameraToggle />
          {cameraMode === "god" && (
            <Chrome isMobile={isMobile} label="Your ship">
              <SelfShipToggle />
            </Chrome>
          )}

          <Divider />

          {/* Rich panels that rise from the cockpit. */}
          <Chrome isMobile={isMobile} label="Info">
            <DashButton
              label="Info"
              onClick={() => {
                setInfoTab("about");
                setInfoOpen(true);
              }}
              open={infoOpen}
              icon={<Info size={15} />}
            />
          </Chrome>
          <Chrome isMobile={isMobile} label="Ask Cosmos">
            <DashButton
              label="Ask Cosmos"
              onClick={() => setAskOpen(true)}
              open={askOpen}
              active={filtersActive}
              icon={
                <MessageCircleStar
                  size={15}
                  className={filtersActive ? "text-accent" : undefined}
                />
              }
            />
          </Chrome>
          <Chrome isMobile={isMobile} label="Personalize">
            <DashButton
              label="Personalize"
              onClick={() => setCustomizeOpen(true)}
              open={customizeOpen}
              paidTag
              icon={<Telescope size={15} />}
            />
          </Chrome>
          <Chrome isMobile={isMobile} label="Tour">
            <DashButton
              label="Tour"
              onClick={startTour}
              locked={!canExplore}
              icon={<Map size={15} />}
            />
          </Chrome>

          <Divider />

          {/* Project / social actions — formerly the top-right buttons. */}
          <Chrome isMobile={isMobile} label="Sponsor">
            <a
              href={SITE.github.sponsors}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Sponsor this project"
              className="relative flex h-9 w-9 shrink-0 items-center justify-center border-2 border-edge bg-white/5 text-ink transition-colors hover:bg-white/10"
            >
              <Heart size={15} className="text-accent" />
            </a>
          </Chrome>
          <Chrome
            isMobile={isMobile}
            label={stars !== null ? `GitHub · ${formatStars(stars)} stars` : "GitHub"}
          >
            <a
              href={url ?? SITE.github.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View source on GitHub"
              className="relative flex h-9 shrink-0 items-center gap-1.5 border-2 border-edge bg-white/5 px-2.5 text-ink transition-colors hover:bg-white/10"
            >
              <Github size={15} className="shrink-0" />
              {stars !== null && !isMobile && (
                <span className="inline-flex items-center gap-0.5 font-mono text-[11px] text-accent">
                  <Star size={11} className="fill-current" />
                  {formatStars(stars)}
                </span>
              )}
            </a>
          </Chrome>
          <Chrome isMobile={isMobile} label="Share">
            <DashButton
              label="Share"
              onClick={() => setShareOpen(true)}
              icon={<Share2 size={15} />}
            />
          </Chrome>
        </div>
      </div>
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
    </TooltipProvider>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-edge" />;
}

// A square icon button for the dashboard. `open` marks a panel this button
// raised as currently open (accent outline + dot); `active` is a persistent
// signal (e.g. Ask has live filters); `locked`/`paidTag` add the gated/paid
// markers, mirroring the old console buttons.
function DashButton({
  onClick,
  icon,
  label,
  open = false,
  active = false,
  locked = false,
  paidTag = false,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  open?: boolean;
  active?: boolean;
  locked?: boolean;
  paidTag?: boolean;
}) {
  const openOnly = open && !active;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active || open}
      className={`relative flex h-9 w-9 shrink-0 items-center justify-center border-2 transition-all ${
        active
          ? "border-accent bg-accent/15 text-ink"
          : openOnly
            ? "border-accent bg-accent/10 text-ink hover:bg-accent/20"
            : "border-edge bg-white/5 text-ink hover:bg-white/10"
      }`}
    >
      {openOnly && (
        <span
          aria-hidden
          className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]"
        />
      )}
      {icon}
      {paidTag && (
        <span className="absolute -right-1 -top-1 border border-accent/60 bg-accent/20 px-1 font-mono text-[8px] font-semibold leading-tight tracking-widest text-accent">
          $
        </span>
      )}
      {locked && (
        <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Lock size={8} />
        </span>
      )}
    </button>
  );
}

// Orbit/Fly segmented toggle (sliding accent thumb). Same behaviour as the old
// console toggle; setCameraMode gates Fly behind the paywall, so tapping a
// locked Fly opens the paywall.
function CameraToggle() {
  const { cameraMode, setCameraMode, canExplore } = useAppState();
  const isFly = cameraMode === "spaceship";
  return (
    <div className="relative flex w-32 shrink-0 transform-gpu overflow-hidden border-2 border-edge bg-white/5 backdrop-blur-sm sm:w-40">
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-0 w-1/2 border border-accent/45 bg-accent/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_14px_rgba(163,136,238,0.4)]"
        initial={false}
        animate={{ x: isFly ? "100%" : "0%" }}
        transition={{ type: "spring", stiffness: 460, damping: 38, mass: 0.7 }}
      />
      <button
        onClick={() => setCameraMode("god")}
        aria-pressed={!isFly}
        className={`relative z-10 flex h-9 flex-1 items-center justify-center gap-1.5 transition-colors ${
          !isFly ? "text-ink" : "text-ink-dim hover:text-ink"
        }`}
      >
        <Orbit size={14} className="shrink-0" />
        <span className="font-display text-[11px] uppercase tracking-wider">
          Orbit
        </span>
      </button>
      <button
        onClick={() => setCameraMode("spaceship")}
        aria-pressed={isFly}
        className={`relative z-10 flex h-9 flex-1 items-center justify-center gap-1.5 transition-colors ${
          isFly ? "text-ink" : "text-ink-dim hover:text-ink"
        }`}
      >
        {canExplore ? (
          <Rocket size={14} className="shrink-0" />
        ) : (
          <Lock size={12} className="shrink-0 text-accent" />
        )}
        <span className="font-display text-[11px] uppercase tracking-wider">
          Fly
        </span>
      </button>
    </div>
  );
}

// Show/hide the viewer's own ship (only meaningful in Orbit view, where the
// self ship is drawn).
function SelfShipToggle() {
  const { showSelfShip, setShowSelfShip } = useAppState();
  return (
    <button
      type="button"
      onClick={() => setShowSelfShip(!showSelfShip)}
      aria-pressed={showSelfShip}
      aria-label={showSelfShip ? "Hide your ship" : "Show your ship"}
      className="relative flex h-9 w-9 shrink-0 items-center justify-center border-2 border-edge bg-white/5 text-ink transition-colors hover:bg-white/10"
    >
      {showSelfShip ? (
        <Eye size={15} />
      ) : (
        <EyeOff size={15} className="opacity-60" />
      )}
    </button>
  );
}

// Wraps a control with the right affordance for the platform: a hover tooltip
// on desktop, or a small persistent caption underneath on mobile (touch has no
// hover). Mirrors the old rail's RailTip / caption behaviour.
function Chrome({
  isMobile,
  label,
  children,
}: {
  isMobile: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (isMobile) {
    return (
      <div className="flex shrink-0 flex-col items-center gap-0.5">
        {children}
        <span className="max-w-[4rem] truncate font-display text-[8px] uppercase leading-none tracking-wide text-ink-dim">
          {label}
        </span>
      </div>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0">{children}</span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={8}
        className="rounded-none border-2 border-edge bg-black/90 px-2 py-1 font-display text-[10px] uppercase tracking-wider text-ink"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
