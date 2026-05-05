# Operator Broadcast Emails

Add a way for management staff to compose a subject + body email and send it to all (or selected) active owner-operators, using the existing SUPERTRANSPORT-branded template. Every send is archived for later review.

## What gets built

### 1. New "Broadcast Email" view in Management Portal
A new tab/section (next to existing tools like Release Notes / Resource Library) with two panels:

- **Compose panel**
  - Subject input (required)
  - Body textarea (required, supports line breaks; rendered as `<br/>` like Release Notes already does)
  - Optional CTA: button label + URL (so emails can deep-link into the portal)
  - Recipient selector:
    - "All active operators" (default)
    - "Select operators…" — searchable multi-select listing active operators (name + unit number)
  - Live preview using the same `buildEmail` branded layout
  - Respects each operator's `notification_preferences` (new `broadcast` event type, opt-out only)
  - "Send" button shows count of eligible recipients before confirming

- **Archive panel**
  - Table of past broadcasts: sent date, subject, sender, recipient count, delivered count
  - Click a row → drawer showing full subject/body, CTA, recipient list with per-recipient delivery status, and a "Resend to failed" action

### 2. New edge function `send-operator-broadcast`
Mirrors `send-release-note` but:
- Targets `operators` table (`is_active = true`) instead of staff roles
- Accepts `{ subject, body, ctaLabel?, ctaUrl?, operatorIds?: uuid[] }` — if `operatorIds` is omitted, sends to all active operators
- Authenticates the caller via `getClaims(token)` and verifies `management` or `owner` role (`.limit(1)` pattern)
- Uses `buildEmail()` with existing brand constants (gold #C9A84C, dark #0F1117, SUPERTRANSPORT header)
- Writes one archive row + one row per recipient with delivery status
- Rate-limited 600ms between sends (same as release notes)

### 3. Database (new migration)
- `operator_broadcasts` — id, subject, body, cta_label, cta_url, sent_by (uuid), recipient_scope ('all' | 'selected'), recipient_count, delivered_count, failed_count, created_at
- `operator_broadcast_recipients` — id, broadcast_id (fk), operator_id (fk), email, status ('sent' | 'failed' | 'skipped_optout'), error, created_at
- RLS: only management/owner can SELECT/INSERT (via existing `has_role` SECURITY DEFINER)
- Add `'broadcast'` to the notification event type list so operators can opt out from their preferences modal

### 4. Operator-side opt-out (small addition)
- Add "Broadcast announcements" toggle to the operator's notification preferences modal so the opt-out is honored

## Technical notes

- Reuses `supabase/functions/_shared/email-layout.ts` (`buildEmail`, `sendEmail`, `SUPPORT_EMAIL`) — visual identity stays identical to existing notifications.
- Operator emails are pulled via `supabaseAdmin.auth.admin.listUsers()` and matched to `operators.user_id` (same pattern as `send-release-note`).
- Sender name on the From header uses the existing `${BRAND_NAME} <${ONBOARDING_EMAIL}>` default.
- Archive write happens before sends start; per-recipient rows are upserted as the loop progresses so partial sends are still recorded if the function times out.
- Body input is plain text (newline → `<br/>`) — no raw HTML accepted, preventing injection. Subject limited to 200 chars, body to 10,000.
- New tab gated behind `management` / `owner` role in `ManagementPortal.tsx`.

## Files to create / edit

- `supabase/migrations/<ts>_operator_broadcasts.sql` (new tables, RLS, enum addition)
- `supabase/functions/send-operator-broadcast/index.ts` (new)
- `supabase/config.toml` — add `verify_jwt = false` block for the new function (matches sibling functions)
- `src/components/management/OperatorBroadcastComposer.tsx` (new)
- `src/components/management/OperatorBroadcastArchive.tsx` (new)
- `src/pages/management/ManagementPortal.tsx` (add tab + route entry)
- `src/components/operator/` notification preferences modal — add `broadcast` toggle

## Out of scope (can add later if desired)
- Scheduling sends for a future time
- File attachments (Lovable email infra doesn't support these)
- Rich-text/HTML editor for the body (kept to plain text for safety + simplicity)
- Sending to drivers (non-operator); this is operators-only per the request
