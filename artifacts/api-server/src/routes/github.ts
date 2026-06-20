import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

// Server-side, cached GitHub star count. Caching here means upstream GitHub is
// hit at most once per TTL no matter how many visitors load the site — so the
// 60 req/hr unauthenticated rate limit can never be tripped by traffic.

const REPO = process.env.GITHUB_REPO || "heyinterspace/galactic";
const TTL_MS = 5 * 60 * 1000;

let cache: { stars: number | null; url: string; fetchedAt: number } = {
  stars: null,
  url: `https://github.com/${REPO}`,
  fetchedAt: 0,
};

// Single-flight: concurrent stale requests share one in-flight upstream call.
let inFlight: Promise<void> | null = null;

function refresh(): Promise<void> {
  if (!inFlight) inFlight = doRefresh().finally(() => (inFlight = null));
  return inFlight;
}

async function doRefresh(): Promise<void> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: {
        "User-Agent": "galactic-app",
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
    const json = (await res.json()) as {
      stargazers_count?: number;
      html_url?: string;
    };
    cache = {
      stars: typeof json.stargazers_count === "number" ? json.stargazers_count : cache.stars,
      url: json.html_url || `https://github.com/${REPO}`,
      fetchedAt: Date.now(),
    };
  } catch (err) {
    // Keep serving the last good value; back off so failures don't hammer GitHub.
    cache.fetchedAt = Date.now();
    logger.warn({ err }, "github stars refresh failed");
  }
}

const router: IRouter = Router();

router.get("/github/stars", async (_req, res) => {
  if (Date.now() - cache.fetchedAt > TTL_MS) await refresh();
  res.set("Cache-Control", "public, max-age=60");
  res.json({ stars: cache.stars, url: cache.url, repo: REPO });
});

export default router;
