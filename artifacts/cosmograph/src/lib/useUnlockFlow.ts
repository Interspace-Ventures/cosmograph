import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useUnlockResearcher,
  getGetEntitlementQueryKey,
} from "@workspace/api-client-react";
import { useAppState } from "@/lib/store";

// Shared member "unlock this researcher" flow used by both the Paywall modal and
// the ScreenshotGate. On success it folds the returned entitlement into the
// store (so canExplore flips without a reload) and refreshes the cached
// entitlement query. The first few researchers are free; beyond that the server
// charges an immediate prorated +$1/year add-on before the row is recorded.
export function useUnlockFlow() {
  const { setEntitlement } = useAppState();
  const queryClient = useQueryClient();
  const mutation = useUnlockResearcher();

  const unlock = (author: string, label: string, onDone?: () => void) =>
    mutation.mutate(
      { data: { author } },
      {
        onSuccess: (res) => {
          setEntitlement(res);
          void queryClient.invalidateQueries({
            queryKey: getGetEntitlementQueryKey(),
          });
          toast.success(`Unlocked ${label}'s galaxy — explore away.`);
          onDone?.();
        },
        onError: (err) => {
          const status = (err as { status?: number })?.status;
          toast.error(
            status === 402
              ? "We couldn't complete the add-on charge — check your payment method and try again."
              : "Couldn't unlock this researcher. Please try again.",
          );
        },
      },
    );

  return { unlock, unlocking: mutation.isPending };
}
