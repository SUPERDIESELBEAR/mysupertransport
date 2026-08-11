# Onboard Systems: make sent assignment sheets a permanent record

## What I found (verified in the code and database)

Good news first: assignment sheets are stored as real rows in the database (`onboard_assignment_sheets` plus their device line items). The list on the Onboard Systems page loads every sheet regardless of status, newest first — nothing is hidden or auto-purged when a sheet is sent. Devices, serial snapshots, dates, signature and signed timestamp all stay attached to the sheet. Today there is exactly one sheet in the database and it is a draft.

Three real gaps, though:

1. **Sending a draft does not flip it to "Sent."** When staff press Send on a draft card, the backend emails the driver and stamps the send time, but it never changes the status. The card keeps saying "Draft" forever, so the page does not visually record that it was sent.
2. **"Sent" time is not shown.** The card shows the assignment date and the signed date, but never the sent date, so there is no visible send history.
3. **Delete permanently erases any sheet — including sent and signed ones.** There is no restriction and no record kept afterward. That is the only way a sent sheet can disappear.

## Plan

1. Flip the status to "Sent" when a draft is sent from the list, alongside the send timestamp (only when it is still a draft — a signed sheet stays signed).
2. Show "Sent: MM/DD/YYYY h:mm a" on the card whenever a send time exists, so the send history is visible.
3. Protect the record: only drafts can be deleted outright. Sent and signed sheets get "Void" instead, which keeps the row and its devices/serials on the page with a Void badge while releasing the equipment back to inventory. The delete confirmation wording changes to match.
4. Write an audit entry each time a sheet is sent, voided, or deleted, so there is a permanent trail even for a deleted draft.

## Technical notes

- `supabase/functions/send-osas-to-operator/index.ts`: in the resend branch, update `status` to `sent` when the current status is `draft`, in the same update as `sent_at`; add an `audit_log` insert.
- `supabase/functions/delete-osas-sheet/index.ts`: branch on status — draft deletes as today; `sent`/`signed` release equipment and set `status = 'void'` instead of deleting rows; log both outcomes to `audit_log`.
- `src/components/equipment/SignOffSheetList.tsx`: render the sent timestamp, relabel the destructive button to Void for non-draft sheets, and update the confirmation dialog copy.
- No schema change is needed — `void` already exists in the `osas_status` type and `sent_at` already exists on the table.
