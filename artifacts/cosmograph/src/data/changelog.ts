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
    version: "3.37.0",
    codename: "Opening Credits",
    date: "2026-07-05",
    summary:
      "Watch the launch trailer straight from the title screen.",
    changes: [
      "Added a \"Watch the trailer\" button on the opening title screen, right below \"Ad Astra\" — a quick flight through the galaxy before you dive in yourself.",
    ],
  },
  {
    version: "3.36.1",
    codename: "Steady Hand",
    date: "2026-07-05",
    summary:
      "The guided tour is calmer, clearer, and actually shows off Ask Cosmo.",
    changes: [
      "The \"Two ways to travel\" stop now demonstrates both modes in one shot — starting in the overhead Orbit view, then dropping down into a first-person Fly glide so you can watch the switch happen.",
      "Steadied the tour camera: instead of drifting in a full circle, it now gently sways to show depth while keeping each subject centered and in focus.",
      "The \"Ask Cosmo\" stop now pulls up a live preview of the Ask panel — showing the question and Cosmo's answer — while the matching papers light up behind it.",
      "Tidied the tour card: the page dots now sit below the text instead of crowding it.",
    ],
  },
  {
    version: "3.36.0",
    codename: "Grand Tour",
    date: "2026-07-05",
    summary:
      "The guided tour now shows off flying, rotating angles, and Ask Cosmo.",
    changes: [
      "The tour now dips into Fly mode — dropping into the plane for a first-person glide through the brightest field — so you can see both ways to travel, not just the planetarium Orbit view.",
      "Each stop now slowly sweeps its camera angle, so the galaxy's real 3D depth reads instead of a flat straight-on shot.",
      "New \"Ask Cosmo\" stop: a real plain-English question runs live and the matching papers light up while the rest fade — a taste of the query panel before you try it yourself.",
    ],
  },
  {
    version: "3.35.0",
    codename: "Second Pass",
    date: "2026-07-04",
    summary:
      "Replay the opening flight any time, and the tour card clears the controls.",
    changes: [
      "Added a \"Replay intro\" button in Info → About, so you can run the opening title sequence again — handy for showing someone the galaxy from the start.",
      "The guided-tour card no longer tucks its bottom edge under the cockpit bar on desktop; it now floats cleanly above the controls.",
    ],
  },
  {
    version: "3.34.0",
    codename: "Event Horizon",
    date: "2026-07-04",
    summary:
      "The galaxy stays smooth even for the most prolific scientists alive.",
    changes: [
      "For an enormous body of work (think thousands of papers), the galaxy now renders the most-cited papers as planets and keeps the rest counted in every stat, domain, and answer — so the view stays buttery on any machine instead of drowning in planets.",
      "Every realistic scientist is unchanged: if the corpus fits, every single paper still gets its own planet.",
    ],
  },
  {
    version: "3.33.0",
    codename: "Station Keeping",
    date: "2026-07-03",
    summary:
      "The paper card slims down, and your ship now holds formation with a selected planet.",
    changes: [
      "Co-authors in the paper card now fit on a single line — the rest collapse into a \"+N\" chip you can tap to see everyone.",
      "The paper card no longer hides under the header on desktop.",
      "Selecting a planet in Fly mode engages a tracking cam: the ship smoothly holds formation with the planet as it orbits, so you can read the card without chasing it.",
      "Touch the controls (keys or mouse-look) and the ship hands the stick back to you without snapping the view; click the planet again to re-engage tracking.",
    ],
  },
  {
    version: "3.32.0",
    codename: "Slipstream",
    date: "2026-07-02",
    summary: "A faster galaxy — the same view, drawn with a fraction of the work.",
    changes: [
      "Merged every solar system's orbit rings into a single draw call each (they used to be one per paper — hundreds per frame).",
      "Orbit rings no longer respond to the mouse, so moving the cursor doesn't hit-test hundreds of invisible lines anymore.",
      "Planets, clouds, and moons use leaner sphere meshes — visually identical at galaxy scale, far fewer vertices per frame.",
      "The galaxy now adapts its render resolution to your machine: if the frame rate dips, it quietly drops sharpness a notch and climbs back when things recover.",
      "Asks dual-GPU laptops for the fast graphics card, and stopped paying for antialiasing twice.",
    ],
  },
  {
    version: "3.31.0",
    codename: "Target Lock",
    date: "2026-07-02",
    summary: "Fly mode gets a real targeting HUD, search finds the right scientist, and you can hop back to the last galaxy.",
    changes: [
      "Planets and suns are now clickable while flying — a pulsing corner-bracket reticle locks onto your target and tracks it through the canopy, with its name underneath.",
      "Dragging to look around no longer counts as a click, so steering the ship won't select planets or drop your target lock.",
      "Personalize search now matches on the scientist's name only — searching \"Albert Einstein\" no longer surfaces researchers who merely work at an institute named after him.",
      "After exploring a new scientist, a \"Return to …\" button in Personalize jumps you straight back to the previous galaxy — instantly, no re-download.",
    ],
  },
  {
    version: "3.30.0",
    codename: "Sliding Hatch",
    date: "2026-07-02",
    summary: "Signing in stays in the galaxy, and the Tour sits with the other ways to fly.",
    changes: [
      "Sign In / Sign Up now rise as a dismissible cockpit panel — like Info, Ask, and Personalize — instead of taking over the whole screen.",
      "The auth form blends straight into the panel (no box-in-a-box), and the copy is on-theme: \"Become a cosmonaut\" / \"Welcome back, cosmonaut\".",
      "Moved the Tour button next to the Orbit/Fly switch, grouping all the ways to explore the galaxy together.",
    ],
  },
  {
    version: "3.29.0",
    codename: "Afterburner",
    date: "2026-07-01",
    summary: "Real rocket fire out the back — the engines now burn like a true spaceship.",
    changes: [
      "Replaced the soft blue engine orb with a proper fiery exhaust: a white-hot core inside an orange plume.",
      "The flame flickers like live combustion and stretches longer the harder you throttle.",
      "Kept it tight so it feels like a spaceship without hogging the screen.",
    ],
  },
  {
    version: "3.28.1",
    codename: "Welcome Back",
    date: "2026-06-30",
    summary: "The cockpit now remembers returning pilots and their usual login.",
    changes: [
      "First-time visitors see Sign Up; if you've signed in before on this device, it greets you with Sign In instead.",
      "If you last logged in with a service like Google or GitHub, the button now names it — one click back in.",
    ],
  },
  {
    version: "3.28.0",
    codename: "Hangar Bay",
    date: "2026-06-30",
    summary: "Sign in to claim a profile and fly a ship that's truly yours.",
    changes: [
      "Added Sign In / Sign Up in the cockpit, and a signed-in account panel showing your member status and ship.",
      "New ship hangar: choose a hull type — the free Scout, or the premium Fighter, Hauler, and Interceptor — each with its own distinctive silhouette.",
      "Members get three ship types included; anyone can unlock an extra type for a one-time $1. Colors stay free on any ship you own.",
      "Other cosmonauts now see the exact ship type you're flying.",
    ],
  },
  {
    version: "3.27.1",
    codename: "Tight Burn",
    date: "2026-06-30",
    summary: "Tuned the engine thrusters down to a tighter, more focused burn.",
    changes: [
      "Made the rear thruster flare smaller and more concentrated so it reads like a real space engine nozzle instead of a soft halo.",
    ],
  },
  {
    version: "3.27.0",
    codename: "True North",
    date: "2026-06-30",
    summary: "Fly controls now track the ship 1:1, and engines glow when you move.",
    changes: [
      "Fixed Fly steering so the ship pitches and turns to match your controls — pressing up now tilts the nose up instead of rolling sideways.",
      "Replaced the nose beacon with twin rear thrusters that glow brighter the faster you fly.",
    ],
  },
  {
    version: "3.26.1",
    codename: "Clean Hull",
    date: "2026-06-30",
    summary: "Dropped the glowing aura around your ship in Fly mode.",
    changes: [
      "Your ship in Fly mode no longer has a glowing aura around it — just the clean hull.",
    ],
  },
  {
    version: "3.26.0",
    codename: "Snug Fit",
    date: "2026-06-30",
    summary:
      "The rich panels (Info, Ask Cosmo, Personalize) now match the width of the cockpit navbar exactly.",
    changes: [
      "The Info, Ask Cosmo, and Personalize panels are now always exactly as wide as the cockpit bar below them.",
    ],
  },
  {
    version: "3.25.1",
    codename: "Header Crew",
    date: "2026-06-30",
    summary:
      "The header buttons are now slimmer and reordered — Source, Sponsor, Share.",
    changes: [
      "Source (the GitHub repo), Sponsor, and Share buttons in the header are now smaller and reordered.",
    ],
  },
  {
    version: "3.25.0",
    codename: "Header Crew",
    date: "2026-06-30",
    summary:
      "The Sponsor, GitHub, and Share buttons moved up beside the Cosmograph title, leaving the cockpit for the controls you fly with.",
    changes: [
      "Sponsor, GitHub, and Share now sit just to the right of the Cosmograph header instead of in the cockpit.",
      "The cockpit dashboard is now focused purely on in-galaxy controls.",
    ],
  },
  {
    version: "3.24.0",
    codename: "Chase the Stars",
    date: "2026-06-30",
    summary:
      "Fly mode is now a third-person chase — you can see and steer your own ship — the cockpit buttons gained labels, and the AI is now named Cosmo.",
    changes: [
      "Fly mode switched from first-person to a third-person chase camera, so you can see your own ship as you weave through the galaxy (nicer ships ahead).",
      "Your ship no longer appears in Orbit view — it's reserved for Fly.",
      "Every cockpit button now shows its name beside the icon, so it's clear at a glance.",
      "The cockpit now sits a little higher, lifted clear of the footer credits.",
      'The "Ask Cosmos" assistant is now simply "Cosmo".',
    ],
  },
  {
    version: "3.23.0",
    codename: "Cockpit Dashboard",
    date: "2026-06-30",
    summary:
      "Every control now lives in one clean cockpit dashboard along the bottom of the screen, and the rich panels rise up from it — freeing the galaxy to fill the whole view.",
    changes: [
      "The Mission Control side rail and the top-right Sponsor / GitHub / Share buttons are gone, replaced by a single bottom dashboard that holds every control.",
      "Info, Ask Cosmos, and Personalize now rise as panels from the dashboard, centered above the bar on both desktop and mobile.",
      "With the side rail gone, the galaxy now fills the entire screen.",
      "Your account, ship save, and shuffle controls moved into the top of the Personalize panel.",
    ],
  },
  {
    version: "3.22.0",
    codename: "Notification Deck",
    date: "2026-06-28",
    summary:
      "Tips and offers now arrive as one tidy notification banner that gently slides the view down instead of floating over the galaxy, and the Orbit/Fly switch moved to the bottom of the console.",
    changes: [
      "Flight-control tips and the membership offer now share a single slim banner up top that eases the view down to make room — no more pop-ups floating over the stars.",
      "When there's more than one thing to mention, the banner quietly cycles between them.",
      "The Orbit / Fly view switch now lives at the bottom of the console, set apart from the other controls.",
    ],
  },
  {
    version: "3.21.0",
    codename: "Signal Boost",
    date: "2026-06-28",
    summary:
      "Gentle, dismissable nudges: a slim top banner for the $7/year membership deal, and a one-time prompt to support the project once you've settled in.",
    changes: [
      "A slim banner up top highlights the limited-time $7/year membership — dismiss it once and it stays gone.",
      "The banner's \"See what's included\" opens the Personalize panel, which now lists every membership benefit.",
      "After you've spent a little time exploring, a small unobtrusive card invites you to sponsor, star the repo, or spread the word — shown only once.",
    ],
  },
  {
    version: "3.20.0",
    codename: "Clean Console",
    date: "2026-06-28",
    summary:
      "A tidier cockpit: fewer buttons, panels that open one at a time, and quick Share and GitHub controls pinned to the top-right corner.",
    changes: [
      "The flight log moved inside the Info panel as a tab, so it's one less button on the console.",
      "Orbit and Fly are now a single toggle instead of two separate buttons, and the old Re-Intro button is gone.",
      "Detail panels now open one at a time at the same width — opening one closes the others so they never stack up.",
      "Share and the GitHub link now sit as quick buttons in the top-right corner instead of being buried in the console.",
      "On phones the bottom console now shows a short text label under each icon, so it's clear what every button does.",
    ],
  },
  {
    version: "3.19.0",
    codename: "Thumb Reach",
    date: "2026-06-28",
    summary:
      "On phones the console now lives along the bottom of the screen, so the galaxy gets the full width and the controls sit right under your thumb.",
    changes: [
      "On phones the Mission Control console moved from the right edge to the bottom of the screen — the galaxy now uses the full width.",
      "Expanding the console on a phone slides a panel up from the bottom instead of in from the side.",
      "Detail panels now span the full width above the bottom console so they're easier to read.",
    ],
  },
  {
    version: "3.18.0",
    codename: "Pocket Cosmos",
    date: "2026-06-28",
    summary:
      "A big pass on the phone experience — clearer text, a console that stays out of the way, and detail panels that fit the screen.",
    changes: [
      "Paper and domain text is now crisp and high-contrast instead of a soft glow that read as blurry on phones.",
      "On phones the console now starts as a slim rail instead of the full panel, so it no longer covers the galaxy.",
      "Detail panels no longer slide under the console and are sized to fit a phone screen.",
      "Added a subtle backdrop behind the title and stats so they stay readable over bright stars.",
    ],
  },
  {
    version: "3.17.0",
    codename: "Wayfinder",
    date: "2026-06-27",
    summary:
      "Sign in and you get your own invite link — bring fellow explorers into the galaxy and we'll keep count.",
    changes: [
      "Every signed-in explorer now has a personal invite link, found in the Share panel — copy it and send it to anyone.",
      "When someone signs up through your link for the first time, they're counted as your referral, permanently.",
      "Not signed in? The Share panel now invites you to create a free account so you can get your own link too.",
    ],
  },
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
