# Confirming your request

Here's what I'm reading you to mean — please correct me if any of the four bullets is off before I build:

1. **"Archived from the applicant pipeline"** = the staff **Pipeline Dashboard → Archive applicant** action (the "Move to Archived Drivers list" flow that opens with a reason textarea). Today that reason is **only stored on the `audit_log` row** (`metadata.reason`). It never gets onto the application itself, so anyone viewing the application later has no idea why it was archived.
2. **"Denied" from the management side** = the **Management → Applications → Denied** tab. Apps reach that tab two ways:
   - The drawer's **Confirm Deny** flow (writes `applications.reviewer_notes` from the "Reviewer Notes" textarea above the action buttons — but staff frequently leave that blank, so almost every existing denied row has `reviewer_notes = null`).
   - The pipeline **Archive** flow (sets `applications.review_status = 'denied'` but writes no reason to the application — the gap above).
3. **"Action arrow per each person located on the overview section"** = the **ChevronRight ▶** at the right edge of each row in the Applications list. Clicking the row/arrow opens the `ApplicationReviewDrawer`, and you want the reason visible on the **Overview** tab of that drawer.
4. The reason text should be the **same comment** the archiver/denier originally typed — whether that came from the pipeline Archive dialog or the drawer's Reviewer Notes / Confirm Deny dialog.

If any of that is wrong (e.g. you want the reason inline on the list row itself, not inside the drawer), tell me and I'll adjust before touching anything.

# Plan (assuming the four bullets above are correct)

## 1. Persist the archive reason onto the application
Update `handleArchiveFromHold` in `src/pages/staff/PipelineDashboard.tsx` so that when it flips `applications.review_status` to `'denied'` it also writes:
- `reviewer_notes` = the typed `archiveReason` (prefixed with a marker, e.g. `"[Archived from pipeline] <reason>"` so it's obvious where it came from)
- `reviewed_at` = `now()`

(`audit_log` insert stays exactly as it is — full traceability is preserved.)

## 2. Backfill existing denied rows
One-time SQL pass: for every `applications` row where `review_status = 'denied'` AND `reviewer_notes IS NULL`, look up the most recent `audit_log` entry where `action = 'applicant_archived'` AND `entity_label` matches `first_name + ' ' + last_name` (joining via the operator → application link where possible), and copy `metadata->>'reason'` in (still prefixed with the same `[Archived from pipeline]` marker). Done as a `supabase--insert` UPDATE; only fills nulls so it's idempotent.

Result: the two existing reasons we already have on file ("Constanze Fanning…" and "Jeremy Scott…") will appear on those denied applications; the older rows with no reason recorded stay blank.

## 3. Show the reason in the drawer's Overview tab
In `src/components/management/ApplicationReviewDrawer.tsx`, at the top of the Overview tab content, when `app.review_status === 'denied'`, render a new dark-red callout card:
```
┌──────────────────────────────────────────────┐
│ ⓧ Application denied · 2026-06-24            │
│                                              │
│ "Constanze will not be moving forward in the │
│  hiring process. This serves as…"            │
└──────────────────────────────────────────────┘
```
- Header: `XCircle` icon + "Application denied" + reviewed_at date (Central Time).
- Body: `reviewer_notes` verbatim. If `reviewer_notes` is null, fallback copy: *"No reason was recorded when this application was denied."*
- Style matches the existing destructive design tokens (no new colors).

## 4. (Light touch) Make the reason visible without opening the drawer
On the Applications list row, when `review_status === 'denied'` and `reviewer_notes` is non-empty, show a single-line **italic, truncated** preview of the reason under the contact info — same row as today, no layout shuffle. Tooltip on hover shows the full text. Mobile card gets the same treatment as a 1-line clamp under the email.

## Out of scope
- No changes to the drawer's Confirm Deny flow itself — it already writes `reviewer_notes`. (Optional later polish: make the textarea required when denying. Mention only.)
- No changes to onboarding, operators, or the Archived Drivers list view itself.
- No new tables/columns — `applications.reviewer_notes` + `reviewed_at` already exist.

## Verification
- Archive a test applicant from the pipeline with a reason → reload Management → Applications → Denied → click chevron → reason appears in the Overview card.
- Deny a test pending application from the drawer with text in Reviewer Notes → same place, same display.
- Old denied rows backfilled from audit log show the historic reason; rows with no reason on file show the fallback copy.
- Mobile: list row shows the truncated reason; tapping opens the drawer card.
