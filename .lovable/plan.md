# Add MS Fleet Fuel Card Instructions to the Resource Center

The Resource Center on both the driver-facing Resources tab and the staff **Services** tab reads from the `services` / `service_resources` tables, so adding one service with two resources publishes it in both places automatically — no component changes required.

The existing hidden **Comdata Fuel Card** service is left untouched.

## What will change

**1. New service: "MS Fleet Fuel Card Instructions"**
- `is_visible = true`, `is_new_driver_essential = true`
- Description: "How to fuel your truck using the MS Fleet card and app."
- `sort_order`: placed near the top of the essentials list.

**2. Setup Guide resource** — "How to Fuel with the MS Fleet Card (Step-by-Step)"
- `resource_type = 'Setup Guide'`, `is_start_here = true`, `estimated_minutes = 3`
- Body (markdown, rendered by existing `ResourceViewer`):

> **Before you start**
> Every MS Fleet transaction needs a fresh 6-digit one-time PIN from the MS Fleet app. The PIN is only good for **4 minutes**, so generate it at the counter — not out in the truck.
>
> **Step-by-step**
> 1. **Go inside** to the fuel desk. Do **not** use the pump keypad.
> 2. Have two things ready: your **phone open to the MS Fleet app**, and your **MS Fleet card** in your other hand.
> 3. Hand the card to the cashier when they're ready. They'll swipe it.
> 4. The cashier will ask for your **"Driver ID."** That's the **one-time PIN** from the app.
> 5. In the MS Fleet app, tap the **lock icon** at the bottom of the screen.
> 6. A **6-digit PIN** appears. Read it to the cashier right away (it expires in 4 minutes).
> 7. If asked, give your **truck number**.
> 8. The cashier may ask for other info to fill their screen — you don't need to track it.
> 9. **Watch the pump.** Confirm it turns on after the card is authorized *before* you start pumping. If the card wasn't accepted and you pump anyway, you could be stuck paying out of pocket for a full tank.

**3. FAQ resource** — "MS Fleet Card — Quick Answers"
- `resource_type = 'FAQ'`, `is_start_here = false`, `estimated_minutes = 2`
- Body:

> **Do I need a new PIN every time?**
> Yes. A one-time PIN is required for every MS Fleet transaction.
>
> **How long is the PIN good for?**
> 4 minutes. If it expires, tap the lock icon again for a new one.
>
> **Can I use the card at the pump?**
> No. Always go inside to the fuel desk.
>
> **What if the cashier asks for a "Driver ID"?**
> They mean the 6-digit one-time PIN from the MS Fleet app.
>
> **What if the card is declined?**
> Stop — do not pump. Contact dispatch before trying another card.
>
> **What info do I need to give besides the PIN?**
> Just your truck number. The cashier may ask for other fields to fill their screen; you don't need to track those.

## Wording notes for your review

- Original mixed steps with warnings; I split them so drivers can scan the numbered list at the counter and keep the "watch the pump" caution as its own high-visibility step (#9).
- Renamed the "Driver ID" moment to explicitly tie it to the one-time PIN, since that's the single most common point of confusion.
- Removed "you may find out after pumping $600 of fuel" (kept the substance, dropped the dollar figure so it doesn't age).
- Moved the "PIN needed every time" line to the top as a **Before you start** callout, since drivers who miss it are the ones who get stuck.

Happy to adjust tone, add photos/screenshots later, or wire in a phone/support contact for the service card once you have one.

## Technical details

- One `INSERT` for the service, two `INSERT`s for the resources — done through the insert tool (data change, not schema).
- No migration, no code changes, no RLS updates.
