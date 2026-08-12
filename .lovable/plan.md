# Log every assignment sheet send

## Problem
On the Onboard Systems page, resending an assignment sheet overwrites the single "Sent" timestamp on the sheet record, so only the most recent send is visible. Earlier sends are lost from the sheet view.

## What will change
- Every send and resend is recorded as its own entry, with date, time, who sent it, and the recipient email.
- The sheet row keeps showing the original sent date plus the latest resend, with a count like "Resent 2x".
- Clicking that opens a short history list of all sends, newest first.
- Nothing is ever overwritten or deleted — the history is append-only, matching how assignment sheets are already audited.

## Technical details
- New table `onboard_assignment_sheet_sends`: `sheet_id` (FK, cascade), `sent_at`, `sent_by`, `sent_by_name`, `recipient_email`, `kind` ('initial' | 'resend'). Grants for authenticated/service_role, RLS mirroring `onboard_assignment_sheets` (staff full access, operator read for own sheets), insert restricted to staff/service role, no update/delete.
- Backfill one 'initial' row per existing sheet that has a `sent_at`.
- `supabase/functions/send-osas-to-operator/index.ts`: insert a send row on both the create path and the resend path. Keep updating `sent_at` on the sheet (it becomes "last sent") so existing UI keeps working.
- `src/components/equipment/SignOffSheetList.tsx`: load send counts/history per sheet and render "Sent: <first> · Resent Nx" with a popover listing all entries (date/time in Central, sender name).
- Date formatting follows the existing pattern in the list (`MM/dd/yyyy h:mm a`).
