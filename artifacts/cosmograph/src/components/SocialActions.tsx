import { useState } from "react";
import { Heart, Github, Star, Share2 } from "lucide-react";
import { useGithubStars, formatStars } from "@/lib/useGithubStars";
import { SITE } from "@/config/site";
import { ShareModal } from "./ShareModal";

/**
 * Project / social actions — Source (GitHub), Sponsor, and Share. These used to
 * live in the cockpit dashboard but now sit just to the right of the
 * "Cosmograph" header title. Self-contained: owns its own Share modal state and
 * star count.
 */
export function SocialActions() {
  const [shareOpen, setShareOpen] = useState(false);
  const { stars, url } = useGithubStars();

  return (
    <>
      <div className="pointer-events-auto flex items-center gap-1">
        <a
          href={url ?? SITE.github.url}
          target="_blank"
          rel="noopener noreferrer"
          className="relative flex h-7 shrink-0 items-center gap-1.5 border border-edge bg-white/5 px-2 text-ink transition-colors hover:bg-white/10"
        >
          <Github size={12} className="shrink-0" />
          <span className="font-display text-[10px] uppercase tracking-wider">
            Source
          </span>
          {stars !== null && (
            <span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-accent">
              <Star size={9} className="fill-current" />
              {formatStars(stars)}
            </span>
          )}
        </a>
        <a
          href={SITE.github.sponsors}
          target="_blank"
          rel="noopener noreferrer"
          className="relative flex h-7 shrink-0 items-center gap-1.5 border border-edge bg-white/5 px-2 text-ink transition-colors hover:bg-white/10"
        >
          <Heart size={12} className="shrink-0 text-accent" />
          <span className="font-display text-[10px] uppercase tracking-wider">
            Sponsor
          </span>
        </a>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="relative flex h-7 shrink-0 items-center gap-1.5 border border-edge bg-white/5 px-2 text-ink transition-colors hover:bg-white/10"
        >
          <Share2 size={12} className="shrink-0" />
          <span className="font-display text-[10px] uppercase tracking-wider">
            Share
          </span>
        </button>
      </div>
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
    </>
  );
}
