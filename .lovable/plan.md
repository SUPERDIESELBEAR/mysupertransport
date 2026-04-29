## Goal

Let the operator (Marcus, `marcsmueller@gmail.com`) successfully flip the two "I have read and acknowledged this document" toggles on Stage 8 — Contractor Pay Setup, so the gated form (contractor type, legal name, contact, terms, submit) becomes interactive.

## What I verified

- `ContractorPaySetup.tsx` toggles are local React state (`setDocAcknowledged`) — no network call required to flip them.
- The two toggles live **outside** the gated/disabled wrapper (the `pointer-events-none` only wraps the form fields below the gate banner), so they should be clickable.
- The Switch component is the standard Radix `@radix-ui/react-switch`.
- DB columns `deposit_overview_acknowledged` / `payroll_calendar_acknowledged` exist and there is no `contractor_pay_setup` row yet for operator `ee993ec0-e0a2-4d0f-aa05-6d22eb931405`, so initial state is correctly `false`.
- No runtime errors.

Given the code itself looks correct, the most likely real-world causes are (a) a Radix tooltip/popover overlay sitting over the toggles after the PDF preview closes, (b) the `useBackButton` history entry from `FilePreviewModal` interfering, or (c) the `<label htmlFor>` not firing because `previewDoc` modal teardown left focus / pointer-events in a bad state.

## Plan

### 1. Reproduce with the operator account
Use the browser tool to sign in as `marcsmueller@gmail.com`, open Stage 8, click "View" on a doc, close the preview, then attempt to flip the toggle. Capture console + DOM state to confirm the failure.

### 2. Fix the FilePreviewModal teardown side effects
- Make `useBackButton` clean up its pushed history entry when the modal unmounts (currently the `if (!isOpen) → history.back()` branch never runs because the modal unmounts with `isOpen` still `true`). Run the cleanup in the effect's return so closing the modal pops the virtual entry exactly once.
- Ensure no `body` style (overflow / pointer-events) is left applied after the preview unmounts.

### 3. Harden the acknowledgment row UI
In `ContractorPaySetup.tsx`:
- Wrap each toggle row in a single clickable container that calls `setDocAcknowledged(prev => ({ ...prev, [doc.key]: !prev[doc.key] }))` on click of the whole row (excluding the View button), so the user can tap anywhere on the row, not just the 44 px Switch.
- Add `type="button"` and `e.stopPropagation()` to the View button so it never accidentally toggles the row.
- Keep the `Switch` controlled, but also add an `onClick` handler on the `<label>` that explicitly toggles state, as a belt-and-suspenders fix in case Radix's pointer events are being eaten by a sibling overlay.
- Remove the `htmlFor`/`id` coupling and switch to a plain controlled click handler (avoids Radix label-forwarding edge cases).

### 4. Verify end-to-end
Using the browser tool signed in as the operator:
1. Open Stage 8.
2. View "Payroll Deposit Overview" PDF, close it.
3. Toggle "Payroll Deposit Overview" acknowledgment → confirm it turns green.
4. Repeat for "Payroll Calendar".
5. Confirm the gated form below loses its faded/disabled state and is interactive.
6. Fill required fields, accept terms, submit, and confirm the row lands in `contractor_pay_setup`.

## Technical details

Files touched:
- `src/hooks/useBackButton.ts` — pop the pushed history entry in the effect's cleanup so unmount-while-open is handled.
- `src/components/operator/ContractorPaySetup.tsx` — make the whole acknowledgment row clickable, replace `<label htmlFor>` with an explicit row `onClick`, ensure the View button stops propagation.

No DB migrations. No schema changes. No changes to the gated form logic.
