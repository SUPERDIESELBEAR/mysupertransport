# Fix: PE Screening dial not turning green after uploads

## Root cause

The Pre-Employment Screening dial reads from two columns on `onboarding_status`:
- `pe_screening` — controls the "Scheduled / Results In" state
- `pe_screening_result` — controls the final "Clear / Non-Clear" state

Today the two uploaders only write the document URL and never touch these status columns:

- **QPassport uploader** (`OperatorDetailPanel.tsx` line ~205) writes `qpassport_url` but leaves `pe_screening` at its previous value (usually `not_started`). Result: dial stays gray even though the QPassport is attached.
- **PE Results uploader** (line ~5618) writes `pe_results_doc_url` but leaves `pe_screening` and `pe_screening_result` untouched. Result: dial doesn't move to "Results In", so Delease's uploaded result never turns the dial green.

Staff have been manually flipping the dropdowns after upload for some drivers (that's why some rows in the DB show `scheduled`/`clear`), and forgetting on others.

## Fix

Make the two upload handlers advance the status columns automatically, using conservative rules so we never downgrade a status a coordinator has already set.

### 1. QPassport upload (`QPassportUploader`)
When the upload succeeds, in the same `onboarding_status.update(...)` call also set:
- `pe_screening = 'scheduled'` — but only when the current value is `null`, `''`, or `'not_started'`. If it's already `scheduled` / `results_in`, leave it alone.
- `pe_results_date` unchanged.

Implementation: fetch the current `pe_screening` value (already in `status` state passed to the panel) or use a conditional update with `.is('pe_screening', null).or('pe_screening.eq.not_started')`. Simpler: read current value from state and branch client-side, then call update.

Also update local `setStatus` so the dial refreshes immediately without a reload.

### 2. PE Results upload (inline handler around line 5596)
On successful upload, in the same `onboarding_status.update(...)` also set:
- `pe_screening = 'results_in'` when current value is anything other than `results_in`.
- `pe_results_date = today (YYYY-MM-DD, Central Time)` when it's currently null — gives the timeline a real date to show.
- Do **not** auto-set `pe_screening_result` to `clear` / `non_clear`. That decision stays with the coordinator (they still pick from the dropdown after reviewing the PDF), so we don't accidentally mark a non-clear result as clear.

Update local `setStatus` for immediate UI refresh.

### 3. Toast wording
Update the success toasts to mention the status change, e.g. "QPassport uploaded — PE Screening marked as Scheduled" and "PE Results uploaded — status set to Results In. Please mark Clear or Non-Clear."

### 4. One-time backfill for existing records
Run a small SQL migration to fix the drivers already affected (Delease + the four QPassport uploads):

```sql
UPDATE public.onboarding_status
   SET pe_screening = 'scheduled'
 WHERE qpassport_url IS NOT NULL
   AND (pe_screening IS NULL OR pe_screening IN ('', 'not_started'));

UPDATE public.onboarding_status
   SET pe_screening = 'results_in'
 WHERE pe_results_doc_url IS NOT NULL
   AND pe_screening NOT IN ('results_in')
   AND (pe_screening_result IS NULL OR pe_screening_result NOT IN ('clear','non_clear'));
```

This leaves any driver a coordinator has already marked `clear` / `non_clear` untouched.

## Files touched

- `src/pages/staff/OperatorDetailPanel.tsx` — extend the two upload handlers and their local state updates.
- New migration for the backfill.

## Out of scope

- No changes to the dial rendering logic, PE timeline, or driver-portal Smart Progress widget — they already read from `pe_screening` / `pe_screening_result` correctly.
- No change to how coordinators mark Clear / Non-Clear — that remains manual.
