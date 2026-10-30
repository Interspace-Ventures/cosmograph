import { useRef, useState } from "react";
import { Check, Copy, UserPlus } from "lucide-react";
import { useAppSession } from "@/lib/session";
import { useReferralData } from "@/lib/accountApi";
import { buildReferralLink } from "@/lib/referral";

// The "invite friends" block shown inside the Share modal. Signed-in accounts
// get their personal referral link + a running count; signed-out visitors get a
// gentle CTA to create a free account (which is what makes referrals trackable).
export function InviteSection({ open }: { open: boolean }) {
  const { isLoaded, isSignedIn, openSignIn } = useAppSession();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  const data = useReferralData(open && isLoaded && isSignedIn);

  const link = data ? buildReferralLink(data.code) : "";

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setCopied(false), 2400);
    } catch {
      /* clipboard blocked */
    }
  };

  // Still resolving auth — render nothing to avoid a flash of the wrong state.
  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <div className="mt-6 border-t-2 border-edge pt-5">
        <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
          Invite friends
        </span>
        <h3 className="mt-1 text-sm font-title font-bold text-ink">
          Get your own invite link
        </h3>
        <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-ink-dim">
          Create a free account to get a personal invite link — and see how many
          explorers you bring to Cosmograph.
        </p>
        <button
          onClick={openSignIn}
          className="mt-3 flex items-center gap-1.5 border-2 border-accent/50 bg-accent/10 px-3.5 py-2 font-display text-[11px] uppercase tracking-wider text-accent transition-colors hover:bg-accent/20"
        >
          <UserPlus size={13} />
          Sign in / sign up
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t-2 border-edge pt-5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
        Invite friends
      </span>
      <h3 className="mt-1 text-sm font-title font-bold text-ink">
        Your invite link
      </h3>
      <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-ink-dim">
        Share this link — when someone signs up through it, they're counted as
        your referral.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={link}
          placeholder={data ? "" : "Loading…"}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 border-2 border-edge bg-black/30 px-3 py-2 font-mono text-[11px] text-ink-dim focus:text-ink"
        />
        <button
          onClick={handleCopy}
          disabled={!link}
          className="flex items-center gap-1.5 border-2 border-edge bg-white/5 px-3.5 py-2 font-display text-[11px] uppercase tracking-wider text-ink transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          {copied ? (
            <Check size={13} className="text-accent" />
          ) : (
            <Copy size={13} />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {data && (
        <p className="mt-2 font-mono text-[11px] text-ink-dim">
          <span className="text-ink">{data.referredCount}</span>{" "}
          {data.referredCount === 1 ? "explorer has" : "explorers have"} joined
          through your link.
        </p>
      )}
    </div>
  );
}
