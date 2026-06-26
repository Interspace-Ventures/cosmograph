import { Show, UserButton } from "@clerk/react";
import { ShieldCheck, Sparkles, Shuffle, Check, Rocket } from "lucide-react";
import { toast } from "sonner";
import {
  useSaveShip,
  getGetShipQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppState } from "@/lib/store";
import { shipLookFromSeed } from "@/lib/shipLook";

// Lightweight auth state in the console: when signed-out it renders nothing
// (Personalize is the single upgrade entry point), and when signed-in it shows
// Clerk's UserButton (avatar + sign-out menu) plus whether the account has the
// global unlock. Renders nothing about the default scientist — that experience
// is free and account-agnostic.
export function AccountIndicator() {
  const { entitled } = useAppState();

  return (
    <Show when="signed-in">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 border-2 border-edge bg-white/5 px-2 py-1.5">
          <UserButton />
          <span
            className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest ${
              entitled ? "text-accent" : "text-ink-dim"
            }`}
          >
            {entitled ? <ShieldCheck size={12} /> : <Sparkles size={12} />}
            {entitled ? "Full access" : "Free preview"}
          </span>
        </div>
        <ShipSaver />
      </div>
    </Show>
  );
}

// Save-your-ship control for signed-in accounts. The seed (and therefore the
// ship's look) is shuffled locally for an instant preview in the galaxy; Save
// persists it so it follows the account across devices and is broadcast to other
// cosmonauts in real time.
function ShipSaver() {
  const { shipSeed, shuffleShip, savedShipSeed, setSavedShipSeed } =
    useAppState();
  const queryClient = useQueryClient();
  const save = useSaveShip();

  const look = shipLookFromSeed(shipSeed);
  const dirty = shipSeed !== savedShipSeed;

  const onSave = () => {
    save.mutate(
      { data: { seed: shipSeed } },
      {
        onSuccess: (res) => {
          setSavedShipSeed(res.shipSeed);
          void queryClient.invalidateQueries({
            queryKey: getGetShipQueryKey(),
          });
          toast.success("Ship saved — other cosmonauts see it now.");
        },
        onError: () => {
          toast.error("Couldn't save your ship. Please try again.");
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-2 border-2 border-edge bg-white/5 px-2 py-2">
      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-dim">
        <Rocket size={12} /> Your ship
      </span>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-5 w-5 shrink-0 rounded-full border border-edge"
          style={{
            background: `radial-gradient(circle at 30% 30%, ${look.accent}, ${look.hull} 60%, ${look.glow})`,
          }}
        />
        <button
          onClick={shuffleShip}
          className="flex flex-1 items-center justify-center gap-1.5 border-2 border-edge px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink transition-colors hover:border-accent hover:text-accent"
        >
          <Shuffle size={12} /> Shuffle
        </button>
        <button
          onClick={onSave}
          disabled={!dirty || save.isPending}
          className="flex flex-1 items-center justify-center gap-1.5 border-2 border-accent/60 bg-accent/10 px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:border-edge disabled:bg-transparent disabled:text-ink-dim"
        >
          <Check size={12} />
          {save.isPending ? "Saving" : dirty ? "Save" : "Saved"}
        </button>
      </div>
    </div>
  );
}

// Compact variant for the collapsed rail: just the avatar when signed-in.
export function AccountIndicatorRail() {
  return (
    <Show when="signed-in">
      <div className="flex h-9 w-9 items-center justify-center">
        <UserButton />
      </div>
    </Show>
  );
}
