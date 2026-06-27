import { useState, useRef, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Info,
  Orbit,
  History,
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
  Eye,
  EyeOff,
} from "lucide-react";
import { HistoryIcon, RocketIcon, TelescopeIcon } from "lucide-animated";
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

/**
 * Mission Control console model.
 *
 * The collapsed rail and the expanded panel are rendered from this single
 * ordered list of sections/items so they can never drift apart in order,
 * labels, icons, or gating. The two renderers (`ConsoleBody` for expanded,
 * `RailBody` for collapsed) decide how each item *looks*:
 *
 *  - expanded keeps the active-state fills, accent CTAs, and section chrome;
 *  - collapsed is a neutral set of working icon shortcuts — no active fills,
 *    no accent CTAs, no badges — only the lock indicator on gated items.
 */
type IconType = React.ComponentType<{ size?: number; className?: string }>;

/**
 * Animated sidebar icons (lucide-animated). Each exposes an imperative handle so
 * the parent button can replay the animation on click. Structurally every
 * lucide-animated icon shares this handle + prop shape.
 */
type AnimatedIconHandle = {
  startAnimation: () => void;
  stopAnimation: () => void;
};
type AnimatedIconType = React.ForwardRefExoticComponent<
  { size?: number; className?: string; animateOnHover?: boolean } & React.RefAttributes<AnimatedIconHandle>
>;

type ConsoleItem =
  | {
      kind: "action";
      id: string;
      label: string;
      railLabel?: string;
      Icon: IconType;
      onClick: () => void;
      active?: boolean;
      /** A panel/drawer this button opens is currently open. Distinct from
       *  `active` (a persistent mode like a camera view): rendered as an accent
       *  outline + dot rather than the solid mode fill, so an open panel and an
       *  active mode can both read as "on" without looking identical. */
      open?: boolean;
      locked?: boolean;
      accent?: boolean;
      paidTag?: boolean;
      trailing?: IconType;
      tooltip?: string;
      activeIconClass?: string;
      /** Optional animated icon (lucide-animated) replayed on click. */
      animated?: AnimatedIconType;
    }
  | {
      kind: "link";
      id: string;
      label: string;
      railLabel?: string;
      Icon: IconType;
      href: string;
      title?: string;
      accent?: boolean;
      paidTag?: boolean;
      trailing?: IconType;
    }
  | {
      kind: "custom";
      id: string;
      label: string;
      expanded: React.ReactNode;
      rail: React.ReactNode;
      railTip?: boolean;
    };

type ConsoleSection = {
  id: "account" | SectionKey;
  title?: string;
  icon?: React.ReactNode;
  flush?: boolean;
  /** chrome = collapsible header (expanded) + divider separation (collapsed) */
  chrome: boolean;
  items: ConsoleItem[];
};

export function Sidebar() {
  const {
    setCameraMode,
    cameraMode,
    filters,
    setInfoOpen,
    infoOpen,
    setAskOpen,
    askOpen,
    setChangelogOpen,
    changelogOpen,
    setCustomizeOpen,
    customizeOpen,
    replayIntro,
    startTour,
    canExplore,
    consoleOpen: open,
    setConsoleOpen: setOpen,
  } = useAppState();

  const { openSections, toggleSection } = useSectionState();

  const filtersActive = isFiltersActive(filters);

  const sections: ConsoleSection[] = [
    {
      id: "account",
      chrome: false,
      items: [
        {
          kind: "custom",
          id: "account",
          label: "Account",
          expanded: <AccountIndicator />,
          rail: <AccountIndicatorRail />,
        },
      ],
    },
    {
      id: "platform",
      title: "Platform",
      icon: <LayoutGrid size={15} />,
      flush: true,
      chrome: true,
      items: [
        {
          kind: "action",
          id: "info",
          label: "Info",
          Icon: Info,
          onClick: () => setInfoOpen(true),
          open: infoOpen,
        },
        {
          kind: "action",
          id: "changelog",
          label: "Changelog",
          Icon: History,
          animated: HistoryIcon,
          onClick: () => setChangelogOpen(true),
          open: changelogOpen,
        },
        {
          kind: "action",
          id: "ask",
          label: "Ask Cosmos",
          railLabel: "Ask",
          Icon: MessageCircleStar,
          onClick: () => setAskOpen(true),
          open: askOpen,
          active: filtersActive,
          activeIconClass: "text-accent",
        },
        {
          kind: "link",
          id: "sponsor",
          label: "Sponsor",
          Icon: Heart,
          href: SITE.github.sponsors,
          title: "Sponsor development via GitHub Sponsors (opens in a new tab)",
          paidTag: true,
          trailing: Github,
        },
        {
          kind: "action",
          id: "personalize",
          label: "Personalize",
          Icon: Telescope,
          animated: TelescopeIcon,
          onClick: () => setCustomizeOpen(true),
          open: customizeOpen,
          paidTag: true,
          trailing: Sparkles,
          tooltip: "Choose researcher for cosmograph",
        },
      ],
    },
    {
      id: "share",
      title: "Share",
      icon: <Share2 size={15} />,
      chrome: true,
      items: [
        {
          kind: "custom",
          id: "github",
          label: "GitHub",
          expanded: <GitHubLink full />,
          rail: <GitHubLink compact />,
          railTip: true,
        },
        {
          kind: "custom",
          id: "share",
          label: "Share",
          expanded: <ShareButton full />,
          rail: <ShareButton />,
          railTip: true,
        },
      ],
    },
    {
      id: "navigate",
      title: "Navigate",
      icon: <Navigation size={15} />,
      chrome: true,
      items: [
        {
          kind: "action",
          id: "orbit",
          label: "Orbit",
          Icon: Orbit,
          onClick: () => setCameraMode("god"),
          active: cameraMode === "god",
        },
        {
          kind: "action",
          id: "fly",
          label: "Fly",
          Icon: Rocket,
          animated: RocketIcon,
          onClick: () => setCameraMode("spaceship"),
          active: cameraMode === "spaceship",
          locked: !canExplore,
        },
        {
          kind: "action",
          id: "tour",
          label: "Tour",
          Icon: Map,
          onClick: startTour,
          locked: !canExplore,
        },
        {
          kind: "action",
          id: "replay",
          label: "Re-intro",
          Icon: Rewind,
          onClick: replayIntro,
        },
      ],
    },
  ];

  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={400}>
      <div
        className={`console-panel absolute right-0 top-0 z-30 flex h-full flex-col overflow-hidden transition-[width] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] ${
          open ? "w-[min(12rem,80vw)]" : "w-14"
        }`}
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.div
              key="panel"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.14 }}
              className="flex h-full w-[min(12rem,80vw)] shrink-0 flex-col overflow-hidden"
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

              <ConsoleBody
                sections={sections}
                openSections={openSections}
                toggleSection={toggleSection}
              />
            </motion.div>
          ) : (
            <motion.div
              key="rail"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.14 }}
              className="flex h-full w-14 shrink-0 flex-col overflow-hidden"
            >
              {/* Header — mirrors the expanded console header: same height, bottom
                border, and a same-size toggle button so the collapse/expand
                control stays in place when the panel opens and closes. */}
              <div className="flex shrink-0 items-center justify-center border-b-2 border-edge px-3 py-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setOpen(true)}
                      title="Expand console"
                      aria-label="Expand console"
                      className="flex h-7 w-7 items-center justify-center border-2 border-edge bg-white/5 text-ink-dim transition-colors hover:bg-white/10 hover:text-ink"
                    >
                      <ChevronLeft size={15} />
                    </button>
                  </TooltipTrigger>
                  <RailTipContent>Expand console</RailTipContent>
                </Tooltip>
              </div>

              <RailBody sections={sections} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  );
}

/** Expanded panel body: section chrome + full-width labelled controls. */
function ConsoleBody({
  sections,
  openSections,
  toggleSection,
}: {
  sections: ConsoleSection[];
  openSections: Record<SectionKey, boolean>;
  toggleSection: (key: SectionKey) => void;
}) {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto custom-scrollbar p-3">
      {sections.map((section) =>
        section.chrome ? (
          <CollapsibleSection
            key={section.id}
            icon={section.icon}
            title={section.title ?? ""}
            isOpen={openSections[section.id as SectionKey]}
            onToggle={() => toggleSection(section.id as SectionKey)}
            flush={section.flush}
          >
            <div className="flex flex-col gap-1.5">
              {section.items.map((item) => (
                <ExpandedItem key={item.id} item={item} />
              ))}
            </div>
          </CollapsibleSection>
        ) : (
          <Fragment key={section.id}>
            {section.items.map((item) => (
              <ExpandedItem key={item.id} item={item} />
            ))}
          </Fragment>
        ),
      )}
    </div>
  );
}

/** Collapsed rail body: neutral icon shortcuts, dividers between groups. */
function RailBody({ sections }: { sections: ConsoleSection[] }) {
  let firstChromeSeen = false;
  return (
    <div className="flex flex-col items-center gap-1 overflow-y-auto custom-scrollbar p-1.5">
      {sections.map((section) => {
        let divider = false;
        if (section.chrome) {
          divider = firstChromeSeen;
          firstChromeSeen = true;
        }
        return (
          <Fragment key={section.id}>
            {divider && <Divider />}
            {section.items.map((item) => (
              <RailItem key={item.id} item={item} />
            ))}
          </Fragment>
        );
      })}
    </div>
  );
}

/** One item rendered for the expanded panel. */
// Subtle inline "this costs money" marker — a small hard-edged purple tag, so a
// paid action reads as paid without flooding the whole button with accent.
function PaidTag() {
  return (
    <span className="ml-auto shrink-0 border border-accent/60 bg-accent/15 px-1.5 py-px font-mono text-[9px] font-semibold tracking-widest text-accent">
      $
    </span>
  );
}

function ExpandedItem({ item }: { item: ConsoleItem }) {
  // Ref to an optional animated icon so a click replays its animation. Declared
  // unconditionally (before any early return) to keep hook order stable.
  const animRef = useRef<AnimatedIconHandle>(null);

  if (item.kind === "custom") return <>{item.expanded}</>;

  if (item.kind === "link") {
    const { Icon } = item;
    const Trailing = item.trailing;
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        title={item.title ?? `${item.label} (opens in a new tab)`}
        className={
          item.accent
            ? "flex h-9 w-full items-center gap-2 border-2 border-accent bg-accent/20 px-3 text-white transition-all hover:bg-accent/30"
            : "flex h-9 w-full items-center gap-2 border-2 border-edge bg-white/5 px-3 text-ink transition-all hover:bg-white/10"
        }
      >
        <Icon size={14} className="shrink-0 text-white" />
        <span className="font-display text-[11px] uppercase tracking-wider">
          {item.label}
        </span>
        {item.paidTag ? (
          <PaidTag />
        ) : (
          Trailing && (
            <Trailing size={14} className="ml-auto shrink-0 text-white/70" />
          )
        )}
      </a>
    );
  }

  // Orbit gets a small embedded "show/hide my ship" toggle on its right edge,
  // since the viewer's own ship only appears in Orbit view.
  if (item.kind === "action" && item.id === "orbit") {
    return <OrbitControl onOrbit={item.onClick} active={!!item.active} />;
  }

  // action
  const { Icon } = item;
  // Replay the animated icon (if any) on click, then run the action. The icon
  // also auto-animates on hover for a bit of liveliness.
  const handleClick = () => {
    animRef.current?.startAnimation();
    item.onClick();
  };
  const renderIcon = (size: number, className?: string) =>
    item.animated ? (
      <item.animated
        ref={animRef}
        size={size}
        className={className}
        animateOnHover
      />
    ) : (
      <Icon size={size} className={className} />
    );

  if (item.accent || item.paidTag) {
    const Trailing = item.trailing;
    const btn = (
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={item.open}
        className={
          item.accent
            ? "relative flex h-9 w-full items-center gap-2 border-2 border-accent bg-accent/20 px-3 text-white transition-all hover:bg-accent/30"
            : item.open
              ? "relative flex h-9 w-full items-center gap-2 border-2 border-accent bg-accent/10 px-3 text-ink transition-all hover:bg-accent/20"
              : "relative flex h-9 w-full items-center gap-2 border-2 border-edge bg-white/5 px-3 text-ink transition-all hover:bg-white/10"
        }
      >
        {item.open && <OpenDot />}
        {renderIcon(14, "shrink-0 text-white")}
        <span className="font-display text-[11px] uppercase tracking-wider">
          {item.label}
        </span>
        {item.paidTag ? (
          <PaidTag />
        ) : (
          Trailing && (
            <Trailing size={13} className="ml-auto shrink-0 text-white/90" />
          )
        )}
      </button>
    );
    return item.tooltip ? (
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent
          side="left"
          sideOffset={8}
          className="rounded-none border-2 border-edge bg-black/90 px-2 py-1 font-display text-[10px] uppercase tracking-wider text-ink"
        >
          {item.tooltip}
        </TooltipContent>
      </Tooltip>
    ) : (
      btn
    );
  }

  return (
    <ConsoleButton
      active={item.active}
      open={item.open}
      onClick={handleClick}
      locked={item.locked}
      icon={renderIcon(14, item.active ? item.activeIconClass : undefined)}
      label={item.label}
    />
  );
}

// Small accent dot marking a button whose panel/drawer is currently open. Sits
// in the top-left corner so it never collides with a trailing PaidTag/icon. This
// is deliberately NOT the solid mode fill (Orbit/Fly) — an open panel and an
// active camera mode are different kinds of "on" and should read differently.
function OpenDot() {
  return (
    <span
      aria-hidden
      className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]"
    />
  );
}

/**
 * One item rendered for the collapsed rail. Neutral by design: no active
 * fills, accent CTAs, or badges — only the gated-item lock from RailButton.
 */
function RailItem({ item }: { item: ConsoleItem }) {
  // Ref to an optional animated icon (declared before any early return to keep
  // hook order stable); a rail click replays the animation.
  const animRef = useRef<AnimatedIconHandle>(null);

  if (item.kind === "custom") {
    return item.railTip ? (
      <RailTip label={item.label}>{item.rail}</RailTip>
    ) : (
      <>{item.rail}</>
    );
  }

  if (item.kind === "link") {
    const { Icon } = item;
    return (
      <RailTip label={item.railLabel ?? item.label}>
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${item.label} (opens in a new tab)`}
          className="relative flex h-9 w-9 items-center justify-center border-2 border-edge bg-white/5 text-ink transition-all hover:bg-white/10"
        >
          <Icon size={15} />
        </a>
      </RailTip>
    );
  }

  // action — neutral in the collapsed rail except for an "open panel" dot, so
  // you can still tell which drawer is open while the console is collapsed.
  const { Icon } = item;
  return (
    <RailButton
      open={item.open}
      onClick={() => {
        animRef.current?.startAnimation();
        item.onClick();
      }}
      label={item.railLabel ?? item.label}
      locked={item.locked}
    >
      {item.animated ? (
        <item.animated ref={animRef} size={15} animateOnHover />
      ) : (
        <Icon size={15} />
      )}
    </RailButton>
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

// The Orbit button with a small embedded eye toggle on its right edge that
// shows/hides the viewer's own ship. The toggle only appears while Orbit is
// active, since the self ship is only drawn in Orbit view.
function OrbitControl({
  onOrbit,
  active,
}: {
  onOrbit: () => void;
  active: boolean;
}) {
  const { showSelfShip, setShowSelfShip } = useAppState();
  return (
    <div className="flex w-full">
      <button
        type="button"
        onClick={onOrbit}
        aria-pressed={active}
        title="Orbit"
        style={active ? { background: "var(--accent)" } : undefined}
        className={`flex flex-1 items-center gap-2 border-2 px-3 py-2 text-[11px] font-display uppercase tracking-wider transition-all ${
          active
            ? "border-r-0 border-edge text-accent-foreground"
            : "border-edge bg-white/5 text-ink hover:bg-white/10"
        }`}
      >
        <Orbit size={14} />
        Orbit
      </button>
      {active && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setShowSelfShip(!showSelfShip)}
              aria-pressed={!showSelfShip}
              aria-label={showSelfShip ? "Hide your ship" : "Show your ship"}
              style={{ background: "var(--accent)" }}
              className="flex items-center justify-center border-2 border-l border-edge px-2 text-accent-foreground transition-all hover:brightness-110"
            >
              {showSelfShip ? (
                <Eye size={13} />
              ) : (
                <EyeOff size={13} className="opacity-60" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="left"
            sideOffset={8}
            className="rounded-none border-2 border-edge bg-black/90 px-2 py-1 font-display text-[10px] uppercase tracking-wider text-ink"
          >
            {showSelfShip ? "Hide your ship" : "Show your ship"}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function ConsoleButton({
  active = false,
  open = false,
  onClick,
  icon,
  label,
  locked = false,
}: {
  active?: boolean;
  open?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  locked?: boolean;
}) {
  // `active` (a persistent mode) wins the solid fill; an `open` panel that isn't
  // an active mode gets a lighter accent outline + dot so the two read apart.
  const openOnly = open && !active;
  return (
    <button
      onClick={onClick}
      aria-pressed={active || open}
      title={locked ? `${label} — unlock to explore` : label}
      style={active ? { background: "var(--accent)" } : undefined}
      className={`relative flex w-full items-center gap-2 border-2 px-3 py-2 text-[11px] font-display uppercase tracking-wider transition-all ${
        active
          ? "border-edge text-accent-foreground"
          : openOnly
            ? "border-accent bg-accent/10 text-ink hover:bg-accent/20"
            : "border-edge bg-white/5 text-ink hover:bg-white/10"
      }`}
    >
      {openOnly && <OpenDot />}
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
function RailTip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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
  open = false,
  onClick,
  label,
  children,
  locked = false,
}: {
  active?: boolean;
  open?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  locked?: boolean;
}) {
  const tip = locked ? `${label} — unlock to explore` : label;
  const openOnly = open && !active;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-pressed={active || open}
          aria-label={tip}
          style={active ? { background: "var(--accent)" } : undefined}
          className={`relative flex h-9 w-9 items-center justify-center border-2 transition-all ${
            active
              ? "border-edge text-accent-foreground"
              : openOnly
                ? "border-accent bg-accent/10 text-ink hover:bg-accent/20"
                : "border-edge bg-white/5 text-ink hover:bg-white/10"
          }`}
        >
          {openOnly && <OpenDot />}
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
