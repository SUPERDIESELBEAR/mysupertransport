## Clarify the three revision workflows

Today there are three distinct revision actions, but their button labels overlap and one of them auto-opens the wrong modal — so staff can't tell which path they're on. This plan renames the buttons, tweaks the helper copy, and stops the misleading auto-open.

### The three workflows (after this change)

| # | Workflow | Button label | What happens |
|---|---|---|---|
| 1 | **Applicant fixes it themselves** | **"Send back to applicant for corrections"** (was *Request Revisions*) | Status → `revisions_requested`. Applicant gets a secure link to reopen and resubmit. |
| 2 | **Staff proposes edits, applicant e‑signs to approve** | **"Propose changes for applicant approval"** (was *Send Corrections*) | Opens the field‑picker modal. Applicant receives the proposed values and e‑signs to accept. |
| 3 | **Staff take over after #1 stalls** | **"Staff will handle corrections (take over)"** (was *Move to pending for staff corrections*) | Status → `pending`. Applicant link is disabled. Logged in the revision audit log. **No modal auto‑opens** — staff edit fields directly in the drawer. |

### Changes

1. **`ApplicationReviewDrawer.tsx` — footer buttons (pending/approved state)**
   - Rename **Request Revisions** → **"Send back to applicant for corrections"**.
   - Rename **Send Corrections** → **"Propose changes for applicant approval"**.
   - Add a one‑line muted helper under each button explaining who acts next ("Applicant reopens the form" vs. "Applicant e‑signs the changes you propose").

2. **`ApplicationReviewDrawer.tsx` — revision history banner (workflow #3)**
   - Rename the action button to **"Staff will handle corrections (take over)"** with subtitle "Disables the applicant link. You'll edit fields directly here."
   - **Remove the `setCorrectionsOpen(true)` call** in the click handler so the "Propose changes for applicant approval" modal no longer pops open after take‑over. That modal belongs to workflow #2 and was the source of the "it's sending back to Kenneth" confusion.
   - Keep the silent applicant notification (`notify-application-moved-to-pending`) and audit‑log entry.

3. **`SuggestCorrectionsModal.tsx` — title/intro copy**
   - Change dialog title from **"Send corrections to {name}"** → **"Propose changes for {name} to approve"**.
   - Tighten the intro line to: *"Pick the fields to change, enter the new values, and the applicant will e‑sign to approve. Use 'Send back to applicant for corrections' if you want them to fix it themselves."*

### Out of scope
- No DB / RPC / edge‑function changes — the three underlying actions (`request_revisions`, `suggest_corrections`, `move_revisions_to_pending`) already exist and work.
- No changes to the audit log, banners, or notification emails beyond label/title text.

### Verification
- Pending application → footer shows three clearly distinguishable buttons with helper text.
- Click **"Staff will handle corrections (take over)"** on Kenneth Woods → status flips to pending, banner updates, **no modal opens**, audit log records the take‑over.
- Click **"Propose changes for applicant approval"** → field‑picker modal opens with the new title.
