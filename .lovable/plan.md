## Problem

When staff click "Staff will handle corrections (take over)" on an application:
- `is_draft` is set to `true` (so the form is editable by staff)
- `revisions_handled_by_staff_at` is stamped
- `review_status` stays `pending`

The Management Portal pipeline list filters with `is_draft = false` (except for `revisions_requested`), so taken-over applications disappear from every tab. Kenneth Woods' record is in this exact state right now.

## Fix

Keep the row editable by staff but visible in the queue.

1. **`src/pages/management/ManagementPortal.tsx`** — update the pipeline query so applications that staff have taken over are always included regardless of `is_draft`:
   - Pending tab count query and list query: include rows where `revisions_handled_by_staff_at IS NOT NULL` in addition to `is_draft = false`.
   - Concretely, replace `.eq('is_draft', false)` filters with an `.or(...)` that allows `is_draft.eq.false` OR `revisions_handled_by_staff_at.not.is.null` (and keep the existing `revisions_requested` carve-out).

2. **Visual cue in the pipeline card** — add a small "Staff handling" badge (reusing the same muted/`Lock` styling as the drawer's "Applicant link disabled" indicator) on rows where `revisions_handled_by_staff_at` is set, so staff can tell at a glance which pending rows are staff-driven vs awaiting applicant.

3. **No DB migration needed.** Kenneth's row will reappear in the Pending tab as soon as the filter change ships.

## Out of scope

- No change to the takeover logic itself (still flips `is_draft = true` so staff can edit fields).
- No change to RLS or `applications` schema.
- No automatic flip back to `is_draft = false` — that should happen when staff finish and re-submit, which is existing behavior.

## Files touched

- `src/pages/management/ManagementPortal.tsx` (query + card badge)
