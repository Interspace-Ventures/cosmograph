// Route entry for the isometric world (/world). Lazily loaded so the galaxy's
// bundle does not carry it. Uses the same dataset as the galaxy: the baked
// default researcher, or whoever ?author= loaded through the existing store.

import { useEffect } from "react";
import { useAppState } from "@/lib/store";
import { WorldView } from "./WorldView";
import BakeFlip from "./gpu/BakeFlip";
import "./world.css";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function WorldPage() {
  const { datasetVersion, datasetStatus, canExplore, setPaywallOpen, activeAuthorLabel } = useAppState();
  const search = typeof window !== "undefined" ? window.location.search : "";
  const backHref = `${basePath}/${search}`;

  useEffect(() => {
    document.title = activeAuthorLabel ? `Cosmograph World - ${activeAuthorLabel}` : "Cosmograph World";
  }, [activeAuthorLabel]);

  if (datasetStatus === "loading") {
    return (
      <div className="cgw">
        <div className="gate glass">
          <div className="t">Loading {activeAuthorLabel || "the researcher"}…</div>
          <p className="mono">Reading their papers from OpenAlex</p>
        </div>
      </div>
    );
  }

  // Same gate as the galaxy: the default researcher is free, others need a member unlock.
  if (!canExplore) {
    return (
      <div className="cgw">
        <div className="gate glass">
          <div className="t">Unlock {activeAuthorLabel}'s world</div>
          <p>Exploring a researcher other than the featured one needs a membership.</p>
          <button type="button" onClick={() => setPaywallOpen(true)}>
            See membership
          </button>{" "}
          <a href={backHref}>Back to the galaxy</a>
        </div>
      </div>
    );
  }

  // offline flipbook baker (scripts/bake-world.py); the world chunk is internal-flag only
  if (/(?:^|[#&])bake=flip\b/.test(window.location.hash)) return <BakeFlip />;
  return <WorldView key={datasetVersion} backHref={backHref} />;
}
