import { Rewind } from "lucide-react";
import { useAppState } from "@/lib/store";
import { galaxyData } from "@/data/galaxy";
import { SITE } from "@/config/site";
import { LEGEND, NAV_MODES } from "@/lib/legend";
import { Drawer } from "./Drawer";
import { ChangelogContent } from "./ChangelogContent";

export function InfoDrawer() {
  const { infoOpen, setInfoOpen, infoTab, setInfoTab, replayIntro } =
    useAppState();

  return (
    <Drawer
      open={infoOpen}
      onClose={() => setInfoOpen(false)}
      labelledBy="info-drawer-title"
    >
      <div className="mb-5 flex gap-1.5 border-b-2 border-edge pr-8">
        <button
          onClick={() => setInfoTab("about")}
          className={`-mb-0.5 border-b-2 px-1 pb-2 font-display text-[11px] uppercase tracking-wider transition-colors ${
            infoTab === "about"
              ? "border-accent text-ink"
              : "border-transparent text-ink-dim hover:text-ink"
          }`}
        >
          About
        </button>
        <button
          onClick={() => setInfoTab("log")}
          className={`-mb-0.5 border-b-2 px-1 pb-2 font-display text-[11px] uppercase tracking-wider transition-colors ${
            infoTab === "log"
              ? "border-accent text-ink"
              : "border-transparent text-ink-dim hover:text-ink"
          }`}
        >
          Changelog
        </button>
      </div>

      {infoTab === "about" ? (
        <div>

            <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
              About this Venture
            </span>
            <h2
              id="info-drawer-title"
              className="mt-1 mb-5 text-2xl font-title font-bold tracking-tight text-ink"
            >
              Research on galactic scale
            </h2>

            <div className="space-y-4 text-[13px] leading-relaxed text-ink-dim">
              <p>
                Cosmograph turns a researcher's lifetime of research into a universe you can fly
                through. Every <span className="text-ink">sun</span> is a field they helped shape,
                every <span className="text-ink">planet</span> a paper they published, and every{" "}
                <span className="text-ink">moon</span> a collaborator who worked alongside them.
                Right now you're exploring the work of{" "}
                <span className="text-ink">{galaxyData.author.name}</span>.
              </p>
              <p>
                It began as a Father's Day gift — a way to make one researcher's life's work feel as
                vast as it truly is. A career of research — in science, economics, or any field —
                usually disappears into citation counts and PDFs; this is an attempt to let you{" "}
                <em>feel</em> the scale of it, and to say thank you to the people who spend their
                lives expanding what we know.
              </p>
              <p>
                Cosmograph is open source and built for anyone. Point it at any researcher — a parent,
                a mentor, or yourself — and it rebuilds the entire galaxy from public data on{" "}
                <span className="text-ink">OpenAlex</span>. No identity is hardcoded; everything you
                see is generated from a single data snapshot.
              </p>
              <p>
                Built frontend-only with <span className="text-ink">React</span>,{" "}
                <span className="text-ink">Three.js</span> &{" "}
                <span className="text-ink">React Three Fiber</span>. Bibliographic data comes from
                OpenAlex — {galaxyData.papers.length.toLocaleString()} papers across{" "}
                {galaxyData.domains.length} domains.
              </p>
            </div>

            <button
              onClick={replayIntro}
              className="mt-6 flex w-full items-center justify-center gap-2 border-2 border-edge bg-white/5 px-4 py-3 font-display text-[11px] uppercase tracking-wider text-ink transition-colors hover:bg-white/10"
            >
              <Rewind size={15} />
              Replay intro
            </button>

            <div className="mt-8 border-t-2 border-edge pt-6">
              <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                The Hitchhiker's Guide to Cosmograph
              </span>
              <h3 className="mt-1 mb-4 text-lg font-title font-bold tracking-tight text-ink">
                A lifetime of work, mapped to the stars
              </h3>

              <div className="space-y-4">
                {LEGEND.map(({ icon: Icon, title, body }) => (
                  <div key={title} className="flex items-start gap-3.5">
                    <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center border-2 border-edge bg-white/5 text-accent">
                      <Icon size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-display font-semibold text-ink">{title}</div>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-ink-dim">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 border-t-2 border-edge pt-6">
              <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                Getting around
              </span>
              <h3 className="mt-1 mb-4 text-lg font-title font-bold tracking-tight text-ink">
                Two ways to explore
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="border-2 border-edge bg-white/5 p-4">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-8 w-8 shrink-0 place-items-center border-2 border-edge bg-white/5 text-accent">
                      <NAV_MODES.orbit.icon size={15} />
                    </div>
                    <span className="font-display text-sm font-semibold uppercase tracking-wider text-ink">
                      {NAV_MODES.orbit.name}
                    </span>
                  </div>
                  <p className="mt-2.5 text-[13px] leading-relaxed text-ink-dim">
                    {NAV_MODES.orbit.blurb}
                  </p>
                  <ul className="mt-3 space-y-1.5 font-mono text-[11px] text-ink-dim">
                    <li>
                      <span className="text-ink">Drag (left)</span> · pan across
                    </li>
                    <li>
                      <span className="text-ink">Drag (right)</span> · rotate & tilt the view
                    </li>
                    <li>
                      <span className="text-ink">Scroll</span> · zoom in & out
                    </li>
                    <li>
                      <span className="text-ink">Click</span> a sun or planet for details
                    </li>
                  </ul>
                </div>

                <div className="border-2 border-edge bg-white/5 p-4">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-8 w-8 shrink-0 place-items-center border-2 border-edge bg-white/5 text-accent">
                      <NAV_MODES.fly.icon size={15} />
                    </div>
                    <span className="font-display text-sm font-semibold uppercase tracking-wider text-ink">
                      {NAV_MODES.fly.name}
                    </span>
                  </div>
                  <p className="mt-2.5 text-[13px] leading-relaxed text-ink-dim">
                    {NAV_MODES.fly.blurb}
                  </p>
                  <ul className="mt-3 space-y-1.5 font-mono text-[11px] text-ink-dim">
                    <li>
                      <span className="text-ink">W A S D</span> · fly through space
                    </li>
                    <li>
                      <span className="text-ink">Drag</span> or <span className="text-ink">← ↑ ↓ →</span> · look around
                    </li>
                    <li>
                      <span className="text-ink">Q</span> / <span className="text-ink">E</span> · roll
                    </li>
                    <li>
                      <span className="text-ink">Space</span> / <span className="text-ink">Shift</span> · rise & descend
                    </li>
                  </ul>
                </div>
              </div>

              <p className="mt-3 font-mono text-[10px] leading-relaxed text-ink-dim/70">
                On touch: drag with one finger to pan, pinch to zoom & rotate.
              </p>
            </div>

            <p className="mt-8 border-t-2 border-edge pt-4 font-mono text-[11px] leading-relaxed text-ink-dim">
              Live presence is anonymous and ephemeral: while you explore, only your camera position
              is shared so others can see your wisp and the headcount. Nothing is stored, and it all
              vanishes the moment you leave.
            </p>
            <p className="mt-4 font-mono text-[10px] leading-relaxed text-ink-dim/70">
              © 2026{" "}
              <button
                onClick={() => setInfoTab("log")}
                title="View the flight log"
                className="text-accent underline-offset-2 transition-colors hover:underline"
              >
                v{SITE.version}
              </button>{" "}
              · <span className="text-ink-dim">{SITE.domain}</span> is an{" "}
              <a
                href={SITE.org.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline-offset-2 hover:underline"
              >
                {SITE.org.name}
              </a>
              . Built at the speed of thought.
            </p>
        </div>
      ) : (
        <ChangelogContent titleId="info-drawer-title" />
      )}
    </Drawer>
  );
}
