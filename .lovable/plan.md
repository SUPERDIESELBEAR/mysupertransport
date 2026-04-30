## Problem

In the **Launch SUPERDRIVE Invite** dialog, only ~3 of the 35 operators are visible and the list does not scroll meaningfully. The dialog is capped at `max-h-[90dvh]` (~800px on the user's viewport), and it stacks six tall sections above the list:

1. Header + intro paragraph (~110px)
2. Audience picker — 3 large cards (~120px)
3. Template picker — 2 large cards (~120px, when shown)
4. Force-resend amber banner (~80px)
5. Filters row + chips (~70px)
6. Selection toolbar (~45px)
7. Footer (~75px)

That leaves only ~150–200px for the operator list — about 3 rows. The list technically scrolls, but the viewport is so small the scrollbar barely appears and users can't tell there's more. The Radix `ScrollArea` is also wrapped with `flex-1 min-h-0`, which works, but the chrome around it is the real space hog.

## Fix

Tighten every section above the list and give the list a guaranteed minimum height so it dominates the dialog regardless of which optional sections are visible.

### Changes to `src/components/management/LaunchSuperdriveDialog.tsx`

1. **Compact the audience picker**
   - Reduce card padding from `p-3` to `p-2.5`, drop the description line to a single short fragment, keep the count inline with the title.
   - Result: ~50px instead of ~120px.

2. **Compact the template picker** (only renders for Pre-existing audience)
   - Same treatment: smaller padding, single-line description.
   - Result: ~50px instead of ~120px.

3. **Compact the force-resend banner**
   - Reduce vertical padding (`py-3` → `py-2`), tighten the inner label spacing, keep wording.
   - Result: ~55px instead of ~80px.

4. **Trim the dialog header**
   - Shorten the description paragraph to one tight line and reduce `pt-6 pb-4` to `pt-5 pb-3`.

5. **Guarantee list height**
   - Wrap the `ScrollArea` in a flex container with `min-h-[320px]` so the list always shows ~7+ rows even when all optional sections are visible.
   - Keep `flex-1 min-h-0` on the ScrollArea itself so it grows when there's extra room.

6. **Make scrollbar more discoverable**
   - Add `pr-2` to the inner `<div className="px-6 py-2">` so the Radix scrollbar track has breathing room and is visually obvious.

### Cache bump

- Bump `public/version.json` so users pull the updated dialog without a hard refresh.

## Out of scope

- No changes to data loading, filtering, audience routing, send logic, or edge function behavior.
- No visual redesign — just denser spacing and a guaranteed list area.

## Acceptance

- Opening **Launch SUPERDRIVE Invite** at 1336×889 shows at least 7 operator rows in the list with a visible, working scrollbar.
- All 35 operators are reachable by scrolling.
- Switching audience/template/filter still works and the list area never collapses below ~320px.
