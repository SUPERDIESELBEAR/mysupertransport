# PEI Module — Phase 2 Wire-Up + Phase 3 Build

## Goal
Make the PEI system reachable in the Staff UI, then deliver the end-to-end response loop (tokenized public form, GFE fallback, response viewer). Email automation, cron, and pipeline gating stay deferred to Phase 4.

## Scope

### Part A — Wire Phase 2 into the UI
1. **Staff sidebar entry**
   - Add a "PEI Queue" item to the staff sidebar (`src/components/staff/StaffSidebar.tsx` or equivalent) gated by `is_staff`.
   - New route `/staff/pei` rendering `PEIQueuePanel`.

2. **Application drawer "PEI" tab**
   - Add a "PEI" tab to `ApplicationReviewDrawer.tsx`.
   - Tab content: list of `pei_requests` for that application, "Auto-build from employment history" button calling `autoBuildPEIRequests`, per-row actions (Send email — stub, Open GFE modal, View response).
   - Show roll-up `pei_status` badge in the drawer header.

### Part B — Phase 3 build (public response + viewer + GFE)
3. **Edge function `get-pei-request-by-token`** (`verify_jwt = false`)
   - Input: `{ token: uuid }`.
   - Validates token against `pei_requests.response_token`, checks not expired / not used.
   - Returns sanitized request payload: applicant name, DOB (masked), last 4 of SSN (server-side decrypt), employment dates claimed, prior employer name. Never returns full SSN to the client.
   - CORS enabled, Zod-validated input, loud errors.

4. **Public response page `PEIRespond.tsx`**
   - Route: `/pei/respond/:token` (public, no auth).
   - Loads request via the edge function.
   - Form fields per 49 CFR §391.23(c): dates of employment, position, reason for leaving, eligible for rehire, accidents (dynamic list → `pei_accidents`), drug/alcohol violations, performance under DOT regs.
   - Submits to `pei_responses` (insert RLS policy must allow anon insert keyed by valid token via SECURITY DEFINER RPC `submit_pei_response(token, payload)`).
   - Trigger `complete_pei_request_on_response` already flips status to completed.
   - Confirmation screen on success.

5. **GFE modal `GFEModal.tsx` finishing touches**
   - Already created — wire to staff drawer row action.
   - Required: GFE reason enum dropdown, free-text notes, optional file upload to `pei-documents` bucket, "Mark GFE" button writes to `pei_requests` (status = `good_faith_effort`, `gfe_reason`, `gfe_notes`, `gfe_evidence_url`).

6. **Response viewer `PEIResponseViewer.tsx`**
   - Read-only modal/panel opened from queue + drawer.
   - Renders the full response, accidents list, attachments, GFE evidence if applicable.
   - Print-friendly layout (driver qualification file).

### Out of scope (Phase 4, next request)
- Resend email templates + `send-pei-email` edge function.
- pg_cron `pei-cron` daily job (auto-GFE at 30 days, reminder emails).
- `Step3Employment.tsx` `is_dot_regulated` per-employer flag.
- `Step8Disclosures.tsx` Driver Rights Notice acknowledgment.
- Pipeline activation gate on `pei_status = 'complete'`.

## Technical notes

- **Token security:** `response_token` is uuid v4, single-use, expires at `pei_requests.deadline_at`. Edge function returns 410 on expired, 409 on already-used.
- **Anon submission:** Use a `SECURITY DEFINER` RPC `submit_pei_response(p_token, p_payload jsonb, p_accidents jsonb)` instead of opening RLS to anon — keeps `pei_responses` insert policy staff-only.
- **SSN decryption:** Only inside the edge function with service role; client receives `ssn_last4` only.
- **Storage:** `pei-documents` bucket (already created) — anon upload via signed URL issued by edge function for response attachments; staff upload directly for GFE evidence.
- **Routing:** Add `/pei/respond/:token` to public routes in `App.tsx`, `/staff/pei` to staff routes.
- **Sidebar:** Match existing pattern from `mem://ui/navigation-system` (localStorage `staff_sidebar_open`, NavLink active state).

## Deliverables
- 1 migration: `submit_pei_response` RPC + any missing RLS tweaks.
- 1 edge function: `get-pei-request-by-token`.
- 5 new files: `PEIRespond.tsx`, `PEIResponseViewer.tsx`, route entries, sidebar entry, drawer tab.
- Edits: `ApplicationReviewDrawer.tsx`, `StaffSidebar.tsx`, `App.tsx`, finish `GFEModal.tsx`.

## Verification
- Auto-build PEI rows from a test application's employers.
- Open the tokenized link in incognito → submit response → confirm `pei_requests.status = 'completed'` and viewer renders the response.
- Mark a separate request as GFE → confirm rollup `applications.pei_status` updates correctly.
