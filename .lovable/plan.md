## Goal
After staff clicks the initial Send on a PEI request, automate follow-ups every 5 days (days 5/10/15/20/25) and auto-create a GFE at day 30 if no response was received. All timing is anchored to `date_sent`.

## Cadence
| Day since initial send | Action | Template |
|---|---|---|
| 5, 10, 15, 20, 25 | Send follow-up email | `pei-request-follow-up` |
| 30 | Auto-create GFE (reason `no_response`, signed by "System (Auto-GFE)") | none |

The existing `pei-request-final-notice` template stays available for manual staff use but is not part of the auto cadence (per your choice of the "Day 5,10,15,20,25 follow-ups; day 30 auto-GFE" option).

## Stop conditions (skip and don't advance the schedule)
- Row status is anything other than `sent` or `follow_up_sent` (staff already advanced it to `completed`, `gfe_documented`, or `final_notice_sent`).
- A response has been received (`date_response_received IS NOT NULL`).
- Recipient email is on `suppressed_emails` (bounced/complaint/unsubscribe) — mark the row with a note and stop future auto sends; staff can intervene manually.
- Applicant application is archived/rejected (join `applications` and skip when not in an active review state).

## Implementation

### 1. New edge function `pei-auto-cadence`
Runs on a cron schedule. For each candidate `pei_requests` row:
1. Compute `daysSinceSent = floor((now - date_sent)/day)`.
2. Determine which milestones (5,10,15,20,25) have been reached but not yet sent, using `date_follow_up_sent` plus a new `auto_send_count` column to know how many auto follow-ups already went out.
3. For each due milestone, call the existing `send-transactional-email` with `templateName: 'pei-request-follow-up'` and idempotency key `pei-<requestId>-auto-<dayN>`, then increment `auto_send_count`, stamp `date_follow_up_sent`, set status to `follow_up_sent`.
4. At `daysSinceSent >= 30`, insert the GFE update (`status='gfe_documented'`, `gfe_reason='no_response'`, `gfe_signed_by_name='System (Auto-GFE)'`, `date_gfe_created=now()`) — mirroring `createGoodFaithEffort`.
5. Skip rows that hit any stop condition; on suppression, write `auto_paused_reason='suppressed'` and stop.

Idempotency keys on both the email send and a per-milestone marker prevent duplicate sends if cron runs twice.

### 2. Schema migration
Add to `pei_requests`:
- `auto_send_count int not null default 0`
- `auto_paused_reason text` (nullable: `suppressed`, `manual_override`, etc.)
- `last_auto_send_at timestamptz`

No new tables. RLS unchanged.

### 3. Cron job
`pg_cron` schedule at hourly cadence (`0 * * * *`) invoking the edge function via `net.http_post` with the anon key. Hourly is enough since milestones are 5 days apart — avoids nightly-only drift and keeps sends within business hours per row's timezone (US Central).

### 4. UI touches (minimal)
- `PEIQueuePanel.tsx` / `ApplicationPEITab.tsx`: show a small "Auto: next send in Nd" or "Auto-paused: suppressed" pill next to the status badge, driven by the new columns.
- No changes to the manual Send / Follow-up / Final Notice / GFE buttons — staff can still override at any time, which naturally stops the cadence via the stop conditions.

## Technical notes
- All timestamps compared server-side in the edge function using `date_sent` as the anchor.
- Uses existing `send-transactional-email` pipeline (queue, suppression check, logging) — no new email infra.
- Suppression is already checked inside `send-transactional-email`; the auto function additionally pre-checks `suppressed_emails` so it can set `auto_paused_reason` and stop future runs instead of retrying every hour.
- Auto-GFE writes match `createGoodFaithEffort` semantics so the row surfaces identically in existing UI.
- Config toml: add `[functions.pei-auto-cadence]` with `verify_jwt = false` (called by cron).