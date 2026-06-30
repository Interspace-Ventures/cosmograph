---
name: Ship types monetization
description: How premium ship TYPES are claimed/bought and the equip-parity rule between the free and paid paths.
---

# Ship types ("skins") monetization

Premium ship TYPES (fighter/hauler/interceptor; scout is free) are the purchasable unit.
SKU shape is `type:<id>` (leaves room for future `color:<pack>`). Members get N free
type-claims (slots); beyond that, or for non-members, a type is a **$1 one-time** Stripe
checkout (`mode:"payment"`, not the recurring membership). Colors stay free on any owned type.

## Equip-parity rule (the trap)
Both acquisition paths must **auto-equip** the newly-owned type, or the two paths feel
inconsistent:
- **Free member-slot claim** equips immediately client-side.
- **Paid checkout confirm** must equip server-side too: `confirmSkin` records the unlock
  AND upserts `users.ship_type` to the purchased type, so the `getShip` it returns reflects
  the new type. Without that write, confirm returns the *old* saved type (usually scout) and
  the buyer is silently not switched to what they just paid for.

**Why:** confirm returns `getShip(userId)`, which mirrors the saved `users.ship_type`. The
client equips `res.shipType`, so if the server didn't move ship_type, the equip is a no-op.

**How to apply:** any new paid-cosmetic confirm path should set the owned/equipped state on
the server before returning the refreshed state — don't rely on the client to infer "what was
just bought" from a redirect that only carries a session id.

## Redirect handshake
Skin checkout uses `skin_unlocked=1`/`skin_cancelled=1` + `session_id` query params (distinct
from the researcher-unlock `unlocked`/`unlock_cancelled`). ShipBridge confirms via
useConfirmSkin, mirroring EntitlementBridge. Server is authoritative for ownership: `saveShip`
rejects equipping a premium type the account doesn't own.
