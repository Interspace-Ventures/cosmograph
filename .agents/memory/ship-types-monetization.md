---
name: Ship types
description: Premium ship types are included with membership; no per-ship purchases.
---

# Ship types

Premium ship TYPES (fighter, hauler, interceptor; scout is free) are included
with membership as of the billing rebuild. The $1 per-ship checkout is removed.

- Members own every premium type (`getShip` returns all); claiming one as a
  member records ownership and equips it server-side (`users.ship_type`).
- Non-members fly scout; claiming a premium type returns 402.
- Ships bought under the old $1 model stay owned (`ship_unlocks` rows).
- On lapse, ships revert to the default (product rule).
- Equip rule still applies: any grant path must set the equipped type on the
  server before returning state, or the client keeps the old type.
- Client copy in `AccountIndicator.tsx` still says "$1"; update it with the
  billing UI work.
