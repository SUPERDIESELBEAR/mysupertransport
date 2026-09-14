# Technical details

- All changes are in `src/components/fleet/UnitNumberPoolPanel.tsx` (the read-only panel) plus a small test update in `src/components/fleet/__tests__/UnitNumberPoolPanel.test.tsx`.
- No new database work: the panel keeps calling the already-staged `unit_number_pool()` / `unit_number_holders()` functions.
- "Next available" and free count come from the existing pool result — next entry plus total of recycled + gap entries.
- Copy button uses the clipboard API with a brief "Copied" confirmation; no writes, no audit entries (panel stays read-only).
- Pinned lookup result: the holder card renders above the list and outside the scroll area.
- Loading state uses the existing Skeleton component; empty state text per group.
- Mobile: the panel is already a bottom sheet on small screens; the header strip stacks.

## Verification

- Extend the existing panel tests: next-number header, free count, empty states.
- `npx tsgo --noEmit` clean.
- Browser check of the panel in Vehicle Hub (list content stays "turns on when accepted" until the draft is accepted — expected).

## Then: accept

Once approved, the draft can be accepted — that applies the staged unit-number changes and the list shows real numbers.
