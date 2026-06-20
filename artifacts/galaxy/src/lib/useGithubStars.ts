import { useEffect, useState } from "react";

type StarsState = { stars: number | null; url: string | null };

// Reads the server-cached GitHub star count. The api-server caches upstream so
// this stays cheap no matter how many visitors load the page.
export function useGithubStars(): StarsState {
  const [state, setState] = useState<StarsState>({ stars: null, url: null });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/github/stars")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setState({
          stars: typeof d.stars === "number" ? d.stars : null,
          url: typeof d.url === "string" ? d.url : null,
        });
      })
      .catch(() => {
        // leave defaults; the button still links to the repo
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}
