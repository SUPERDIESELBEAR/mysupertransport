## Three fixes for the Assignment Sheets list (Onboard Systems → Assignment Sheets)

### 1. Resend actually sends nothing (toast lies)

**Root cause (confirmed in `supabase/functions/send-osas-to-operator/index.ts`):** `sendSheetEmail` uses `idempotencyKey: \`osas-${sheet.id}\``. The queue treats subsequent resends as duplicates of the original send and drops them silently — the function returns success, the toast fires, but no new email is enqueued.

**Fix:** When invoked via the resend path (`body.sheetId` present), make the idempotency key unique per attempt so each reminder is a distinct send:
```
idempotencyKey: `osas-${sheet.id}-resend-${Date.now()}`
```
Keep the original stable key for the initial create+send. Pass a `resend: true` flag from `sendSheetEmail` (or split into two helpers) so the key is chosen correctly.

### 2. `Unit —` shows a dash even though the sheet stored a unit number

**Root cause (confirmed in `src/components/equipment/SignOffSheetList.tsx` line 158):** The card reads `sheet.operator?.unit_number`, but the unit number entered in the Create modal is written to `onboard_assignment_sheets.unit_number` on the sheet row itself. Operators created without a unit on their profile show `—`.

**Fix:** Prefer the sheet's own unit, fall back to the operator's:
```
Unit {sheet.unit_number ?? sheet.operator?.unit_number ?? '—'}
```
Apply the same fallback in `SignOffSheetPreviewModal.tsx` header for consistency.

### 3. No way to delete assignment sheets

Add a Delete action so test/mistaken sheets can be removed and their equipment released.

**Edge function:** new `supabase/functions/delete-osas-sheet/index.ts` following the shared email/auth pattern (`requireStaff` with `['management','onboarding_staff','owner']`, `ok/fail/withErrorEnvelope`). Body: `{ sheetId }`. Actions:
1. Load sheet + items.
2. For each item's `equipment_id`: set `equipment_items.status = 'available'` and delete the matching `equipment_assignments` row (operator + equipment).
3. Delete `onboard_assignment_sheet_items` for the sheet.
4. Delete the `onboard_assignment_sheets` row.

Deploy the new function.

**UI (`SignOffSheetList.tsx`):**
- Add a red-outline `Trash2` "Delete" button next to View / Resend.
- Use an `AlertDialog` confirmation ("Delete this assignment sheet? Any assigned devices will be released back to inventory. This cannot be undone.").
- On confirm, invoke `delete-osas-sheet`, toast result, refresh list. Track a `deletingId` for the spinner/disabled state.

Also mirror the Delete action in `SignOffSheetPreviewModal.tsx` footer so it can be removed while previewing; close the modal and refresh the list on success.

### Files touched
- `supabase/functions/send-osas-to-operator/index.ts` — unique resend idempotency key
- `src/components/equipment/SignOffSheetList.tsx` — unit fallback + Delete button/dialog
- `src/components/equipment/SignOffSheetPreviewModal.tsx` — unit fallback + Delete button
- `supabase/functions/delete-osas-sheet/index.ts` — new function (deploy)

No schema changes, no migration.
