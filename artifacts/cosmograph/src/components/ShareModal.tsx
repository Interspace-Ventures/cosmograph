import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Copy, Check, Link2, Share2, Loader2 } from "lucide-react";
import {
  buildShareCard,
  copyImageToClipboard,
  copyShareLink,
  canNativeShareFiles,
  nativeShareCard,
} from "@/lib/share";

export function ShareModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [imageCopied, setImageCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const blobRef = useRef<Blob | null>(null);
  const urlRef = useRef<string | null>(null);
  const imageResetTimer = useRef<number | null>(null);
  const linkResetTimer = useRef<number | null>(null);

  const showNative = canNativeShareFiles();

  // Render the card when the modal opens, then best-effort copy it to the clipboard.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBuilding(true);
    setImageCopied(false);
    setLinkCopied(false);
    setImageUrl(null);
    blobRef.current = null;

    (async () => {
      const blob = await buildShareCard();
      if (cancelled) return;
      blobRef.current = blob;
      if (blob) {
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setImageUrl(url);
        const ok = await copyImageToClipboard(blob);
        if (!cancelled && ok) setImageCopied(true);
      }
      if (!cancelled) setBuilding(false);
    })();

    return () => {
      cancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [open]);

  // Esc closes the modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    return () => {
      if (imageResetTimer.current) window.clearTimeout(imageResetTimer.current);
      if (linkResetTimer.current) window.clearTimeout(linkResetTimer.current);
    };
  }, []);

  const handleCopyImage = async () => {
    if (!blobRef.current) return;
    const ok = await copyImageToClipboard(blobRef.current);
    setImageCopied(ok);
    if (ok) {
      if (imageResetTimer.current) window.clearTimeout(imageResetTimer.current);
      imageResetTimer.current = window.setTimeout(() => setImageCopied(false), 2400);
    }
  };

  const handleCopyLink = async () => {
    const ok = await copyShareLink();
    setLinkCopied(ok);
    if (ok) {
      if (linkResetTimer.current) window.clearTimeout(linkResetTimer.current);
      linkResetTimer.current = window.setTimeout(() => setLinkCopied(false), 2400);
    }
  };

  const handleNativeShare = async () => {
    if (!blobRef.current) return;
    await nativeShareCard(blobRef.current);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] pointer-events-auto"
        >
          <div
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="share-modal-title"
              initial={{ y: 16, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 16, opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 340, damping: 32 }}
              className="custom-scrollbar relative max-h-[90vh] w-full max-w-2xl overflow-y-auto border-2 border-edge bg-bg/95 p-6 backdrop-blur-xl sm:p-8"
            >
              <button
                onClick={onClose}
                aria-label="Close"
                className="absolute top-4 right-4 text-ink-dim transition-colors hover:text-ink"
              >
                <X size={18} />
              </button>

              <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                Share this Cosmograph
              </span>
              <h2
                id="share-modal-title"
                className="mt-1 mb-4 text-xl font-title font-bold tracking-tight text-ink"
              >
                {imageCopied ? "Copied to your clipboard" : "Your shareable card"}
              </h2>

              <div className="relative aspect-[1200/630] w-full overflow-hidden border-2 border-edge bg-[#03030a]">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Cosmograph share card preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-ink-dim">
                    {building ? (
                      <Loader2 size={22} className="animate-spin" />
                    ) : (
                      <span className="font-mono text-[11px] uppercase tracking-widest">
                        Preview unavailable
                      </span>
                    )}
                  </div>
                )}
              </div>

              <p className="mt-3 font-mono text-[11px] leading-relaxed text-ink-dim">
                {imageCopied
                  ? "The image is on your clipboard — paste it straight into a post, chat, or doc."
                  : "Copy the card image and paste it anywhere, or copy the link to this galaxy."}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  onClick={handleCopyImage}
                  disabled={!imageUrl}
                  className="flex items-center gap-1.5 border-2 border-edge bg-white/5 px-3.5 py-2 font-display text-[11px] uppercase tracking-wider text-ink transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  {imageCopied ? (
                    <Check size={13} className="text-accent" />
                  ) : (
                    <Copy size={13} />
                  )}
                  {imageCopied ? "Image copied" : "Copy image"}
                </button>

                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-1.5 border-2 border-edge bg-white/5 px-3.5 py-2 font-display text-[11px] uppercase tracking-wider text-ink transition-colors hover:bg-white/10"
                >
                  {linkCopied ? (
                    <Check size={13} className="text-accent" />
                  ) : (
                    <Link2 size={13} />
                  )}
                  {linkCopied ? "Link copied" : "Copy link"}
                </button>

                {showNative && (
                  <button
                    onClick={handleNativeShare}
                    disabled={!imageUrl}
                    className="flex items-center gap-1.5 border-2 border-accent/50 bg-accent/10 px-3.5 py-2 font-display text-[11px] uppercase tracking-wider text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
                  >
                    <Share2 size={13} />
                    Share…
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
