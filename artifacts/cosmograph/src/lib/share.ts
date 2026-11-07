import { galaxyData } from "@/data/galaxy";
import { SITE } from "@/config/site";

// A reference to the live WebGL canvas, registered by Scene on create. We capture
// from it directly (the renderer runs with preserveDrawingBuffer) so a share grabs
// exactly what the visitor is looking at right now.
let galaxyCanvas: HTMLCanvasElement | null = null;

export function setGalaxyCanvas(el: HTMLCanvasElement | null): void {
  galaxyCanvas = el;
}

const CARD_W = 1200;
const CARD_H = 630;

const TITLE_FONT = "'Bricolage Grotesque Variable', 'Bricolage Grotesque', sans-serif";
const MONO_FONT = "'Space Mono', monospace";

type CtxLS = CanvasRenderingContext2D & { letterSpacing?: string };

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function setTracking(ctx: CanvasRenderingContext2D, value: string): void {
  (ctx as CtxLS).letterSpacing = value;
}

function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  family: string,
  maxWidth: number,
  startPx: number,
  minPx: number,
): number {
  let px = startPx;
  while (px > minPx) {
    ctx.font = `${weight} ${px}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= 2;
  }
  return px;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "galaxy"
  );
}

export function getShareUrl(): string {
  return typeof window !== "undefined" ? window.location.href : `https://${SITE.domain}`;
}

export function getShareText(): string {
  return `Explore ${galaxyData.author.name}'s life in science as an interactive galaxy.`;
}

// Encode a 2D canvas to a PNG blob without ever throwing. A canvas tainted by a
// cross-origin source makes toBlob throw synchronously — we swallow that and
// resolve null so the caller can fall back instead of hanging on a rejection.
function toBlobSafe(card: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      card.toBlob((b) => resolve(b), "image/png");
    } catch {
      resolve(null);
    }
  });
}

// Paint the branded card: optionally the live galaxy view, then the scrims,
// wordmark, researcher name, and headline stats. Drawing the WebGL canvas can
// taint the 2D card (a cross-origin texture in the scene), which is why
// `includeGalaxy` exists — buildShareCard re-renders without it as a fallback.
function drawCard(ctx: CanvasRenderingContext2D, includeGalaxy: boolean): void {
  const bg = cssVar("--bg", "#272933");
  const ink = cssVar("--ink", "#e6e6e6");
  const dim = cssVar("--ink-dim", "#9da0ab");
  const accent = cssVar("--accent", "#a388ee");

  // Deep-space base in case the screenshot is missing or letterboxed.
  ctx.fillStyle = "#03030a";
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // The galaxy itself, cover-fit so it fills the card edge to edge.
  if (includeGalaxy && galaxyCanvas && galaxyCanvas.width > 0 && galaxyCanvas.height > 0) {
    const src = galaxyCanvas;
    const scale = Math.max(CARD_W / src.width, CARD_H / src.height);
    const dw = src.width * scale;
    const dh = src.height * scale;
    const dx = (CARD_W - dw) / 2;
    const dy = (CARD_H - dh) / 2;
    try {
      ctx.drawImage(src, dx, dy, dw, dh);
    } catch {
      /* canvas unreadable — keep the deep-space base */
    }
  }

  // Scrims so the wordmark (top) and stats (bottom) stay legible over the scene.
  const top = ctx.createLinearGradient(0, 0, 0, CARD_H * 0.32);
  top.addColorStop(0, "rgba(3,3,10,0.65)");
  top.addColorStop(1, "rgba(3,3,10,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, CARD_W, CARD_H * 0.32);

  const bottom = ctx.createLinearGradient(0, CARD_H * 0.42, 0, CARD_H);
  bottom.addColorStop(0, "rgba(3,3,10,0)");
  bottom.addColorStop(1, `${bg}f2`);
  ctx.fillStyle = bottom;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const PAD = 56;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // Wordmark.
  ctx.font = `700 34px ${TITLE_FONT}`;
  ctx.fillStyle = accent;
  ctx.fillText("✦", PAD, 76);
  const star = ctx.measureText("✦").width;
  ctx.fillStyle = ink;
  ctx.fillText("Cosmograph", PAD + star + 16, 76);

  // Kicker.
  ctx.font = `400 18px ${MONO_FONT}`;
  ctx.fillStyle = accent;
  setTracking(ctx, "4px");
  ctx.fillText("A LIFE IN SCIENCE", PAD, CARD_H - 214);
  setTracking(ctx, "0px");

  // Researcher name (shrinks to fit the card width).
  const name = galaxyData.author.name;
  const namePx = fitFont(ctx, name, 700, TITLE_FONT, CARD_W - PAD * 2, 68, 40);
  ctx.font = `700 ${namePx}px ${TITLE_FONT}`;
  ctx.fillStyle = ink;
  ctx.fillText(name, PAD, CARD_H - 150);

  // Headline stats as punchy value/label columns.
  const stats = galaxyData.stats;
  const cols = [
    { value: stats.totalPapers.toLocaleString(), label: "PAPERS" },
    { value: stats.totalCitations.toLocaleString(), label: "CITATIONS" },
    { value: String(galaxyData.domains.length), label: "DOMAINS" },
    { value: String(stats.yearsActive), label: "YEARS" },
  ];

  const valueY = CARD_H - 76;
  const labelY = CARD_H - 50;
  let x = PAD;
  for (const c of cols) {
    ctx.font = `700 44px ${TITLE_FONT}`;
    ctx.fillStyle = ink;
    ctx.fillText(c.value, x, valueY);
    const vw = ctx.measureText(c.value).width;

    ctx.font = `400 15px ${MONO_FONT}`;
    ctx.fillStyle = dim;
    setTracking(ctx, "2px");
    ctx.fillText(c.label, x, labelY);
    const lw = ctx.measureText(c.label).width;
    setTracking(ctx, "0px");

    x += Math.max(vw, lw) + 46;
  }

  // Domain, bottom-right.
  ctx.font = `400 18px ${MONO_FONT}`;
  ctx.fillStyle = dim;
  ctx.textAlign = "right";
  ctx.fillText(SITE.domain, CARD_W - PAD, CARD_H - 50);
  ctx.textAlign = "left";
}

function newCard(): HTMLCanvasElement {
  const card = document.createElement("canvas");
  card.width = CARD_W;
  card.height = CARD_H;
  return card;
}

// Compose the rich share card: the current galaxy view + headline stats, styled
// to match the app so it reads as a single branded artifact when shared. Returns
// a PNG blob (PNG is the format browsers accept for clipboard image writes).
//
// Two-pass so a share NEVER silently produces nothing: first try with the live
// galaxy composited in; if that canvas is tainted/unencodable, recompose the
// branded stats card WITHOUT the galaxy so there's always an image.
export async function buildShareCard(): Promise<Blob | null> {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* fonts API unavailable — fall back to whatever is loaded */
    }
  }

  const withGalaxy = newCard();
  const ctx = withGalaxy.getContext("2d");
  if (!ctx) return null;
  drawCard(ctx, true);
  const blob = await toBlobSafe(withGalaxy);
  if (blob) return blob;

  // Fallback: the live galaxy tainted the card (or encoding failed) — render the
  // branded card on its own so the visitor still gets a shareable image.
  const plain = newCard();
  const pctx = plain.getContext("2d");
  if (!pctx) return null;
  drawCard(pctx, false);
  return toBlobSafe(plain);
}

/** Download the rendered card image as a PNG file. */
export function downloadShareCard(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cosmograph-${slugify(galaxyData.author.name)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copy the rendered card image to the clipboard. Returns false if unsupported/blocked. */
export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
  try {
    if (typeof ClipboardItem === "undefined") return false;
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (!nav?.clipboard?.write) return false;
    await nav.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    return true;
  } catch {
    return false;
  }
}

/** Copy the shareable link to the clipboard. Returns false if unsupported/blocked. */
export async function copyShareLink(): Promise<boolean> {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (!nav?.clipboard?.writeText) return false;
  try {
    await nav.clipboard.writeText(getShareUrl());
    return true;
  } catch {
    return false;
  }
}

/** Whether the native share sheet can take the image file (mostly mobile). */
export function canNativeShareFiles(): boolean {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (!nav || typeof nav.canShare !== "function") return false;
  try {
    const probe = new File([new Blob()], "probe.png", { type: "image/png" });
    return nav.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export type NativeShareOutcome = "shared" | "cancelled" | "error";

/** Open the OS share sheet with the card image attached. */
export async function nativeShareCard(blob: Blob): Promise<NativeShareOutcome> {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (!nav || typeof nav.share !== "function") return "error";
  const file = new File([blob], `cosmograph-${slugify(galaxyData.author.name)}.png`, {
    type: blob.type,
  });
  try {
    if (typeof nav.canShare === "function" && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title: "Cosmograph", text: getShareText(), url: getShareUrl() });
    } else {
      await nav.share({ title: "Cosmograph", text: getShareText(), url: getShareUrl() });
    }
    return "shared";
  } catch (e) {
    if ((e as DOMException)?.name === "AbortError") return "cancelled";
    return "error";
  }
}
