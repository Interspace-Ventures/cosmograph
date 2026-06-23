import { useState } from "react";
import { Share2 } from "lucide-react";
import { ShareModal } from "./ShareModal";

export function ShareButton({ full = false }: { full?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Share this Cosmograph"
        className={`flex items-center border-2 border-edge bg-white/5 text-ink transition-all hover:bg-white/10 pointer-events-auto ${
          full ? "h-9 w-full gap-2 px-3" : "h-11 w-11 justify-center md:h-9 md:w-9"
        }`}
      >
        <Share2 size={15} className="shrink-0" />
        {full && (
          <span className="font-display text-[11px] uppercase tracking-wider">Share</span>
        )}
      </button>
      <ShareModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
