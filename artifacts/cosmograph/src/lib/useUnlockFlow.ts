import { toast } from "sonner";
import { useAppState } from "@/lib/store";
import {
  accountErrorCode,
  useUnlockResearcherAction,
} from "@/lib/accountApi";

// Shared member "unlock this researcher" flow used by both the Paywall modal and
// the ScreenshotGate. On success it folds the returned entitlement into the
// store (so canExplore flips without a reload); the entitlement read refreshes
// itself (query invalidation on Express, reactivity on Convex). The first few
// researchers are free; beyond that Express charges an immediate prorated
// +$1/year add-on before the row is recorded. On Convex (Phase 3, PR #12's
// model) the add-on is retired: members pin researchers up to an abuse bound
// (UNLOCK_LIMIT), and non-members go through membership checkout.
export function useUnlockFlow() {
  const { setEntitlement } = useAppState();
  const action = useUnlockResearcherAction();

  const unlock = (author: string, label: string, onDone?: () => void) => {
    action.run(author).then(
      (res) => {
        setEntitlement(res);
        toast.success(`Unlocked ${label}'s galaxy — explore away.`);
        onDone?.();
      },
      (err: unknown) => {
        const code = accountErrorCode(err);
        toast.error(
          code === "HTTP_402"
            ? "We couldn't complete the add-on charge — check your payment method and try again."
            : code === "ADDON_UNAVAILABLE"
              ? "Adding more researchers isn't available yet. Your included slots are full."
              : code === "UNLOCK_LIMIT"
                ? "You've reached the researcher limit for one account."
                : code === "NOT_A_MEMBER"
                ? "An active membership is required to unlock researchers."
                : "Couldn't unlock this researcher. Please try again.",
        );
      },
    );
  };

  return { unlock, unlocking: action.isPending };
}
