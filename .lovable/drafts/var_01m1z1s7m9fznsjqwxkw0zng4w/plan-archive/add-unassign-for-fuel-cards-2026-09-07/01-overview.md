# Add "Unassign" for fuel cards

You are right — that option does not exist for fuel cards today. I checked the Fuel Cards screen: the green **Return** button (the one with "Good — Available to Reissue") is deliberately hidden for fuel cards. For a fuel card the only actions are History, Edit, and Deactivate, and Deactivate archives the card so it can never be issued again.

That is why card 212 has no way back into available inventory. My earlier instructions assumed a button that isn't there.

## What to build

Give an assigned fuel card an **Unassign** action that takes it off the driver and puts it straight back into Unassigned Inventory, ready to reissue.

- Shows only on fuel cards that are currently assigned, next to Deactivate.
- One confirmation step, plus an optional note (same feel as the Deactivate box).
- On confirm: the driver's assignment is closed with today's date and marked "Good — Available to Reissue", the card moves to Available, and the card number is cleared from the driver's equipment record.
- Deactivate keeps its current meaning: retire the card for good.
- Damaged / Not Returned stay out of the fuel card flow — a card that never left the office is simply unassigned.

## For Ali and card 212

Once this is in place: open Fuel Cards, **Unassign** card 212 from Ali, then **Assign** card 224 to him the same day. 212 lands back in Unassigned Inventory. Since no fuel charges have hit 212 under Ali, nothing financial changes.
