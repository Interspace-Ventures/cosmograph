/**
 * Behind the EXO staging gateway the visitor has already signed in to Exo
 * before Cosmograph loads, so a "Continue with Exo" card would be a dead-end
 * second step (Universe #33). The sign-in page starts the Exo handoff on its
 * own instead; Exo already holds the session, so it comes straight back.
 *
 * Loop guard: if the handoff keeps returning here (Exo refused, a callback
 * failed), stop after a couple of tries in a short window and show the button.
 */
export const AUTO_SIGN_IN_KEY = "cosmograph.autoSignIn.attempts";
export const AUTO_SIGN_IN_WINDOW_MS = 60_000;
export const AUTO_SIGN_IN_MAX_ATTEMPTS = 2;

type KeyValue = Pick<Storage, "getItem" | "setItem">;

function recentAttempts(storage: KeyValue, now: number): number[] {
  try {
    const raw = JSON.parse(storage.getItem(AUTO_SIGN_IN_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((t): t is number => typeof t === "number" && now - t >= 0 && now - t < AUTO_SIGN_IN_WINDOW_MS);
  } catch {
    return [];
  }
}

/** True (and records the attempt) when the sign-in page may hand off to Exo without a click. */
export function claimAutoSignIn(storage: KeyValue, now: number = Date.now()): boolean {
  const attempts = recentAttempts(storage, now);
  if (attempts.length >= AUTO_SIGN_IN_MAX_ATTEMPTS) return false;
  try {
    storage.setItem(AUTO_SIGN_IN_KEY, JSON.stringify([...attempts, now]));
  } catch {
    return false;
  }
  return true;
}
