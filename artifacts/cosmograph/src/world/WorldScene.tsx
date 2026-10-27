// The static world drawing: stars, cross-domain lines, islands (glass bowl, flat
// top, accent rims), paper tiles, machine tiles, overview marks and auras, plus
// the veil and lift layer used when a machine is enlarged. Rendered once per
// dataset; the camera, bowl shading, labels and machines are driven imperatively
// by WorldView so panning and zooming never re-render React.

import { memo, type ReactElement } from "react";
import tileVariantsRaw from "./data/tile-variants.svg?raw";
import type { WDomain, WorldModel } from "./model";
import {
  at,
  f1,
  ISLAND_Z,
  machineTransform,
  MZ0,
  PITCH,
  planOutline,
  pts,
  type Vec2,
} from "./iso";
import { hslRgb, mixWhite, rgba, rgbCss, tintKeepLum } from "./color";

// tile variants are drawn once at the origin and placed with <use>
const TILE_DEFS = tileVariantsRaw.replace(/id="pv(\d+)"/g, 'id="cgw-pv$1"');

export const MARK_PATH: Record<string, string> = {
  sq: "M-1 -1H1V1H-1Z",
  ci: "M-1 0A1 1 0 1 0 1 0A1 1 0 1 0 -1 0Z",
  di: "M0 -1.3L1.3 0L0 1.3L-1.3 0Z",
  tr: "M0 -1.25L1.2 .95H-1.2Z",
};

function DomainGradients({ d }: { d: WDomain }) {
  const ed = mixWhite(d.accent, 0.45);
  const bt = {
    gradientUnits: "objectBoundingBox" as const,
    cx: ".5",
    cy: "1",
    r: "1",
    gradientTransform: "matrix(.5 0 0 1 .25 0)",
  };
  return (
    <>
      <radialGradient id={`cgw-beam-d${d.idx}`} {...bt}>
        <stop offset="0" stopColor={ed} stopOpacity=".55" />
        <stop offset=".3" stopColor={d.accent} stopOpacity=".22" />
        <stop offset="1" stopColor={d.accent} stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`cgw-core-d${d.idx}`} {...bt}>
        <stop offset="0" stopColor={ed} stopOpacity=".9" />
        <stop offset=".35" stopColor={d.accent} stopOpacity=".35" />
        <stop offset="1" stopColor={d.accent} stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`cgw-pool-d${d.idx}`}>
        <stop offset="0" stopColor={ed} stopOpacity=".5" />
        <stop offset=".45" stopColor={d.accent} stopOpacity=".2" />
        <stop offset="1" stopColor={d.accent} stopOpacity="0" />
      </radialGradient>
    </>
  );
}

function Island({ d }: { d: WDomain }) {
  const h = d.h;
  const A = (x: number, y: number): Vec2 => at([d.C[0] + x, d.C[1] + y, ISLAND_Z]);
  const top = [A(-h, -h), A(h, -h), A(h, h), A(-h, h)];
  const hi = h - 0.32 * PITCH;
  const baseTop = hslRgb(d.hue, 6, 16.5);
  const baseBowl = hslRgb(d.hue, 10, 8);
  const [x0, y0, x1, y1] = d.bb;
  const img = {
    clipPath: `url(#cgw-bc-${d.idx})`,
    preserveAspectRatio: "none",
    x: f1(x0),
    y: f1(y0),
    width: f1(x1 - x0),
    height: f1(y1 - y0),
  };
  return (
    <>
      <g className="bowl">
        <clipPath id={`cgw-bc-${d.idx}`}>
          <polygon points={pts(d.hull)} />
        </clipPath>
        <polygon className="bowl-base" points={pts(d.hull)} fill={`hsl(${d.hue} 10% 8%)`} />
        <polygon className="bowl-base tn" points={pts(d.hull)} fill={rgbCss(tintKeepLum(baseBowl, d.accent))} />
        <image className="bowl-img" data-b={d.idx} {...img} />
        <image className="bowl-img tn" data-bt={d.idx} {...img} />
      </g>
      <g className={`island mk-${d.mark}`} style={{ ["--acc" as string]: d.accent }}>
        <polygon points={pts(top)} fill={`hsl(${d.hue} 6% 16.5%)`} />
        <polygon className="tn" points={pts(top)} fill={rgbCss(tintKeepLum(baseTop, d.accent))} />
        <polyline className="rim back" points={pts([A(h, -h), A(-h, -h), A(-h, h)])} />
        <polyline className="rim front" points={pts([A(-h, h), A(h, h), A(h, -h)])} />
        {d.mark === "ci" && (
          <polyline className="rim front2" points={pts([A(-hi, hi), A(hi, hi), A(hi, -hi)])} />
        )}
      </g>
    </>
  );
}

function DomainGroup({ d }: { d: WDomain }) {
  type Piece = { dep: number; el: ReactElement };
  const pieces: Piece[] = [];
  for (const t of d.tiles) {
    const [sx, sy] = at([t.cx, t.cy, 0]);
    pieces.push({
      dep: t.cx + t.cy,
      el: (
        <g
          key={t.id}
          className="ph tile"
          data-id={t.id}
          data-p={t.paper.id}
          transform={`translate(${f1(sx)} ${f1(sy)})`}
        >
          <use href={`#cgw-pv${t.variant}`} />
        </g>
      ),
    });
  }
  for (const m of d.machines) {
    pieces.push({
      dep: m.cx + m.cy,
      el: (
        <g
          key={m.key}
          className="mach rm iso built"
          data-theme="dark"
          data-m={m.key}
          data-d={d.idx}
          data-p={m.paper.id}
          tabIndex={0}
          role="button"
          aria-label={`Run the machine: ${m.paper.title}`}
        >
          <path
            className="rfoot"
            d={planOutline({ x: m.cx - 140, y: m.cy - 140, w: 280, d: 280, r: 10 }, ISLAND_Z)}
            stroke={m.accent}
          />
          <g
            className="mpos"
            data-slot={m.key}
            transform={machineTransform(m.cx, m.cy)}
            style={{ filter: `drop-shadow(0 0 .8px ${rgba(m.edge, 0.75)})` }}
          />
        </g>
      ),
    });
  }
  pieces.sort((a, b) => a.dep - b.dep);
  return (
    <g className="domain" data-d={d.idx}>
      <Island d={d} />
      {d.plots.map(([cx, cy], n) => (
        <path
          key={`p${n}`}
          d={planOutline({ x: cx - 130, y: cy - 130, w: 260, d: 260, r: 8 }, ISLAND_Z)}
          fill="none"
          stroke="#3a3d4a"
          strokeWidth=".8"
          strokeDasharray="2 5"
        />
      ))}
      {pieces.map((p) => p.el)}
    </g>
  );
}

function Auras({ model }: { model: WorldModel }) {
  return (
    <g id="auras">
      {/* v9: one aura per island, on its centre machine only (341 beams would wash the overview out) */}
      {model.domains
        .filter((d) => d.machines.some((m) => m.ring === 0))
        .map((d, n) => (
          <g key={d.idx} className="aura" style={{ ["--d" as string]: `${(-(n * 0.37) % 3.2).toFixed(2)}s` }}>
            {d.machines.filter((m) => m.ring === 0).map((m) => {
              const [bx, by] = at([m.cx, m.cy, ISLAND_Z]);
              const [tx, ty] = at([m.cx, m.cy, MZ0 + 150]);
              const e = 168;
              const ring = [
                [-e, -e],
                [e, -e],
                [e, e],
                [-e, e],
              ].map(([x, y]) => at([m.cx + x, m.cy + y, ISLAND_Z]));
              return (
                <g key={m.key}>
                  <ellipse className="au-pool" cx={f1(bx)} cy={f1(by)} rx="560" ry="320" fill={`url(#cgw-pool-d${d.idx})`} />
                  <polygon className="au-ring" points={pts(ring)} stroke={m.accent} />
                  <rect className="au-beam" x={f1(tx - 150)} y={f1(ty - 3000)} width="300" height="3000" fill={`url(#cgw-beam-d${d.idx})`} />
                  <rect className="au-core" x={f1(tx - 24)} y={f1(ty - 2400)} width="48" height="2400" fill={`url(#cgw-core-d${d.idx})`} />
                </g>
              );
            })}
          </g>
        ))}
    </g>
  );
}

export const WorldScene = memo(function WorldScene({ model }: { model: WorldModel }) {
  const [BX0, BY0, BX1, BY1] = model.bounds;
  const big = { x: BX0 - 4000, y: BY0 - 4000, width: BX1 - BX0 + 8000, height: BY1 - BY0 + 8000 };
  return (
    <>
      <defs>
        {model.domains.map((d) => (
          <DomainGradients key={d.idx} d={d} />
        ))}
        <radialGradient id="cgw-liftglow">
          <stop offset="0" stopColor="#fff" stopOpacity=".16" />
          <stop offset=".55" stopColor="#fff" stopOpacity=".05" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="cgw-liftshadow">
          <stop offset="0" stopColor="#000" stopOpacity=".7" />
          <stop offset=".6" stopColor="#000" stopOpacity=".3" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <defs dangerouslySetInnerHTML={{ __html: TILE_DEFS }} />
      <rect {...big} fill="#15161c" />
      <g className="stars" fill="#e6e6e6">
        {model.stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={s.o} />
        ))}
      </g>
      <g className="xlinks">
        {model.links.map((l, i) => (
          <line key={i} x1={f1(l.p0[0])} y1={f1(l.p0[1])} x2={f1(l.p1[0])} y2={f1(l.p1[1])} style={{ opacity: l.opacity.toFixed(2) }} />
        ))}
      </g>
      {model.order.map((i) => (
        <DomainGroup key={i} d={model.domains[i]} />
      ))}
      <g id="marks">
        {model.domains.map((d) => (
          <path
            key={d.idx}
            className="mark"
            transform={`translate(${f1(d.mk[0])} ${f1(d.mk[1])}) scale(120 120)`}
            d={MARK_PATH[d.mark]}
            fill={d.accent}
          />
        ))}
      </g>
      <Auras model={model} />
      <rect id="veil" {...big} />
      <g id="lift">
        <ellipse id="lshadow" fill="url(#cgw-liftshadow)" />
        <ellipse id="lglow" fill="url(#cgw-liftglow)" />
        <g id="lshell" className="mach rm iso built" data-theme="dark">
          <g className="mpos" id="lholder" />
        </g>
      </g>
    </>
  );
});
