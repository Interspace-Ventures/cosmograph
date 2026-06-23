export interface ChangelogEntry {
  /** Semver string, e.g. "1.3.0". */
  version: string;
  /** A spacey codename for the release. */
  codename: string;
  /** ISO date (YYYY-MM-DD) the release went out. */
  date: string;
  /** One-line mission summary. */
  summary: string;
  /** The log of what shifted in the cosmos this release. */
  changes: string[];
}

/**
 * The flight log. Newest release first — the head of this list is the version
 * shown across the UI (see CURRENT_VERSION below), so prepend new entries here.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "3.7.0",
    codename: "Control Tower",
    date: "2026-06-23",
    summary: "Mission Control gets a cleaner layout — Platform sits up top.",
    changes: [
      "Reorganized the console: a single Platform section now sits at the top with Info, Sign In, Changelog, Donate, and Personalize all in one place.",
      "Renamed the old Customize section to Personalize — 'Choose scientist' to open up someone new.",
    ],
  },
  {
    version: "3.6.0",
    codename: "Postcard",
    date: "2026-06-23",
    summary: "Custom galaxies open as a shareable postcard — membership drops to $7.",
    changes: [
      "Searching a scientist now opens their cosmograph as a full-screen shareable screenshot with one tap to copy, download, or share it.",
      "Membership is now $7/year — subscribe right from the screenshot to unlock the full interactive galaxy for anyone you search.",
      "The home scientist stays free and fully interactive, no account needed.",
    ],
  },
  {
    version: "3.5.0",
    codename: "Make It Yours",
    date: "2026-06-23",
    summary: "Customize gets its own premium tab in the console.",
    changes: [
      "Pulled the scientist search out of the Info drawer into a dedicated Customize tab, flagged with a Premium badge so it's clear deep exploration of a custom scientist is a paid unlock.",
      "Refreshed the Ask panel's starter prompts into clickable chips.",
    ],
  },
  {
    version: "3.4.0",
    codename: "Mission Control",
    date: "2026-06-23",
    summary: "A new Platform bay in Mission Control.",
    changes: [
      "Added a Platform section to Mission Control with Customize, Changelog, and Donate in one place.",
      "Customize now has its own panel — search for any scientist and the galaxy rebuilds around their work (moved out of the Info drawer).",
    ],
  },
  {
    version: "3.3.0",
    codename: "Just Ask",
    date: "2026-06-23",
    summary: "One input, zero modes — Ask reads your intent.",
    changes: [
      "Dropped the Ask/Bug/Feature toggle: just type. Asking about the work runs a search; saying something's broken or wished-for files it with the team automatically.",
      "Tidied the console — Info and Sign in now sit right at the top, no Profile drawer to open.",
    ],
  },
  {
    version: "3.2.0",
    codename: "One Console",
    date: "2026-06-23",
    summary: "Ask does it all — and feedback flies through the same chat.",
    changes: [
      "Retired the separate Find box — Ask now handles jumping to papers and domains alongside questions.",
      "Report a bug or request a feature right inside the Ask chat: switch modes, type, and it's filed straight to the team.",
    ],
  },
  {
    version: "3.1.0",
    codename: "Orbital Pass",
    date: "2026-06-23",
    summary: "Membership goes yearly — and Ask Cosmo comes aboard.",
    changes: [
      "Full access is now a $10/year membership: fly, tour, and deep-dive any scientist you search, with every new feature included.",
      "Ask Cosmo headlines membership — ask questions about any researcher's work, answered from their galaxy.",
      "Fellow explorers are now 'cosmonauts' — watch the live headcount streaming the stars with you.",
      "Every voyage now ends with a personal welcome: \"Welcome to the [scientist] cosmos.\"",
    ],
  },
  {
    version: "3.0.0",
    codename: "Cosmograph",
    date: "2026-06-22",
    summary: "A new name for the voyage — Galactic is now Cosmograph.",
    changes: [
      "New identity: the app is now Cosmograph, charting any scientist's life in science at cosmograph.space.",
      "The wordmark, share cards, footer, and live presence all fly the Cosmograph flag from bridge to bottom.",
    ],
  },
  {
    version: "2.1.0",
    codename: "Voyager's Pass",
    date: "2026-06-22",
    summary: "Chart any sky for free; unlock the helm to fly it.",
    changes: [
      "Accounts have landed: sign in to carry your unlock across every visit.",
      "Every searched scientist opens as a free preview — full stats, summary, and a shareable card, no account needed.",
      "A one-time $10 pass unlocks deep exploration — fly, guided tours, and rich paper detail — for any researcher you search, forever.",
      "The home scientist stays wide open: no sign-in, no paywall, the whole galaxy free to roam.",
      "Sponsor Cosmograph on GitHub right from the unlock panel to keep the lights on.",
    ],
  },
  {
    version: "2.0.0",
    codename: "Open Universe",
    date: "2026-06-21",
    summary: "The galaxy opens to every scientist in the sky.",
    changes: [
      "Explore anyone: search a researcher by name and the whole galaxy re-forms around their life's work, charted live from OpenAlex.",
      "Share this Cosmograph: capture your current view as a stat-laden card and copy it straight to the clipboard — no downloads, no detours.",
      "Bridge refit: Replay and Tour moved up beside Orbit and Fly, while Share and the GitHub beacon dropped into the command bar.",
      "A new footer beacon spells out what Cosmograph is for every first-time arrival.",
    ],
  },
  {
    version: "1.3.0",
    codename: "Bridge Console",
    date: "2026-06-20",
    summary: "Hauled the helm up to the bridge and opened the ship's log.",
    changes: [
      "Orbit and Fly thrusters relocated to the top deck, docked right beside the Info port.",
      "The Info beacon flies its name again — no more guessing at the lone glyph.",
      "Cracked open this flight log so you can trace every jump the ship has made.",
    ],
  },
  {
    version: "1.2.0",
    codename: "Star Charts",
    date: "2026-06-20",
    summary: "Drew up the navigation charts for every pilot aboard.",
    changes: [
      "Added a navigation primer for Orbit and Fly modes inside the Info port.",
      "Retired the manual tilt lever — a right-drag now banks the whole sky for you.",
    ],
  },
  {
    version: "1.1.0",
    codename: "Deep Space Signals",
    date: "2026-06-20",
    summary: "Tuned the antenna and caught signals from fellow travelers.",
    changes: [
      "Live presence: faint wisps now mark other cosmographers drifting through the same stars.",
      "A headcount beacon shows how many explorers are streaming through the galaxy right now.",
      "Pulled GitHub starlight into the footer so you can see the constellation grow.",
    ],
  },
  {
    version: "1.0.0",
    codename: "First Light",
    date: "2026-06-15",
    summary: "The galaxy ignites.",
    changes: [
      "Every research domain becomes a sun, every paper a planet, every co-author a moon.",
      "Two ways to roam: a god's-eye Orbit and a first-person Fly-through.",
      "A guided tour and a cinematic warp-in greet every new arrival.",
    ],
  },
];

/** The live version — always the newest entry in the flight log. */
export const CURRENT_VERSION = CHANGELOG[0].version;
