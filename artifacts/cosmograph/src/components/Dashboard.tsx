import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Show } from "@clerk/react";
import { Info, Orbit, Rocket, Lock, Map, Telescope } from "lucide-react";
import { useAppState } from "@/lib/store";
import { isFiltersActive } from "@/data/galaxy";
import { AccountIndicatorRail } from "./AccountIndicator";
import { MessageCircleStar } from "./MessageCircleStar";

/**
 * The cockpit dashboard — the bottom HUD that replaces the old Mission Control
 * side rail. Every in-galaxy control lives here in one bar: the account avatar,
 * the Orbit/Fly toggle, and the labelled buttons that raise the rich panels
 * (Info, Ask Cosmo, Personalize, Tour). Those rich panels rise from the bottom
 * just above this bar (see Drawer.tsx). The project/social actions (Sponsor,
 * GitHub, Share) live beside the header title instead (see SocialActions.tsx).
 *
 * Each control shows its label inline beside the icon. The bar centres on
 * desktop and scrolls horizontally if it ever outgrows the viewport (e.g. on
 * narrow phones), so no control is ever unreachable.
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
    setCockpitWidth,
  } = useAppState();
  const filtersActive = isFiltersActive(filters);
  const barRef = useRef<HTMLDivElement>(null);
  const lastWidth = useRef(0);

  // Publish the cockpit bar's rendered width so the rich panels (Drawer) can
  // match the navbar exactly. Re-measures on resize and on content changes
  // (e.g. signing in adds the avatar, the star count toggles). Rounds and only
  // publishes on a meaningful delta to avoid spurious global re-renders.
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const publish = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (Math.abs(w - lastWidth.current) < 1) return;
      lastWidth.current = w;
      setCockpitWidth(w);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, [setCockpitWidth]);

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-2 sm:px-3 sm:pb-3 md:pb-10">
        <div
          ref={barRef}
          className="custom-scrollbar pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto border-2 border-edge bg-bg/80 px-2 py-2 backdrop-blur-xl"
        >
          {/* Account — avatar only; signed-out renders nothing (so does the rule). */}
          <Show when="signed-in">
            <AccountIndicatorRail />
            <Divider />
          </Show>

          {/* Camera mode — the centrepiece throttle. */}
          <CameraToggle />

          <Divider />

          {/* Rich panels that rise from the cockpit. */}
          <DashButton
            label="Info"
            onClick={() => {
              setInfoTab("about");
              setInfoOpen(true);
            }}
            open={infoOpen}
            icon={<Info size={15} />}
          />
          <DashButton
            label="Ask Cosmo"
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
          <DashButton
            label="Personalize"
            onClick={() => setCustomizeOpen(true)}
            open={customizeOpen}
            paidTag
            icon={<Telescope size={15} />}
          />
          <DashButton
            label="Tour"
            onClick={startTour}
            locked={!canExplore}
            icon={<Map size={15} />}
          />
        </div>
      </div>
    </>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-edge" />;
}

// A labelled icon button for the dashboard. `open` marks a panel this button
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
      aria-pressed={active || open}
      className={`relative flex h-9 shrink-0 items-center gap-2 border-2 px-3 transition-all ${
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
      <span className="font-display text-[11px] uppercase tracking-wider">
        {label}
      </span>
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
