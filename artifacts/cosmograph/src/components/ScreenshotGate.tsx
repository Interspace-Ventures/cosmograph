import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2, Telescope, Copy, Check, Heart, ArrowLeft } from "lucide-react";
import { useAppState } from "@/lib/store";
import { Scene } from "@/components/Scene";
import { PERKS } from "@/components/Paywall";
import { MembershipActions } from "@/components/MembershipActions";
import { MembershipPitch } from "@/components/MembershipPitch";
import { buildShareCard, copyImageToClipboard } from "@/lib/share";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const SPONSOR_URL = "https://github.com/sponsors/heyinterspace";

// The screenshot-only paywall gate. When a non-member selects a non-default
// scientist, the interactive galaxy is replaced by this: the live scene renders
// briefly off-view to capture the branded share card, then it's torn down and
// the captured preview is shown *inside* the membership panel alongside a
// Subscribe CTA. The home/default scientist never reaches this (it's free) and
// members never reach it (entitled).
export function ScreenshotGate() {
  const { activeAuthorLabel } = useAppState();

  // Capture lifecycle: keep the hidden Scene mounted only long enough to render
  // a frame, snapshot it into the share card, then unmount the GPU scene.
  const [capturing, setCapturing] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageCopied, setImageCopied] = useState(false);
  const blobRef = useRef<Blob | null>(null);
  const urlRef = useRef<string | null>(null);
  const copyResetTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Give the freshly-mounted scene time to load its background texture and
    // settle the camera into the overview before grabbing the frame.
    const timer = window.setTimeout(async () => {
      let blob: Blob | null = null;
      try {
        blob = await buildShareCard();
      } catch {
        blob = null;
      }
      if (cancelled) return;
      blobRef.current = blob;
      if (blob) {
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setImageUrl(url);
      }
      // Tear down the live scene once the capture attempt completes — whether or
      // not it produced an image — so the hidden GPU scene never stays mounted.
      setCapturing(false);
    }, 1700);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      if (copyResetTimer.current) window.clearTimeout(copyResetTimer.current);
    };
  }, []);

  const goHome = () => {
    // The baked default researcher is the initial bundle state — a reload returns
    // to the free, fully interactive home galaxy.
    window.location.href = basePath || "/";
  };

  const handleCopyImage = async () => {
    if (!blobRef.current) return;
    const ok = await copyImageToClipboard(blobRef.current);
    setImageCopied(ok);
    if (ok) {
      if (copyResetTimer.current) window.clearTimeout(copyResetTimer.current);
      copyResetTimer.current = window.setTimeout(() => setImageCopied(false), 2400);
    } else {
      toast.error("Copying images isn't supported in this browser.");
    }
  };

  return (
    <div className="absolute inset-0 z-20 overflow-hidden bg-[#03030a]">
      {/* The live scene renders here, invisibly, only while we capture the frame.
          preserveDrawingBuffer lets buildShareCard read the last drawn frame even
          though the canvas is never shown to the visitor. */}
      {capturing && (
        <div className="pointer-events-none absolute inset-0 opacity-0" aria-hidden>
          <Scene captureTopDown />
        </div>
      )}

      {/* Back to the free home galaxy. */}
      <button
        type="button"
        onClick={goHome}
        className="absolute left-4 top-4 z-10 flex items-center gap-2 border-2 border-edge bg-black/40 px-3 py-2 font-display text-[10px] uppercase tracking-widest text-ink-dim backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-ink"
      >
        <ArrowLeft size={13} />
        Free home galaxy
      </button>

      <div className="relative z-10 flex h-full w-full items-center justify-center overflow-y-auto custom-scrollbar p-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          className="glass-panel my-auto w-full max-w-md p-6 sm:p-7"
        >
          {/* The captured cosmograph preview, shown inside the panel. */}
          <div className="mb-5 overflow-hidden border-2 border-edge bg-black/40">
            {imageUrl ? (
              <motion.img
                key="card"
                src={imageUrl}
                alt={`Cosmograph of ${activeAuthorLabel}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="block w-full"
              />
            ) : (
              <div className="flex aspect-[16/10] w-full items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim">
                <Loader2 size={14} className="animate-spin" />
                Rendering preview…
              </div>
            )}
          </div>

          <MembershipPitch />

          <ul className="mt-4 space-y-2">
            {PERKS.map((perk) => (
              <li
                key={perk}
                className="flex items-start gap-2 text-[13px] text-ink"
              >
                <Telescope size={14} className="mt-0.5 shrink-0 text-accent" />
                <span>{perk}</span>
              </li>
            ))}
          </ul>

          {/* Copy the share card and Subscribe, side by side. */}
          <div className="mt-5 flex items-stretch gap-2">
            <button
              onClick={handleCopyImage}
              disabled={!imageUrl}
              className="flex flex-1 items-center justify-center gap-1.5 border-2 border-edge bg-white/5 px-3 py-3 font-display text-[10px] uppercase tracking-wider text-ink transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              {imageCopied ? (
                <Check size={13} className="text-accent" />
              ) : (
                <Copy size={13} />
              )}
              {imageCopied ? "Copied" : "Copy image"}
            </button>
            <div className="flex-1">
              <MembershipActions />
            </div>
          </div>

          {/* Sponsor the project on GitHub. */}
          <div className="mt-4 border-t-2 border-edge pt-4">
            <p className="mb-2 text-center text-[12px] leading-relaxed text-ink-dim">
              If you like what you see and want to support this project,
              contribute:
            </p>
            <a
              href={SPONSOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 border-2 border-edge bg-white/5 py-2.5 font-display text-[11px] uppercase tracking-widest text-ink-dim transition-colors hover:bg-white/10 hover:text-ink"
            >
              <Heart size={13} />
              <span>Sponsor on GitHub</span>
            </a>
          </div>

          <p className="mt-3 text-center font-mono text-[10px] leading-relaxed text-ink-dim/70">
            Secure checkout by Stripe · $7/year, renews annually
          </p>
        </motion.div>
      </div>
    </div>
  );
}
