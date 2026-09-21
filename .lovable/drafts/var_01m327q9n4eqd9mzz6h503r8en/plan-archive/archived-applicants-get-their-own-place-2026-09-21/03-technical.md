## Technical detail

**Schema (staged, applies when this draft is accepted).** `review_status` is a Postgres enum with exactly four values (`pending`, `approved`, `denied`, `revisions_requested`) — confirmed live. Stage an additive migration adding `archived` via `ALTER TYPE public.review_status ADD VALUE IF NOT EXISTS 'archived';`, undo noted in the header. No column, policy or grant change is needed — `applications` writes already flow through the existing management/staff policies. Because a new enum value cannot be used in the same transaction that creates it, the backfill runs as a separate statement after the enum exists.

**Backfill.** `UPDATE public.applications SET review_status = 'archived' WHERE review_status = 'denied' AND reviewer_notes LIKE '[Archived from pipeline]%'` — 50 rows today, matching the audit trail (`audit_log.action = 'applicant_archived'`). `reviewer_notes`, `reviewed_at` and `reviewed_by` are left untouched.

**Pipeline archive.** `handleArchiveFromHold` in `src/pages/staff/PipelineDashboard.tsx` (~line 1248) writes `review_status: 'denied'` — change to `'archived'`. Operator side (`on_hold` cleared, `is_active: false`) and the `applicant_archived` audit row stay exactly as they are.

**Applications page** (`src/pages/management/ManagementPortal.tsx`):
- `StatusFilter` gains `archived`; add it to the tab list and the URL-param whitelist (~line 255) so `?status=archived` deep-links.
- `fetchApplications` passes the filter straight to `.eq('review_status', …)`, so `denied` stops including archived records automatically once the data moves.
- New `handleArchive(appId, note)` — a direct `applications` update to `archived` plus an `audit_log` row (`action: 'application_archived'`). No edge function, so no applicant email; `deny-application` is untouched and keeps sending the denial notice.
- New `handleUnarchive(appId, target)` for the Archived tab: back to `pending` (clears `reviewed_at`/`reviewed_by`) or through to `denied` via the existing deny flow.

**Review drawer** (`src/components/management/ApplicationReviewDrawer.tsx`): add `archived` to `STATUS_COLORS` (neutral/muted, not destructive), an "Archive" action beside Deny with an optional reason, and, when the application is already archived, the two move-out actions. The existing "Application denied" reason panel is gated on `review_status === 'denied'` and needs a matching archived variant reading "Set aside" rather than "denied".

**Sweep.** Grep `'denied'` across `src/` and `supabase/functions/` for counts and eligibility checks (metrics tiles, `check_driver_eligibility`, pipeline queries) and decide per site whether archived belongs with denied or apart — the default is apart: archived is not a rejection.

**Verification.** Extend the application-status tests to cover the new outcome and the archived/denied split, run the full suite with `--maxWorkers=4`, and typecheck. The enum and backfill land only on draft accept, so the Archived tab cannot be exercised in the draft preview — that is stated rather than stubbed.
