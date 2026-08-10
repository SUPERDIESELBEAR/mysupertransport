# Fix the On Hold section clipping on the Onboarding Pipeline

## What's happening

Each On Hold row is a single horizontal flex row whose items are all set to never shrink: name, submitted/approved/PE date chips, "Since" date, reason, the full 9-node stage track, archive icon, and "Open". The section wrapper uses `overflow-hidden`, so anything wider than the panel is simply cut off with no way to scroll to it. That's why the stage track and percentage on the right are sliced off and side-to-side scrolling does nothing.

The same pattern is used by the "Active / Open" section directly above it, so it has the same clipping risk.

## The fix

1. **Let On Hold rows wrap instead of clip** — the row becomes a wrapping layout: name + date chips on the first line, and the stage track / actions allowed to drop to the next line on narrower screens. Nothing gets cut off and no horizontal scrollbar is needed.
2. **Keep the stage track intact** — where the row is still too narrow for the full 9-node track, the track itself gets its own horizontally scrollable strip (only the track scrolls, not the page), so all stages BG → Pay plus the percentage stay reachable.
3. **Remove the clipping** on the section wrapper so nothing is silently hidden, while keeping the rounded-card look.
4. **Apply the same treatment to the Active / Open section** so both collapsible sections behave consistently at the same widths.

No data, filter, or business logic changes — layout only.

## Technical notes

- `src/pages/staff/PipelineDashboard.tsx`
  - On Hold row (~line 3473): `flex items-center gap-4` → wrapping row with `min-w-0` on the text/reason group; the reason keeps its truncation + tooltip.
  - Stage track wrapper (~line 3516): drop `hidden lg:block`, wrap in a `max-w-full overflow-x-auto` strip so the track scrolls on its own.
  - Section wrapper (~line 3447): replace `overflow-hidden` with rounded-corner-safe clipping that doesn't hide row content.
  - Mirror the same three changes in the Active / Open block (~lines 1986–2080).
- Verify at 731px (current viewport), 390px, and desktop widths that every row shows the full stage track and both action buttons.
