
# Previous Employment Investigation (PEI) Module

The uploaded prompt sequence assumes a generic `applicants` table and `profiles.role` RLS, neither of which exist in this project. The plan below preserves the full PEI feature set but adapts it to SUPERDRIVE's actual schema (`applications`, `employers` jsonb, `is_staff()` / `has_role()`) and existing patterns (edge function `getClaims(token)` auth, Resend via `send-notification`, pg_cron at 15:00 UTC, gold/charcoal palette, no `src/services/` folder — inline supabase calls).

Build is split into 4 phases. Each phase ends in a working, demoable slice.

## Adaptations from the spec

- `applicants` → `applications`. Foreign keys reference `applications(id)`. Applicant name = `first_name + ' ' + last_name`, DOB = `dob`, SSN last 4 derived from `ssn_encrypted` via existing `decrypt-ssn` edge function (server-side only — never expose to public token endpoint; show "***-**-XXXX" only after decryption inside the staff RPC).
- Employment history lives in `applications.employers` jsonb. `autoBuildPEIRequests` reads that array, filters last 3 years, uses a new `is_dot_regulated` flag we'll add per employer entry (Phase 4 form change).
- RLS rewritten to use `is_staff(auth.uid())` for staff and `has_role(auth.uid(), 'management')` / `'owner'` for destructive ops. No `profiles.role` references.
- Edge functions authenticate via `supabaseAdmin.auth.getClaims(token)` (per project memory), not `getUser()`.
- Cron runs at **13:00 UTC** (8 AM Central, DST-naive — matches existing daily jobs window).
- New service helpers go in `src/lib/pei/` (project has no `src/services/`).
- Public response page is unauthenticated; the edge function `get-pei-request-by-token` is the only data source so RLS stays locked down.

## Phase 1 — Schema, RLS, Triggers, Storage

Single migration creating:

- Enums: `pei_request_status`, `pei_gfe_reason`, `pei_performance_rating`, `pei_leaving_reason`, `pei_applicant_status`.
- Tables: `pei_requests` (FK → `applications.id`), `pei_responses` (1:1 FK → `pei_requests`), `pei_accidents` (N:1 FK → `pei_responses`).
- Columns added to `applications`: `pei_status`, `pei_deadline`, `driver_rights_notice_acknowledged`, `driver_rights_notice_date`.
- Indexes per spec, plus unique on `response_token`.
- Triggers: `update_updated_at`, `set_pei_deadline` (date_sent → +30 days), `update_application_pei_status` (rolls request statuses up to applicant), `complete_pei_request_on_response`.
- Helper RPCs: `get_pei_queue()`, `get_applicant_pei_summary(uuid)`, `get_pei_requests_needing_action()`. (`get_pei_request_by_token` lives in the edge function instead of the DB so we can decrypt SSN last-4 server-side.)
- RLS — staff (read/insert/update via `is_staff`), management (delete), public/anon insert on `pei_responses` + `pei_accidents` only when the parent request token is unused and status is in `('sent','follow_up_sent','final_notice_sent')`.
- Storage bucket `pei-documents` (private) with staff-only ALL policy.

Deliverable: tables exist, RLS verified with linter.

## Phase 2 — Staff Queue + Applicant Tab

- `src/lib/pei/types.ts` — TS types matching enums and tables.
- `src/lib/pei/api.ts` — inline supabase helpers: `fetchPEIQueue`, `fetchPEIRequestsByApplication`, `createPEIRequest`, `updatePEIRequest`, `createGoodFaithEffort`, `autoBuildPEIRequests`, `fetchPEIResponse`, `fetchPEIAccidents`.
- New page `src/pages/staff/PEIQueue.tsx` at `/staff/pei-queue`, wrapped in `StaffLayout`. Header, 4 stat tiles, sortable table, color-coded badges using design tokens (no raw colors). Action buttons render but call placeholders.
- New tab inside the existing applicant review drawer (`ApplicationReviewDrawer.tsx`): "PEI" tab with status header, Generate / Send All Pending buttons, request cards, View Response / View GFE actions, and a Document Vault list.
- Sidebar entry "PEI Queue" under Compliance with badge count.

Deliverable: staff can see, generate, and view PEI rows (no email sending yet).

## Phase 3 — Public Response Form + GFE + Viewer

- New edge function `get-pei-request-by-token` (verify_jwt = false): looks up by token, returns sanitized request + applicant name/DOB/SSN-last4 (decrypted server-side). Refuses if token used or status final.
- Public page `src/pages/PEIRespond.tsx` at `/pei/respond/:token`. Standalone layout (no staff chrome), SUPERTRANSPORT branding, 2-page form per spec, signature pad reusing existing `SignaturePad` component, validation, submit via a second edge function `submit-pei-response` (verify_jwt = false) that inserts `pei_responses` + `pei_accidents` and flips `response_token_used = true` atomically. Shows confirmation / friendly errors for invalid/used tokens.
- `PEIResponseViewer.tsx` — read-only modal used from staff tab and queue.
- `DocumentGFEModal.tsx` — staff modal for `pei_gfe_reason` selection, calls `createGoodFaithEffort`.

Deliverable: end-to-end loop minus email — staff generates → token URL works → response stored → viewer renders → GFE flow works.

## Phase 4 — Email, Cron, App Integration, Pipeline Gate, Polish

- Edge function `send-pei-email` (uses Resend secret already configured, `getClaims` auth, follows existing `send-notification` template structure). Three templates: initial / follow_up / final_notice. Updates the `pei_request` row on success only. Wires up Send PEI / Send Follow-Up / Send Final Notice / Send All Pending buttons with toasts and per-button spinners.
- Edge function `pei-cron` (verify_jwt = false, called by pg_cron): iterates `get_pei_requests_needing_action`, sends follow-ups, sends final notices, auto-creates GFE (`reason = 'no_response'`) at 30 days. pg_cron schedule daily at 13:00 UTC. Banner on PEI Queue when auto-GFEs were created in last 7 days.
- Application form changes (`Step3Employment.tsx`):
  - Add `is_dot_regulated: boolean` field per employer with help tooltip; persist into `employers` jsonb.
- Application form changes (`Step8Disclosures.tsx`):
  - Add Driver Rights Notice block + required acknowledgment checkbox; sets `driver_rights_notice_acknowledged` and `driver_rights_notice_date` on submit.
- Pipeline integration: when applicant advances to the configured trigger stage (default: post-screening), call `autoBuildPEIRequests`. Hard gate in activation flow: block "Activate" / "Ready for Dispatch" unless `pei_status = 'complete'`. PEI compliance pill on applicant header.
- Final polish per Prompt 12: confirmation dialogs, empty states, breadcrumbs, mobile audit, dashboard widget on staff home.

Deliverable: full module live, compliant with §391.23.

## Technical details

- Date math uses noon-anchoring per project memory (`T12:00:00`) when displaying day counts.
- All status badges use existing design tokens (`bg-muted`, `bg-secondary`, `text-warning`, etc.), not raw Tailwind colors.
- Edge functions log via `console.log` and return JSON `{ ok, ... }` consistent with `send-notification`.
- Existing email layout (`supabase/functions/_shared/email-layout.ts`) wraps all PEI emails for branding consistency.
- Storage uploads (response PDFs, GFE PDFs) deferred to "Future Enhancements" — bucket exists but PDF generation is out of scope.
- Realtime not required; queue refreshes on focus + after mutations.

## Out of scope (matches spec's "Future Enhancements")

PDF generation, Clearinghouse logging, driver rebuttal workflow, FMCSA non-compliance reporting, audit export.

After approval I'll start with the Phase 1 migration and ask for your go-ahead before running it.
