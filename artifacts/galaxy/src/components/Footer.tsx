import { SITE } from "@/config/site";
import { useAppState } from "@/lib/store";

export function Footer() {
  const { setInfoOpen } = useAppState();

  return (
    <footer className="absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-1.5 pt-1 pointer-events-none">
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center font-mono text-[10px] leading-relaxed tracking-wide text-ink-dim/70">
        <span>© 2026 v{SITE.version}</span>
        <span className="text-ink-dim/30">·</span>
        <span>
          <span className="text-ink-dim">{SITE.domain}</span> is an{" "}
          <a
            href={SITE.org.url}
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto text-accent underline-offset-2 hover:underline"
          >
            {SITE.org.name}
          </a>
          . Built at the speed of thought with{" "}
          <a
            href={SITE.replitUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto text-accent underline-offset-2 hover:underline"
          >
            Replit
          </a>
          .
        </span>
        <span className="text-ink-dim/30">·</span>
        <button
          onClick={() => setInfoOpen(true)}
          className="pointer-events-auto uppercase tracking-widest transition-colors hover:text-ink"
        >
          About
        </button>
      </div>
    </footer>
  );
}
