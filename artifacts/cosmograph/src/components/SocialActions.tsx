import { useState } from "react";
import { Heart, Github, Star, Share2 } from "lucide-react";
import { useGithubStars, formatStars } from "@/lib/useGithubStars";
import { SITE } from "@/config/site";
import { ShareModal } from "./ShareModal";

/**
 * Project / social actions — Sponsor, GitHub, and Share. These used to live in
 * the cockpit dashboard but now sit just to the right of the "Cosmograph"
 * header title. Self-contained: owns its own Share modal state and star count.
 */
export function SocialActions() {
  const [shareOpen, setShareOpen] = useState(false);
  const { stars, url } = useGithubStars();

  return (
    <>
      <div className="pointer-events-auto flex items-center gap-1.5">
        <a
          href={SITE.github.sponsors}
          target="_blank"
          rel="noopener noreferrer"
          className="relative flex h-9 shrink-0 items-center gap-2 border-2 border-edge bg-white/5 px-3 text-ink transition-colors hover:bg-white/10"
        >
          <Heart size={15} className="shrink-0 text-accent" />
          <span className="font-display text-[11px] uppercase tracking-wider">
            Sponsor
          </span>
        </a>
        <a
          href={url ?? SITE.github.url}
          target="_blank"
          rel="noopener noreferrer"
          className="relative flex h-9 shrink-0 items-center gap-2 border-2 border-edge bg-white/5 px-3 text-ink transition-colors hover:bg-white/10"
        >
          <Github size={15} className="shrink-0" />
          <span className="font-display text-[11px] uppercase tracking-wider">
            GitHub
          </span>
          {stars !== null && (
            <span className="inline-flex items-center gap-0.5 font-mono text-[11px] text-accent">
              <Star size={11} className="fill-current" />
              {formatStars(stars)}
            </span>
          )}
        </a>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="relative flex h-9 shrink-0 items-center gap-2 border-2 border-edge bg-white/5 px-3 text-ink transition-colors hover:bg-white/10"
        >
          <Share2 size={15} className="shrink-0" />
          <span className="font-display text-[11px] uppercase tracking-wider">
            Share
          </span>
        </button>
      </div>
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
    </>
  );
}
