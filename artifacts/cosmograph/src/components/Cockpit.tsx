import { useMemo, RefObject, ReactNode } from "react";

const ACCENT = "163,136,238";

interface WarpLine {
  angle: number;
  length: number;
  opacity: number;
  thickness: number;
  hue: string;
}

export function Cockpit({
  warpRef,
  className = "z-40",
}: {
  warpRef: RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  const lines = useMemo<WarpLine[]>(
    () =>
      Array.from({ length: 60 }).map((_, i) => ({
        angle: (i / 60) * 360 + (Math.random() - 0.5) * 6,
        length: 45 + Math.random() * 55,
        opacity: 0.18 + Math.random() * 0.5,
        thickness: Math.random() > 0.85 ? 2 : 1,
        hue: Math.random() > 0.72 ? ACCENT : "232,236,255",
      })),
    [],
  );

  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none font-mono ${className}`}
    >
      {/* Warp streaks emanating from the vanishing point */}
      <div
        ref={warpRef}
        className="absolute inset-0 opacity-0"
        style={{ transformOrigin: "50% 44%", willChange: "opacity, transform" }}
      >
        {lines.map((l, i) => (
          <div
            key={i}
            className="absolute left-1/2 top-[44%] origin-left"
            style={{
              height: `${l.thickness}px`,
              width: `${l.length}vmax`,
              transform: `rotate(${l.angle}deg)`,
              opacity: l.opacity,
              background: `linear-gradient(90deg, rgba(${l.hue},0) 0%, rgba(${l.hue},0) 58%, rgba(${l.hue},0.4) 84%, rgba(${l.hue},0.95) 100%)`,
            }}
          />
        ))}
      </div>

      {/* Cinematic vignette to seat the eye in the cockpit */}
      <div
        className="absolute inset-0"
        style={{ boxShadow: "inset 0 0 220px 70px rgba(8,8,14,0.92)" }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(140% 108% at 50% 42%, transparent 48%, rgba(8,8,14,0.42) 75%, rgba(8,8,14,0.8) 100%)",
        }}
      />
      {/* Faint accent wash along the top of the canopy */}
      <div
        className="absolute inset-x-0 top-0 h-1/3"
        style={{
          background: `linear-gradient(180deg, rgba(${ACCENT},0.09) 0%, transparent 70%)`,
        }}
      />

      {/* Corner brackets framing the lower canopy only. The top brackets and the
          old full-width top HUD bar are intentionally omitted so the cockpit frame
          never sits over the app Header (brand + stats) that lives in the top-left
          during flight. The flight-status text moved into the bottom console. */}
      <Bracket className="left-5 bottom-[28vh]" edges="lb" />
      <Bracket className="right-5 bottom-[28vh]" edges="rb" />

      {/* Centre target reticle — square, per Structured Liquidity */}
      <div className="absolute left-1/2 top-[44%] h-16 w-16 -translate-x-1/2 -translate-y-1/2">
        <span
          className="absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2"
          style={{ borderColor: `rgba(${ACCENT},0.6)` }}
        />
        <span
          className="absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2"
          style={{ borderColor: `rgba(${ACCENT},0.6)` }}
        />
        <span
          className="absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2"
          style={{ borderColor: `rgba(${ACCENT},0.6)` }}
        />
        <span
          className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2"
          style={{ borderColor: `rgba(${ACCENT},0.6)` }}
        />
        <span
          className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2"
          style={{ background: `rgba(${ACCENT},0.9)` }}
        />
      </div>

      {/* Bottom console */}
      <div className="absolute inset-x-0 bottom-0 h-[26vh]">
        {/* Panel fill */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(12,13,22,0) 0%, rgba(12,13,22,0.94) 32%, rgba(6,7,13,1) 100%)",
          }}
        />
        {/* Top edge: hard black rule + accent hairline */}
        <div className="absolute inset-x-0 top-[30%] h-[2px] bg-black/80" />
        <div
          className="absolute inset-x-0 top-[30%] h-[2px]"
          style={{
            background: `linear-gradient(90deg, transparent, rgba(${ACCENT},0.7) 50%, transparent)`,
          }}
        />

        {/* Flight status — relocated here from the old top HUD bar so it never
            sits over the Cosmograph header during flight. */}
        <div className="absolute inset-x-0 top-[36%] flex items-center justify-between px-[7%] text-[9px] uppercase tracking-[0.3em] text-ink-dim">
          <span>Cosmograph · Flight Systems</span>
          <span className="text-accent/80">Nav · Online</span>
        </div>

        {/* Instrument readouts */}
        <div className="absolute inset-x-0 bottom-[22%] flex items-end justify-between px-[7%]">
          <Readout label="Velocity">
            <div className="flex items-center gap-[3px]">
              {Array.from({ length: 14 }).map((_, i) => (
                <span
                  key={i}
                  className="h-3.5 w-[3px]"
                  style={{
                    background: `rgba(${ACCENT},${i < 9 ? 0.9 : 0.18})`,
                  }}
                />
              ))}
            </div>
          </Readout>

          {/* Heading tape */}
          <div className="hidden flex-col items-center gap-2 md:flex">
            <div className="flex items-end gap-[5px]">
              {Array.from({ length: 13 }).map((_, i) => (
                <span
                  key={i}
                  className="w-px"
                  style={{
                    height: i === 6 ? 16 : 8,
                    background: `rgba(${ACCENT},${i === 6 ? 0.95 : 0.45})`,
                  }}
                />
              ))}
            </div>
            <span className="text-[9px] uppercase tracking-[0.35em] text-accent/70">
              Heading 000
            </span>
          </div>

          <Readout label="Drive" align="right">
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2"
                style={{
                  background: `rgba(${ACCENT},0.95)`,
                  boxShadow: `0 0 8px 1px rgba(${ACCENT},0.6)`,
                }}
              />
              <span className="text-[10px] uppercase tracking-[0.3em] text-ink-dim">
                Engaged
              </span>
            </div>
          </Readout>
        </div>
      </div>
    </div>
  );
}

function Readout({
  label,
  align = "left",
  children,
}: {
  label: string;
  align?: "left" | "right";
  children: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-2 ${align === "right" ? "items-end" : "items-start"}`}
    >
      <span className="text-[9px] uppercase tracking-[0.35em] text-ink-dim">
        {label}
      </span>
      {children}
    </div>
  );
}

function Bracket({
  className = "",
  edges,
}: {
  className?: string;
  edges: "lt" | "rt" | "lb" | "rb";
}) {
  const map: Record<string, string> = {
    lt: "border-l-2 border-t-2",
    rt: "border-r-2 border-t-2",
    lb: "border-b-2 border-l-2",
    rb: "border-b-2 border-r-2",
  };
  return (
    <span
      className={`absolute h-7 w-7 ${map[edges]} ${className}`}
      style={{ borderColor: `rgba(${ACCENT},0.45)` }}
    />
  );
}
