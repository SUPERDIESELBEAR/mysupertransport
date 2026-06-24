# Status of open / read tracking on the management side

## What exists today

**Broadcasts — fully tracked.** `Management → Broadcast → (open an archived broadcast)` shows:
- Summary chips: `Opened: x/total`, `Read in app: x/total`, and `Acknowledged: x/total` when ack was required.
- A per-recipient list with a colored badge per driver/staff: `Acknowledged` (gold) → `Read` (green) → `Opened` (outline) → raw delivery status fallback.

Plumbing behind it:
- `broadcast-track-open` edge function — 1×1 pixel embedded in every broadcast email; stamps `operator_broadcast_recipients.opened_at` on first load.
- `broadcast-acknowledge` edge function — called when the operator opens the broadcast in-app; stamps `read_at` (and `acknowledged_at` when required).
- Stats query in `OperatorBroadcast.tsx` reads `opened_at / read_at / acknowledged_at` directly.

So for the **Broadcast Center**, the answer is **yes**, management can already see who opened, who read in-app, and who acknowledged.

**Email Log page — delivery only, no opens.** `Management → Email Log` reads `email_send_log`, which only stores delivery state (`pending / sent / failed / bounced / suppressed / dlq`). There is no `opened_at` column, no tracking pixel on those templates (PEI invites, application revision/resume links, QPassport test, new-message notifications, birthday/anniversary, PWA reminders, etc.), and no per-recipient open count surfaced in the UI.

**Live data check.** Across all broadcasts to date there is 1 recipient row and 0 opens recorded — so even on the broadcast side we have no real-world opens to verify with. The most likely reasons:
- The only broadcast sent so far was to a single recipient who hasn't opened the email in a client that loads remote images.
- Some clients (Gmail image proxy, Apple Mail Privacy Protection) will pre-fetch the pixel and inflate opens, while others (plain-text view, image blocking) will never fire it. This is normal for any pixel-based system.

## Proposed plan

### 1. Email Log: add open tracking for transactional emails
- Add `opened_at TIMESTAMPTZ` and `open_count INT DEFAULT 0` to `email_send_log` (migration + GRANTs already in place on the table).
- New edge function `email-track-open` (mirrors `broadcast-track-open`):
  - URL: `/functions/v1/email-track-open?m={message_id}&t={token}`.
  - Validates a short HMAC token (derived from `message_id` + an `EMAIL_TRACK_SECRET` env var) so opens can't be forged or enumerated.
  - On match → `UPDATE email_send_log SET opened_at = COALESCE(opened_at, now()), open_count = open_count + 1 WHERE message_id = $1`.
  - Always returns the 1×1 transparent GIF, never reveals success/failure.
- Add `EMAIL_TRACK_SECRET` via `add_secret`.
- Helper in `supabase/functions/_shared/email-layout.ts`: `appendTrackingPixel(html, messageId)` that injects `<img src="…/email-track-open?m=…&t=…" width="1" height="1" alt="" style="display:none">` just before `</body>`. `sendEmail` becomes the single place that calls it, so every template gets tracked automatically.
- Skip injection for: `pending` placeholder sends, transactional system mails to internal automations (e.g. cron summaries), and any explicit `{ trackOpens: false }` override.

### 2. Email Log UI updates
- Add an **Opened** stat card next to Sent/Pending/Failed.
- Add an **Opened** column (timestamp + count, or em-dash) to the log table.
- Add an `Opened` option to the status filter (sent + opened, sent + unopened).
- Tooltip on the column header explaining the limitations of pixel tracking (image blockers, Apple Mail Privacy Protection inflates opens).

### 3. Per-recipient summary for bulk sends
For templates sent to many recipients in one batch (PEI bulk, broadcast reminders, etc.) the table is already per-row by `recipient_email`, so no extra schema is needed — opens will naturally show per row once step 1 is in place.

### 4. Optional small fix on the broadcast side
Surface the Broadcast open/read stats on the **Email Log** page too, so management has one place to look. Concretely: in `EmailLogPanel`, when a row's `template_name === 'operator-broadcast'`, link "View recipients" → opens the same archive dialog from `OperatorBroadcast.tsx`.

## Out of scope
- Click tracking (would need link rewriting through a redirector — separate effort).
- Bounce/complaint webhook upgrades (already handled by Resend → `email_send_log.status`).
- No changes to the existing `broadcast-track-open` / `broadcast-acknowledge` flow.

## Verification
- Send a test transactional email (e.g. `send-test-email` for QPassport) to a Gmail/Apple Mail inbox → confirm the pixel URL hits the function, `email_send_log.opened_at` populates, and the Email Log row shows an Opened timestamp.
- Send a broadcast to two operators → confirm both stats chips and the per-recipient list update as before (regression check).
- Confirm forged `m=` values with bad `t=` tokens return the pixel but do NOT stamp any row.

## Technical notes
- Files touched: `supabase/migrations/<new>.sql`, `supabase/functions/email-track-open/index.ts` (new), `supabase/functions/_shared/email-layout.ts`, `src/components/management/EmailLogPanel.tsx`. No client-side schema regen needed beyond the auto-generated `types.ts`.
- Token format: `base64url(hmacSha256(EMAIL_TRACK_SECRET, message_id)).slice(0, 16)` — short, unguessable, deterministic so we can compute it once at send time.
