# Adding "Edit denial reason" for management

## Confirmed
- Historic blank rows stay blank (fallback copy *"No reason was recorded when this application was denied."* remains).
- New work: let management edit the reason on any denied/archived application after the fact.

## Where the edit lives
The denial-reason callout card I added to the **Overview tab of the `ApplicationReviewDrawer`** (Management → Applications → Denied → click the chevron) gets a small **Edit** button in its header, next to the date.

```text
┌─────────────────────────────────────────────┐
│ ⓧ Application denied · Jun 24, 2026  [Edit] │
│                                             │
│ [Archived from pipeline] Unresponsive       │
└─────────────────────────────────────────────┘
```

Clicking **Edit** swaps the body into an inline `Textarea` + **Save** / **Cancel** buttons. No new modal — keeps it light.

## Behavior
- **Who can edit:** Management role only. Staff still see the card read-only. (Owner sees it like management.)
- **What's editable:** the free-text portion only. The `[Archived from pipeline]` prefix, if present, is preserved automatically so we don't lose the provenance marker. If the row had no prefix (drawer-denied), no prefix is added.
- **Empty save:** allowed — clearing the field reverts the card to the fallback copy. We treat that as "remove the recorded reason" and log it.
- **Audit trail:** every save writes an `audit_log` entry with `action = 'application_denial_reason_edited'`, `entity_id = application.id`, and `metadata = { previous_reason, new_reason }`. So nothing is silently overwritten — the original text remains visible in the audit log forever.
- **Timestamp:** `reviewed_at` is **not** touched (it still reflects when the denial happened). We only update `reviewer_notes`.
- **Optimistic UI:** save → update → refresh the local `app` object → toast "Reason updated." On failure, toast the error and roll back.

## Files touched (presentation only)
- `src/components/management/ApplicationReviewDrawer.tsx` — add Edit/Save/Cancel state to the denial card, Supabase update call, audit_log insert, role gate via existing `useAuth` roles.
- `src/pages/management/ManagementPortal.tsx` — the truncated 1-line preview under the applicant name already reads `reviewer_notes`, so it picks up edits automatically on next list refresh. No code change needed there.

## Out of scope
- No schema changes (`reviewer_notes` already exists).
- No changes to the pipeline Archive flow or Confirm Deny flow.
- No bulk-edit UI. One application at a time.
- Not exposing edit to staff/dispatch roles.

## Verification
1. Open a denied applicant in Management → Applications → Denied. Click the chevron, go to Overview.
2. Click **Edit** → textarea appears prefilled with current reason. Edit → **Save** → card returns to read-mode with new text and a success toast.
3. Reload the page → new text persists.
4. Check `audit_log` → new `application_denial_reason_edited` entry with previous + new values.
5. Sign in as a staff (non-management) user and open the same applicant — Edit button is hidden, card is read-only.
6. Clear the field and save — card switches to fallback copy "No reason was recorded…", and audit_log captures the wipe.
