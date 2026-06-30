import { useState } from "react";
import { Show, UserButton } from "@clerk/react";
import {
  ShieldCheck,
  Sparkles,
  Shuffle,
  Check,
  Rocket,
  Lock,
  Crown,
} from "lucide-react";
import { toast } from "sonner";
import {
  useSaveShip,
  useClaimSkin,
  getGetShipQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppState } from "@/lib/store";
import { shipLookFromSeed } from "@/lib/shipLook";
import { SHIP_TYPES } from "@/lib/shipTypes";

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
        <ShipCustomizer />
      </div>
    </Show>
  );
}

// The signed-in ship customizer: pick a TYPE (the procedural hull family) and a
// COLOR (free, via the seed shuffle), preview it live in the galaxy, then Save.
// A premium type must be owned to equip — unowned ones show a lock with the
// claim/price action. Save persists the equipped seed + type so the ship follows
// the account across devices and is broadcast to other cosmonauts.
function ShipCustomizer() {
  const {
    shipSeed,
    shuffleShip,
    savedShipSeed,
    setSavedShipSeed,
    shipTypeId,
    setShipTypeId,
    savedShipType,
    setSavedShipType,
    ownedShipTypes,
    setOwnedShipTypes,
    freeShipSlotsRemaining,
    setFreeShipSlotsRemaining,
    activeAuthorId,
  } = useAppState();
  const queryClient = useQueryClient();
  const save = useSaveShip();
  const claim = useClaimSkin();
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const look = shipLookFromSeed(shipSeed);
  const dirty = shipSeed !== savedShipSeed || shipTypeId !== savedShipType;

  const onSave = () => {
    save.mutate(
      { data: { seed: shipSeed, type: shipTypeId } },
      {
        onSuccess: (res) => {
          setSavedShipSeed(res.shipSeed ?? null);
          setSavedShipType(res.shipType ?? null);
          setOwnedShipTypes(res.ownedTypes ?? ["scout"]);
          setFreeShipSlotsRemaining(res.freeSlotsRemaining ?? 0);
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

  // Claim (free member slot) or check out ($1) an unowned premium type. A free
  // grant equips it immediately; a paid one redirects to Stripe Checkout.
  const onClaim = (typeId: string) => {
    setClaimingId(typeId);
    claim.mutate(
      { data: { type: typeId, author: activeAuthorId } },
      {
        onSuccess: (res) => {
          if (res.url) {
            window.location.href = res.url; // off to Stripe Checkout
            return;
          }
          // Free claim (member slot) or already owned: equip + refresh state.
          setOwnedShipTypes([...new Set([...ownedShipTypes, typeId])]);
          if (res.granted) {
            setFreeShipSlotsRemaining(Math.max(0, freeShipSlotsRemaining - 1));
            toast.success("Ship type claimed — included with your membership.");
          }
          setShipTypeId(typeId);
          void queryClient.invalidateQueries({
            queryKey: getGetShipQueryKey(),
          });
          setClaimingId(null);
        },
        onError: () => {
          toast.error("Ship store is unavailable right now. Please try again.");
          setClaimingId(null);
        },
      },
    );
  };

  const memberFreeAvailable = freeShipSlotsRemaining > 0;

  return (
    <div className="flex flex-col gap-3 border-2 border-edge bg-white/5 px-2 py-2">
      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-dim">
        <Rocket size={12} /> Your ship
      </span>

      {/* Ship TYPE grid — equip an owned type, or claim/buy a locked one. */}
      <div className="grid grid-cols-2 gap-1.5">
        {SHIP_TYPES.map((type) => {
          const owned = ownedShipTypes.includes(type.id);
          const equipped = shipTypeId === type.id;
          const claiming = claimingId === type.id;
          const priceLabel = type.premium
            ? memberFreeAvailable
              ? "Included"
              : "$1"
            : "Free";
          return (
            <button
              key={type.id}
              onClick={() => (owned ? setShipTypeId(type.id) : onClaim(type.id))}
              disabled={claiming}
              className={`flex flex-col items-start gap-1 border-2 px-2 py-1.5 text-left transition-colors disabled:cursor-wait ${
                equipped
                  ? "border-accent bg-accent/10"
                  : "border-edge hover:border-accent/60"
              }`}
            >
              <span className="flex w-full items-center justify-between gap-1">
                <span className="font-mono text-[11px] uppercase tracking-wide text-ink">
                  {type.name}
                </span>
                {owned ? (
                  equipped ? (
                    <Check size={11} className="shrink-0 text-accent" />
                  ) : null
                ) : (
                  <Lock size={10} className="shrink-0 text-ink-dim" />
                )}
              </span>
              <span
                className={`flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest ${
                  type.premium ? "text-accent" : "text-ink-dim"
                }`}
              >
                {type.premium && <Crown size={8} />}
                {claiming
                  ? "…"
                  : owned
                    ? equipped
                      ? "Equipped"
                      : "Owned"
                    : priceLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* COLOR — free on any owned type; shuffles the per-ship look seed. */}
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
          <Shuffle size={12} /> Color
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
