import { useEffect, useRef } from "react";
import { useAppSession } from "@/lib/session";
import { useClaimReferralAction } from "@/lib/accountApi";
import {
  readReferralParam,
  stripReferralParam,
  getPendingReferral,
  setPendingReferral,
  clearPendingReferral,
} from "@/lib/referral";

// Captures a `?ref=<code>` link before sign-up and, once the visitor signs in,
// claims it so a brand-new account is attributed to the referrer. Renders
// nothing. Degrades silently: if the server is unreachable the galaxy is
// unaffected and the pending code is simply cleared after the attempt.
export function ReferralBridge() {
  const { isLoaded, isSignedIn } = useAppSession();
  const claim = useClaimReferralAction();
  const claimedRef = useRef(false);

  // On first load, stash any ref code and clean it out of the URL.
  useEffect(() => {
    const code = readReferralParam();
    if (code) {
      setPendingReferral(code);
      stripReferralParam();
    }
  }, []);

  // Once signed in, attribute the pending referral. The claim is idempotent and
  // best-effort server-side, so we only forget the code on a real response (a
  // 2xx — meaning the server processed it, whether it attributed or judged the
  // account ineligible). A transient failure (offline / 503) keeps the code so
  // the next authenticated load retries it, rather than silently losing a valid
  // signup. `claimedRef` keeps it to one in-flight attempt per mount.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || claimedRef.current) return;
    const code = getPendingReferral();
    if (!code) return;
    claimedRef.current = true;
    claim.run(code).then(
      () => clearPendingReferral(),
      () => {
        // Leave the pending code in place and allow a retry next mount.
        claimedRef.current = false;
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  return null;
}
