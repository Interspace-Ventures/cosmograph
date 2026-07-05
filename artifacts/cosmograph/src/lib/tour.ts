import type { LucideIcon } from "lucide-react";
import {
  Compass,
  MessageCircleQuestion,
  Rocket,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { galaxyData, type AskQuery } from "@/data/galaxy";
import { LEGEND_BY_KEY } from "@/lib/legend";

export type TourTarget =
  | { type: "overview" }
  | { type: "sun"; id: string }
  | { type: "planet"; id: string };

export interface TourStop {
  title: string;
  caption: string;
  target: TourTarget;
  duration: number;
  icon?: LucideIcon;
  // Camera treatment for this stop. "fly" scripts a low, immersive first-person
  // glide through the galactic plane (to show off Fly view); anything else uses
  // the planetarium Orbit vantage with a gentle rotating sweep. Default "orbit".
  view?: "orbit" | "fly";
  // Optional deterministic Ask-Cosmo demo: while this stop is showing, papers
  // matching this query light up in the galaxy (rest dim), then clear on leave.
  // Computed in-browser via the normal filters path — no LLM call.
  ask?: AskQuery;
  // The human-readable question shown in the Ask-Cosmo demo card (the plain
  // English the `ask` spec stands in for). Only set on the ask stop.
  askPrompt?: string;
}

const compactWords = (n: number) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

function buildTourStops(): TourStop[] {
  const stops: TourStop[] = [];
  const { author, stats, papers } = galaxyData;
  const domains = [...galaxyData.domains].sort(
    (a, b) => b.totalCitations - a.totalCitations,
  );
  const topPapers = [...papers].sort((a, b) => b.citations - a.citations);
  const firstName = author.name.split(/\s+/)[0] || author.name;

  // A citation threshold that always lights up a visible-but-selective cluster
  // for the Ask-Cosmo demo (~top 15% of the corpus, floored so tiny galaxies
  // still show a handful). Derived from real data so the highlighted count and
  // the caption's number always agree.
  const askThreshold = (() => {
    if (topPapers.length === 0) return 0;
    const idx = Math.min(
      topPapers.length - 1,
      Math.max(3, Math.floor(topPapers.length * 0.15)),
    );
    return topPapers[idx]?.citations ?? 0;
  })();

  // 1. The ONLY explainer: one slide that doubles as the welcome and the key.
  stops.push({
    title: "Welcome",
    caption: `A lifetime of discovery by ${author.name} — ${stats.totalPapers} papers and ${stats.totalCitations.toLocaleString()} citations across ${stats.yearsActive} years. Quick key: each glowing sun is a research field, every planet a paper (bigger = more cited), and the moons are co-authors. Now, the highlights.`,
    target: { type: "overview" },
    duration: 9000,
    icon: Sparkles,
  });

  // 2. The defining research field (brightest sun).
  if (domains[0]) {
    stops.push({
      title: domains[0].name,
      caption: `${author.name}'s defining field: ${domains[0].name}, blazing with ${domains[0].totalCitations.toLocaleString()} citations across ${domains[0].paperCount} papers — the brightest sun in this galaxy.`,
      target: { type: "sun", id: domains[0].id },
      duration: 8500,
      icon: LEGEND_BY_KEY.suns.icon,
    });
  }

  // 3. The second-biggest field, to show range.
  if (domains[1]) {
    stops.push({
      title: domains[1].name,
      caption: `Close behind: ${domains[1].name} — ${domains[1].totalCitations.toLocaleString()} citations over ${domains[1].paperCount} papers, a whole second sun's worth of work.`,
      target: { type: "sun", id: domains[1].id },
      duration: 8000,
      icon: LEGEND_BY_KEY.suns.icon,
    });
  }

  // Fly vs Orbit: drop out of the planetarium view and glide first-person
  // through the plane toward the brightest sun, to show off the second nav mode.
  if (domains[0]) {
    stops.push({
      title: "Two ways to travel",
      caption: `Two ways to move: first the overhead Orbit view you've been watching — then watch it drop into Fly mode, diving low to pilot first-person past the stars, right through ${domains[0].name}. Switch between them anytime from the cockpit.`,
      target: { type: "sun", id: domains[0].id },
      duration: 11000,
      icon: Rocket,
      view: "fly",
    });
  }

  // 4. The signature paper (largest planet).
  const mostCited = topPapers[0];
  if (mostCited) {
    stops.push({
      title: "His most-cited work",
      caption: `"${mostCited.title}" — cited ${mostCited.citations.toLocaleString()} times${mostCited.year ? ` since ${mostCited.year}` : ""}. The single largest planet in the galaxy.`,
      target: { type: "planet", id: mostCited.id },
      duration: 9000,
      icon: LEGEND_BY_KEY.planets.icon,
    });
  }

  // 5. A second landmark paper.
  const secondCited = topPapers[1];
  if (secondCited) {
    stops.push({
      title: "Another landmark",
      caption: `"${secondCited.title}" — ${secondCited.citations.toLocaleString()} citations${secondCited.year ? ` since ${secondCited.year}` : ""}, and one of his most-cited contributions.`,
      target: { type: "planet", id: secondCited.id },
      duration: 8500,
      icon: LEGEND_BY_KEY.planets.icon,
    });
  }

  // Ask Cosmo demo: light up a real, deterministic slice of the corpus so the
  // natural-language query panel's payoff is visible before free exploration.
  if (askThreshold > 0) {
    stops.push({
      title: "Ask Cosmo",
      caption: `Ask a plain-English question and matching worlds light up. Try "which of ${firstName}'s papers have at least ${askThreshold.toLocaleString()} citations?" — here they are now, glowing while the rest fade. Your turn once the tour ends.`,
      target: { type: "overview" },
      duration: 9000,
      icon: MessageCircleQuestion,
      askPrompt: `Which of ${firstName}'s papers have at least ${askThreshold.toLocaleString()} citations?`,
      ask: {
        intent: "list",
        minCitations: askThreshold,
        sortBy: "citations",
        sortDir: "desc",
      },
    });
  }

  // 6. The career, by the numbers.
  stops.push({
    title: "By the numbers",
    caption: `An h-index of ${author.hIndex} and ${author.i10Index} well-cited papers, ${stats.uniqueCoAuthors.toLocaleString()} collaborators worldwide, and an estimated ${compactWords(stats.estimatedWords)}+ words published — about ${Math.round(stats.estimatedWords / 90_000).toLocaleString()} novels' worth.`,
    target: { type: "overview" },
    duration: 9000,
    icon: TrendingUp,
  });

  // 7. Hand off to free exploration.
  stops.push({
    title: "Explore Freely",
    caption:
      "That's the highlight reel. Now drift through the rest of the universe at your own pace.",
    target: { type: "overview" },
    duration: 6000,
    icon: Compass,
  });

  return stops;
}

// Computed on demand (not a module-load constant) so it reflects the active
// scientist after a live dataset swap. Consumers memoize this at mount; the tour
// UI/camera components remount on dataset change (key={datasetVersion}).
export function getTourStops(): TourStop[] {
  return buildTourStops();
}
