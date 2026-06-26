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
    version: "3.16.0",
    codename: "Hangar",
    date: "2026-06-26",
    summary:
      "Sign in to save your ship — your chosen craft now follows you across devices and every other cosmonaut sees it live.",
    changes: [
      "Signed-in explorers can now save their ship: it's remembered on your account and follows you to every device.",
      "Other cosmonauts now see your exact ship in real time, not a generic one — shuffle to a look you like, then Save.",
      "New 'Your ship' panel in the account area with a live look preview, a Shuffle button, and a Save button.",
      "The Show ship / Hide ship toggle moved onto the Orbit button itself, so ship controls live together.",
    ],
  },
  {
    version: "3.15.0",
    codename: "Liveries",
    date: "2026-06-26",
    summary:
      "Every cosmonaut now flies a distinct ship, and your own chase craft turns near-invisible with a one-tap show/hide toggle.",
    changes: [
      "Each cosmonaut's ship now has its own look — hull tint, engine glow, nose running-light, and size all vary per explorer — so the galaxy reads as a real crowd of distinct craft.",
      "Your own ship in Orbit view is now barely-there glass, so it never blocks the galaxy or UI behind it.",
      "New 'Show ship / Hide ship' toggle under Navigate lets you hide your own ship in Orbit view entirely; the choice is remembered next visit.",
      "Your ship's look now stays the same across visits (saved in your browser), laying the groundwork for saving and customizing it once you sign in.",
    ],
  },
  {
    version: "3.14.0",
    codename: "Dropship",
    date: "2026-06-26",
    summary:
      "Cosmonauts now fly a real low-poly spaceship — smaller and sharper — and signing in from an embedded preview is no longer a maze.",
    changes: [
      "Every ship (yours and other cosmonauts') is now an actual low-poly spaceship model instead of a hand-built cone, and rides noticeably smaller in the galaxy.",
      "Signing in from an embedded preview now offers a 'Continue in a new window' handoff, so the security check and Google/GitHub sign-in finish together in one place.",
    ],
  },
  {
    version: "3.13.0",
    codename: "Squadron",
    date: "2026-06-26",
    summary:
      "Other explorers now appear as little ships flying the galaxy with you — and you pilot your own.",
    changes: [
      "Fellow cosmonauts are now rendered as small low-poly ships that point the way they're flying, instead of faint glowing wisps.",
      "New arrivals get a short grace period before others fade in, with a gentle 'More cosmonauts arriving' notice, so you can find your bearings first.",
      "In orbit view your own ship now appears as a small glowing sprite among the galaxy — like the other cosmonauts — banking gently as you orbit.",
    ],
  },
  {
    version: "3.12.0",
    codename: "Tilted Rings",
    date: "2026-06-25",
    summary:
      "Every planet now spins on its own tilted axis, and ringed worlds are no longer identical twins.",
    changes: [
      "Each planet gets its own axial tilt, spin direction, speed, and starting angle, so same-type worlds no longer rotate in lockstep like clones.",
      "Ringed planets now vary their ring width, tilt, roll, tint, and opacity, so no two ringed worlds look exactly alike.",
    ],
  },
  {
    version: "3.11.0",
    codename: "Spectral Worlds",
    date: "2026-06-24",
    summary:
      "Planets now come in many more colours and kinds — molten, frozen, verdant, ocean, and exotic gas giants.",
    changes: [
      "Greatly widened planet variety: alongside the real solar-system worlds, papers can now appear as molten lava worlds with glowing magma veins, frozen ice worlds, verdant Earth-likes, amber deserts, turquoise oceans, carbon rock worlds, and violet, rose, and emerald gas giants.",
      "The galaxy reads with far richer colour instead of mostly red, off-white, and blue.",
    ],
  },
  {
    version: "3.10.2",
    codename: "Open Hatch",
    date: "2026-06-24",
    summary:
      "The membership panel now explains why subscribing creates an account.",
    changes: [
      "Added a short note next to Subscribe explaining that membership creates a free account so your unlocks stay tied to you across devices and billing stays self-serve.",
      "Toned down the Sponsor and Personalize buttons in the console: instead of a full purple highlight, they now carry a subtle inline tag marking them as paid.",
      "Simplified the galaxy loading screen — the cosmograph mark now fills up on its own, without a separate progress bar or percentage.",
    ],
  },
  {
    version: "3.10.1",
    codename: "Steady Frame",
    date: "2026-06-23",
    summary:
      "The shareable screenshot now renders reliably and sits more compactly.",
    changes: [
      "Fixed the shareable screenshot sometimes loading blank — the card now waits for the galaxy to actually render before capturing.",
      "Trimmed the membership panel's height so it fits the screen more comfortably.",
      "Each membership perk now has its own icon matching the feature, with an AI star for Ask Cosmos.",
    ],
  },
  {
    version: "3.10.0",
    codename: "Bird's Eye",
    date: "2026-06-23",
    summary:
      "Shareable screenshots now capture the galaxy from a top-down view.",
    changes: [
      "The shareable screenshot now shows your galaxy from a top-down vantage, framing the whole disk instead of the last camera angle.",
    ],
  },
  {
    version: "3.9.0",
    codename: "Clear Skies",
    date: "2026-06-23",
    summary:
      "Console polish, clearer Subscribe + Sponsor actions, and steadier sharing.",
    changes: [
      "Tightened the spacing under the Mission Control header so Platform sits up closer to the top.",
      "Personalize now shows an Upgrade badge instead of a Premium one, with the helper line moved below the button.",
      "The console's Sign In action is now a clear Subscribe button — subscribing signs you in along the way.",
      "Renamed Donate to Sponsor, with a heart on the left and the GitHub mark on the right.",
      "Shareable screenshots are more reliable — the card always renders, falling back to the branded stats card if the live view can't be captured.",
      "The preview screenshot now lives inside the membership panel instead of behind it, with a single Copy-image-to-clipboard action.",
      "Refreshed the membership panel — accent Subscribe button, clearer $7/year preview copy, and an updated feature list.",
      "Clearer messaging when OpenAlex is rate-limiting researcher search.",
    ],
  },
  {
    version: "3.8.0",
    codename: "Celestial Globe",
    date: "2026-06-23",
    summary: "A new logo — a celestial globe with an AI star at its core.",
    changes: [
      "New brand mark: a lat/long graticule globe with a generated-star spark at the center, now in the header, the browser tab, and the sign-in screen.",
    ],
  },
  {
    version: "3.7.0",
    codename: "Control Tower",
    date: "2026-06-23",
    summary: "Mission Control gets a cleaner layout — Platform sits up top.",
    changes: [
      "Reorganized the console: a single Platform section now sits at the top with Info, Sign In, Changelog, Donate, Ask, and Personalize all in one place.",
      "Renamed the old Customize section to Personalize — a highlighted premium action to choose a scientist for your own cosmograph.",
    ],
  },
  {
    version: "3.6.0",
    codename: "Postcard",
    date: "2026-06-23",
    summary:
      "Custom galaxies open as a shareable postcard — membership drops to $7.",
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
    summary: "Membership goes yearly — and Ask Cosmos comes aboard.",
    changes: [
      "Full access is now a $10/year membership: fly, tour, and deep-dive any scientist you search, with every new feature included.",
      "Ask Cosmos headlines membership — ask questions about any researcher's work, answered from their galaxy.",
      "Fellow explorers are now 'cosmonauts' — watch the live headcount streaming the stars with you.",
      'Every voyage now ends with a personal welcome: "Welcome to the [scientist] cosmos."',
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
