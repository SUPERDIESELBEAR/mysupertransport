## Anchor popup into header strip; pill sits directly left of the sliders icon

Right now the popup floats below the header. The user wants:
- The **minimize pill** (compact cake + count) to sit **inline within the white header strip**, directly to the left of the notification preferences (sliders) icon.
- The **expanded cards** to drop down from that same anchor point (they're taller than the header, so they extend below it — the anchor is in the header).

### Change (single file)

**`src/components/staff/BirthdayAnniversaryPopup.tsx`**

1. Change `positionClasses` so the container's top edge sits inside the header strip, vertically centered against the icons:
   - `top-2 lg:top-3 right-32 lg:right-44`
   That places the pill's vertical center on the icon row (header is `h-14`/`h-16`, icons are `h-5 w-5` inside `p-2` buttons ≈ 36-40px tall, so top offset of 8-12px centers a ~28px pill).
2. When **minimized**, render only the compact pill (unchanged look) at that anchor — it visually reads as part of the header toolbar.
3. When **expanded**, keep the pill/cards flex-column stack starting at the same anchor; cards extend downward below the header (this is the same as today, just moved up into the header).
4. Keep `z-40` so it stays below the bell dropdown (`z-50`).
5. No dismissal/state changes — X still permanently acknowledges an event; pill count updates immediately; auto-reset already added last turn.

Verification: on the dashboard, confirm the pill sits inline with the header icons, immediately left of the sliders icon, and expanded cards fall directly beneath it.
