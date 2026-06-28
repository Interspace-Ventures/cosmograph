import { Telescope, Orbit, Share2, Sparkles, Rocket, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// The membership perks, shared by the Paywall modal, the ScreenshotGate, the
// Personalize drawer, and the top deal banner. Each perk carries an icon that
// reflects the feature itself — exploration, orbits, sharing, the AI "star"
// (Sparkles), fly-through, and shipping updates.
export const PERKS: { icon: LucideIcon; text: string }[] = [
  {
    icon: Telescope,
    text: "Explore 3 researchers' full galaxies on your membership — add more anytime for $1/year each",
  },
  {
    icon: Orbit,
    text: "Rich, detailed, fully explorable galaxy view with every sun and planet reflecting the researcher's body of work",
  },
  {
    icon: Share2,
    text: "A dedicated, shareable URL for each researcher's galaxy with its own guided tour",
  },
  {
    icon: Sparkles,
    text: "Ask Cosmos: ask questions about a researcher's work and watch matching papers light up",
  },
  {
    icon: Rocket,
    text: "Interactive first-person fly-through of any unlocked galaxy",
  },
  {
    icon: Zap,
    text: "Every new feature and product update as it ships, instantly",
  },
];
