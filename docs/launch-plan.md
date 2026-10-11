# Cosmograph launch plan (decided October 2026)

This is the owner-approved plan for taking Cosmograph from a friends-and-family
build to a public launch. It records decisions made in planning sessions that
are not written down elsewhere. Change it in the same PR as any work that
changes the plan.

## Product

- **Exploring is free.** Anyone can open and explore any researcher's galaxy.
  Do not paywall viewing.
- **Membership is a gift product.** You pay to make a galaxy *theirs*: their
  name on it, a personal `cosmograph.space/<name>` link, a sealed-envelope
  reveal, a guided walkthrough of their journey, data corrections, unwatermarked
  share cards, every ship, extra scientists, and every new release.
- **Pricing:** $9.99 / year (auto-renews) or $29.99 lifetime ("for as long as
  Cosmograph exists", never "about 3 years"). Ships are included in membership
  (no per-ship sales). The old $7/yr membership, $1/yr researcher add-on, and $1
  ship skins are retired.
- **No custom domains.** Members get a readable slug on cosmograph.space, never
  random ids. We don't buy or attach domains for people.
- **Branding stays.** There is no "remove branding" perk. The member perk is
  share cards without a watermark.
- **When an annual plan lapses:** the published link and everything made stays
  live but frozen. No edits, watermark returns on share cards, ships revert to
  the default, no new releases. Lifetime keeps everything.
- **Free tier:** explore any galaxy (orbit, tour, paper details), a few Ask
  Cosmo questions a day, watermarked share cards, the default ship. The free
  tier must be enjoyable but must not substitute for membership.
- **Virality is the top growth lever.** Sharing must be one tap and visible on
  the dock, on every paper card, and at the end of the tour. Every shared link
  opens straight into that galaxy and carries the referral code.

## Launch scope

**Day 1 (part of the launch, not drops):** guided tour, share cards, Ask Cosmo,
referral links, the paid gift core above, payments working end to end, and
security hardening.

**Weekly drops after launch:** live presence, ships, fly mode, extra scientists
(a lab or family in one galaxy), new surface/effect packs. After about 13 weeks
move to roughly every two weeks with cheap, visible drops (ship types, surface
packs, walkthrough themes, seasonal envelopes) so annual members see something
new all year.

## Art direction: the cube galaxy

The photoreal look is retired (it read as uncanny valley). The new direction is
**isometric and cuboidal**, Structured Liquidity / neo-brutalist, with a
Star Wars *feel* but no Star Wars IP. The playable reference is
[`docs/spikes/cube-galaxy/`](spikes/cube-galaxy/README.md). Rules from owner
feedback:

- Planets are **perfect N×N×N voxel cubes**. N runs 1 to 9 continuously from
  citations (`1 + round(8 * (log1p(c) / log1p(max)) ^ 1.6)`), so 175 and 275
  citations look different.
- Distance from the sun = how central the paper is to the field.
- **No platforms.** Systems float freely in a 3D volume; full camera freedom
  including vertical. Iso/Top are presets, not constraints.
- Nothing moves in sync: each planet has its own tumble axis/rate; some do
  Rampart-style quarter-turn rolls; each orbit lane has its own tilt.
- Each field has its own surface texture (bands, caps, craters, continents...).
- Suns glow like the original site's: white-hot core, corona shells, radial
  glow sprite, bloom that eases off up close so cubes never white out.
- Deep starfield so zooming out never runs out of stars.
- Purple `#a388ee` is reserved for selection and HUD; field colors avoid it.
- Restore the live site's broad-view chrome (header, stat strip, footer
  credit, dock: Sign up / Tour / Orbit / Fly / Info / Ask / Gift). Unbuilt
  features show greyed out with a SOON badge. Info has About / Guide /
  Changelog.

**IP line:** no Star Wars names, ship or walker silhouettes, sounds, or fonts.
SWAPI is fan-compiled Lucasfilm IP and is placeholder-only. CC0 models (for
example Quaternius) are fine.

## Platform moves

| From | To |
|---|---|
| Clerk | Exo Key (Exo is the only sign-in; apps trust Exo JWTs) |
| Postgres + Drizzle | Convex |
| Ask Cosmo calling OpenAI directly | Exo AI router with a tenant monthly cap |
| OpenAlex fetched from the browser | Server-side fetch with per-author cache and a daily budget |
| One Railway app at cosmograph.space | Website on Construct at the apex (embedded live galaxy), app at `app.cosmograph.space` |

Presence (WebSocket) and the Stripe webhook stay on the always-on Railway
service; presence must not move to Convex (cost at ~10 updates/sec/visitor).

DNS: cosmograph.space currently uses Spaceship URL forwarding. Set real
records at Spaceship **first**, verify, then change Railway domains, or the
site goes down.

## Cost and abuse rules (owner directive)

"I don't want to be in a position where either because we didn't price things
correctly or because we didn't secure things correctly, people are taking
advantage and costing me a ton of money." Every endpoint that costs money needs
all of: allowlisted Origin, per-minute limit, per-client daily allowance, a
global daily breaker that fails closed (503), bounded input on every
prompt-bound field, and capped output tokens. Never expose an open proxy (AI or
OpenAlex).

Unit economics used for pricing: Stripe keeps about $9.40 of $9.99 and about
$28.82 of $29.99. Ask Cosmo costs about $0.0015 per turn (worst ~$0.003);
members get about 100 questions a month. First visits cost about $0.00025 in
bandwidth.

## Status (see the handoff note in the PR history for detail)

- Merged to staging: PR #9 (repo hygiene, dep pruning, advisories), PR #10
  (Ask Cosmo spend guards).
- Open: PR #11 security hardening (needs Secure review).
- In progress: billing rebuild on `agent/launch-billing` (server done and
  typechecked, end-to-end test written but not yet run, client UI and OpenAPI
  not yet updated).
- Not started: Exo Key + Convex migration, cube engine in the real app, gift
  features, Construct site, DNS.
