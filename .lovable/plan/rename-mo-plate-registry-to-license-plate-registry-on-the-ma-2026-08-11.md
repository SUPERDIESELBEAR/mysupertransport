# Rename "MO Plate Registry" to "License Plate Registry" on the management dashboard

## Goal
Update the visible label from "MO Plate Registry" to "License Plate Registry" in the management dashboard UI so the sidebar entry and destination page header match.

## Changes
- `src/pages/management/ManagementPortal.tsx` (line ~900): Change the Operations sidebar item label from `MO Plate Registry` to `License Plate Registry`.
- `src/pages/management/DeactivationPage.tsx` (line ~129): Change the same sidebar item label to `License Plate Registry`.
- `src/components/mo-plates/MoPlateRegistry.tsx` (line ~371): Change the page `<h1>` title from `MO Plate Registry` to `License Plate Registry`.

## Out of scope
- Internal references in code comments, staff help index, knowledge docs, sign-off sheet copy, and edge function help text will keep saying "MO Plate Registry" unless you want a full product rename.
- The route path `/mo-plates` and component/file names remain unchanged.

## Verification
- Type-check the project after edits.
- Confirm the sidebar shows "License Plate Registry" and the page header matches.
