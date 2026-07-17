## Reposition birthday/anniversary popup left of the notification preferences icon

Currently the popup sits at `top-14 lg:top-16 right-16 lg:right-20`, which lands it just under the notification bell. The user wants it moved further left so it sits to the left of the **notification preferences (sliders) icon** in the header — the leftmost of the three header icons (prefs, refresh, bell). The minimized cake badge should sit in that same spot. Dismissing a popup with the X should also remove that event from the minimized badge (currently, minimizing hides the cards but the badge still counts dismissed events after re-expand — dismiss should be permanent per event, which it already is via `acknowledge`; we just need to make sure the minimized state auto-clears when all events are dismissed).

### Changes

**`src/components/staff/BirthdayAnniversaryPopup.tsx`**

1. Update `positionClasses` to clear all three header icons (prefs + refresh + bell ≈ 3 × 40px + padding):
   - Mobile: `top-14 right-32`
   - Desktop: `lg:top-16 lg:right-44`
2. Keep the same compact card + minimize behavior.
3. Auto-reset `minimized` to `false` when `events.length === 0` so the pill disappears after the last dismissal (safety — `if (events.length === 0) return null` already covers render, but resetting state prevents a stale pill if events re-appear).
4. When the user clicks X on the last visible card while minimized, ensure the pill count updates immediately — this already works via `acknowledge`, no change needed beyond the reset above.

No other files change. Verification: view the dashboard, confirm the popup and its minimized pill both sit to the left of the sliders icon, and dismissing all events removes both the cards and the pill.
