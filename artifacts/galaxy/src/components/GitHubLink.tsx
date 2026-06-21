import { Github, Star } from "lucide-react";
import { SITE } from "@/config/site";
import { useGithubStars, formatStars } from "@/lib/useGithubStars";

export function GitHubLink({
  compact = false,
  full = false,
}: {
  compact?: boolean;
  full?: boolean;
}) {
  const { stars, url } = useGithubStars();

  return (
    <a
      href={url ?? SITE.github.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View source on GitHub"
      title="View source on GitHub"
      className={`flex items-center border-2 border-edge bg-white/5 text-ink transition-all hover:bg-white/10 pointer-events-auto ${
        compact
          ? "h-9 w-9 justify-center"
          : full
            ? "h-9 w-full gap-2 px-3"
            : "h-11 justify-center gap-1.5 px-3 md:h-9"
      }`}
    >
      <Github size={15} className="shrink-0" />
      {full && (
        <span className="font-display text-[11px] uppercase tracking-wider">GitHub</span>
      )}
      {!compact && stars !== null && (
        <span
          className={`inline-flex items-center gap-0.5 font-mono text-[11px] text-accent ${
            full ? "ml-auto" : ""
          }`}
        >
          <Star size={11} className="fill-current" />
          {formatStars(stars)}
        </span>
      )}
    </a>
  );
}
