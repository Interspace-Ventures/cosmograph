// Offline flipbook baking page (`/world#bake=flip`, internal flag only). Lays the
// world's machines out in a grid of 192 x 128 px cells, each framed exactly like
// the atlas thumbnails and the GPU sprites (THUMB_BOX), mounts their real live
// modules, and lets scripts/bake-world.py screenshot the grid: once at rest, then
// a few times while every machine runs its own test animation.

import { useEffect, useMemo, useRef } from "react";
import { galaxyData, papersByDomain } from "@/data/galaxy";
import { buildWorld, type WMachine } from "../model";
import { THUMB_BOX } from "../iso";
import { loadAssetManifests, hasModule } from "../assets";
import { mountLive, type LiveMachine } from "../machineRuntime";

export const BAKE_CELL: [number, number] = [192, 128];
const SVGNS = "http://www.w3.org/2000/svg";

export default function BakeFlip() {
  const machines = useMemo(() => {
    const w = buildWorld(galaxyData, papersByDomain);
    const seen = new Set<string>();
    const out: WMachine[] = [];
    // island by island, so a flipbook page holds neighbours (pages load per region)
    for (const d of w.domains)
      for (const m of d.machines)
        if (!seen.has(m.slug)) {
          seen.add(m.slug);
          out.push(m);
        }
    return out;
  }, []);
  const gridRef = useRef<HTMLDivElement>(null);
  const stubRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live: LiveMachine[] = [];
    const [cw, ch] = BAKE_CELL;
    const api = {
      ready: false,
      slugs: () => machines.map((m) => m.slug),
      /** mount machines [from, from + n) at rest; resolves with the slugs laid out */
      show: async (from: number, n: number, cols: number) => {
        live.forEach((l) => l.dispose());
        live = [];
        const grid = gridRef.current!;
        const stubs = stubRef.current!;
        grid.textContent = "";
        stubs.textContent = "";
        const batch = machines.slice(from, from + n);
        const out: (string | null)[] = batch.map(() => null);
        await Promise.all(
          batch.map(async (m, i) => {
            const svg = document.createElementNS(SVGNS, "svg");
            svg.setAttribute("width", String(cw));
            svg.setAttribute("height", String(ch));
            svg.setAttribute("viewBox", `${THUMB_BOX.x} ${THUMB_BOX.y} ${THUMB_BOX.w} ${THUMB_BOX.h}`);
            svg.setAttribute("preserveAspectRatio", "none");
            svg.style.cssText = `position:absolute;left:${(i % cols) * cw}px;top:${Math.floor(i / cols) * ch}px;overflow:hidden`;
            const g = document.createElementNS(SVGNS, "g");
            g.setAttribute("class", "mach rm iso built");
            g.setAttribute("data-theme", "dark");
            const content = document.createElementNS(SVGNS, "g") as SVGGElement;
            g.appendChild(content);
            svg.appendChild(g);
            grid.appendChild(svg);
            if (!hasModule(m.slug, m.live)) return;
            const stub = document.createElement("div");
            stubs.appendChild(stub);
            try {
              live.push(await mountLive(content, stub, m));
              out[i] = m.slug;
            } catch {
              /* left empty: no flipbook for this one */
            }
          }),
        );
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return out;
      },
      /** every machine in the batch starts its own test animation */
      start: () => {
        for (const l of live)
          try {
            l.hook()?.startTest();
          } catch {
            /* a machine without a test just stays at rest */
          }
      },
    };
    (window as unknown as Record<string, unknown>).__cgwBake = api;
    void loadAssetManifests().then(() => {
      api.ready = true;
    });
    return () => {
      live.forEach((l) => l.dispose());
      delete (window as unknown as Record<string, unknown>).__cgwBake;
    };
  }, [machines]);

  return (
    <div className="cgw bake">
      <div ref={gridRef} style={{ position: "absolute", left: 0, top: 0 }} />
      <div ref={stubRef} className="stub" aria-hidden="true" />
    </div>
  );
}
