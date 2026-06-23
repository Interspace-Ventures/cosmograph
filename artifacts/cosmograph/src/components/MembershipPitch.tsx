import { Lock } from "lucide-react";
import { useAppState } from "@/lib/store";

// The membership headline + description shared by the Paywall modal and the
// ScreenshotGate. Its copy adapts to the three states:
//   • signed-out / non-member → "$7/year, includes 3 researchers"
//   • member with a free slot  → "uses 1 of your N included researchers"
//   • member past the included slots → "add this researcher for +$1/year"
export function MembershipPitch() {
  const { entitled, unlockedAuthors, includedSlots, activeAuthorLabel } =
    useAppState();
  const remaining = Math.max(0, includedSlots - unlockedAuthors.length);
  const isPaidSlot = unlockedAuthors.length >= includedSlots;

  return (
    <>
      <div className="flex items-center gap-2.5">
        <div className="grid h-10 w-10 shrink-0 place-items-center border-2 border-accent/60 bg-accent/10 text-accent">
          <Lock size={18} />
        </div>
        <div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
            {entitled ? "Membership · add a researcher" : "Membership · $7 / year"}
          </span>
          <h2 className="text-xl font-title font-bold leading-tight tracking-tight text-ink">
            Unlock {activeAuthorLabel}'s galaxy
          </h2>
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
        {entitled ? (
          isPaidSlot ? (
            <>
              You're a member. Add{" "}
              <span className="text-ink">{activeAuthorLabel}</span> to your
              collection for an extra <span className="text-ink">$1/year</span>,
              prorated for the rest of your billing year.
            </>
          ) : (
            <>
              You're a member. Unlocking{" "}
              <span className="text-ink">{activeAuthorLabel}</span> uses 1 of your{" "}
              <span className="text-ink">{includedSlots}</span> included
              researchers — <span className="text-ink">{remaining}</span> left.
            </>
          )
        ) : (
          <>
            This is a preview of{" "}
            <span className="text-ink">{activeAuthorLabel}</span>'s cosmograph.
            Membership is <span className="text-ink">$7/year</span> and includes{" "}
            <span className="text-ink">3 researchers</span> — add more anytime for
            $1/year each.
          </>
        )}
      </p>
    </>
  );
}
