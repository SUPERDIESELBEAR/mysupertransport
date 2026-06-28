# Initiate PEI from the Applicant Pipeline

Reuse the existing `pei_requests` system end-to-end. No schema, RLS, or edge function changes — every entry point ultimately calls the same `autoBuildPEIRequests` / `sendPEIEmail` / `fetchPEIRequestsByApplication` helpers used by `ApplicationPEITab` and `PEIQueuePanel` today.

## 1. Card-level action on PipelineDashboard

On each applicant card in `src/pages/staff/PipelineDashboard.tsx`:

- Add a "PEI" button (icon: `ShieldCheck`, gold accent) into the existing action row, available at every stage with no gating.
- Clicking it opens a lightweight `PEIQuickDrawer` (new file, `src/components/management/PEIQuickDrawer.tsx`) that mounts the existing `ApplicationPEITab` for the selected `applicationId` inside a `Sheet`. This keeps the staff in pipeline context, avoids opening the full Application Review drawer, and inherits all current PEI behavior (auto-build, send, GFE, find-with-AI, edit contact, view response, delete).
- If no employers exist on the application yet, `ApplicationPEITab`'s existing "No PEI requests yet" empty state already guides staff to Auto-build — no new copy needed.

## 2. PEI tab inside the Application Review drawer

In `src/components/management/ApplicationReviewDrawer.tsx`:

- The `'pei'` tab already exists (used by the PEI Queue's `initialTab` deep-link). Confirm it is rendered for every applicant regardless of pipeline stage — currently it shows for all; just verify no stage-conditional hide exists and remove it if so.
- No new code needed beyond the verification pass.

## 3. PEI status pill on the card

New tiny component `src/components/staff/PEIStatusPill.tsx`:

- Counts derived from `pei_requests` for the application: pending / sent (incl. follow_up_sent, final_notice_sent) / completed (incl. gfe_documented).
- Renders compact `2/3 PEI` style pill with color tiers:
  - Hidden entirely when 0 rows exist (keeps pipeline clean for fresh applicants).
  - Amber when any are pending or awaiting response.
  - Green when all completed/GFE'd.
- Tooltip on hover lists per-employer status.
- Data fetched in one batched query at PipelineDashboard level (single `select application_id, status from pei_requests where application_id in (...)`) and passed down — avoids N queries per card.
- Realtime: subscribe once at the dashboard to `pei_requests` changes scoped to the visible application IDs so the pill refreshes when staff send or receive responses.

## Files touched

```text
src/pages/staff/PipelineDashboard.tsx          (action button, batched PEI fetch, realtime sub, pass counts down)
src/components/management/PEIQuickDrawer.tsx   (new — Sheet wrapper around ApplicationPEITab)
src/components/staff/PEIStatusPill.tsx         (new — counts pill + tooltip)
src/components/management/ApplicationReviewDrawer.tsx (verify PEI tab is unconditionally available)
```

## Out of scope

- No changes to `pei_requests` schema, RLS, edge functions, or the PEI Queue page.
- No automatic PEI triggering — staff explicitly initiate via the button.
- No notifications/automation tied to pipeline stage transitions.
