# ICA Sent / Signed Dates — Why They Look "Removed"

## What's actually happening

Nothing deletes them. Those two fields on Stage 3 are **manual, staff-typed date pickers** — the only code that ever writes them is the date picker itself. The real ICA workflow (Builder sends it, owner/driver signs it) never fills them in.

Confirmed in the data:

- Of 144 onboarding records, only 55 have a sent date and 36 have a signed date — the ones a staff member happened to type by hand.
- Several drivers with a fully executed contract (real signature timestamp on file) show both date boxes empty, and others show a sent date but a blank signed date.
- The signature timestamps themselves are never lost: the ICA contract record keeps the contractor and carrier signature timestamps permanently, and the executed PDF is filed in the driver's binder.

So it isn't a go-live wipe — the boxes were simply never populated for that driver, and Stage 3 shows "Pick a date" for an empty field.

## Proposed fix: make the dates automatic and permanent

1. **Auto-fill on send.** When the ICA Builder flips the status to "sent for signature", stamp that date into ICA Sent Date if it's empty.
2. **Auto-fill on signature.** When the contract becomes fully executed, stamp the actual signature date into ICA Signed Date if it's empty.
3. **Show the real record even when the field is blank.** In Stage 3, when a date field is empty but the contract has a matching signature timestamp, display that timestamp (labeled as coming from the executed contract) instead of "Pick a date".
4. **Backfill history.** One-time pass over existing contracts: fill any missing sent/signed date from the contract's own timestamps so past drivers stop showing blanks. Staff-entered dates are left untouched.
5. **Keep them editable.** Staff can still override either date (e.g. a paper ICA signed off-platform); overrides are never overwritten by the automation.

## Technical notes

- Auto-stamp on send in `ICABuilderModal.tsx` alongside the existing `ica_status: 'sent_for_signature'` update; auto-stamp on execution in the same path that flips `ica_status` to `complete`, using `ica_contracts.contractor_signed_at` (Central time, noon-anchored date conversion).
- Stage 3 rendering in `OperatorDetailPanel.tsx` reads the contract row already loaded for the "ICA Fully Executed" banner, so the fallback display needs no extra query.
- Backfill as a single migration: fill `ica_signed_date` from the executed contract's contractor signature timestamp where null, and `ica_sent_date` from the contract's send/creation timestamp where null.