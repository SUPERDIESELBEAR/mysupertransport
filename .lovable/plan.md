## Context

- Applicant: **James Bell** (`belljames838@yahoo.com`), application `2886edcc-76d8-40c8-8d75-57ced5643fe6`.
- Current state in DB:
  - `applications.review_status = revisions_requested` (set 2026-05-14 20:15 UTC)
  - `application_resume_tokens` row: token prefix `A3shpxOJ`, expires 2026-05-21, **unused**
  - No row in `email_send_log` for him (this function still sends through Resend directly, not the queue — that's a separate cleanup, out of scope today)
- His existing inbox link was generated **before** the `APP_URL` / `buildAppUrl` fix shipped, so it still points at the broken `0.0.9.22` host. That's the screen he keeps hitting.

## What I'll do

### 1. Resend the revisions email to James
Invoke `request-application-revisions` for his application with a short, friendly message so a fresh email is generated using the new `buildAppUrl()` helper. The new email's button should resolve to:

```
https://mysupertransport.lovable.app/apply?resume=<token>
```

The previous broken-link email in his inbox should be ignored — he must use the new one.

### 2. Verify the fresh link end-to-end
- Pull the newest `application_resume_tokens` row for James and confirm the token, expiry, and `used_at IS NULL`.
- Check `request-application-revisions` edge logs for any `buildAppUrl` warnings or send errors.
- Open the resume URL in the preview/browser, watch `consume-application-resume` logs to confirm token → draft_token exchange succeeds, and confirm `ApplicationForm` loads his saved answers (no "invalid/expired" screen).

### 3. Confirm the round trip
After the form loads, verify (via DB read, no submit unless you ask) that the consume function did not prematurely mark the token used, and that re-submitting from his side would flip `review_status` back to `pending`. If you want, I can simulate a submit on a copy, but by default I'll stop at "form loaded successfully" and hand off to you to ask James to actually re-submit.

### 4. Report back
- Exact new URL produced
- consume-application-resume log line
- Any anomaly (token reuse, draft missing, timeout)

## Out of scope (noted for follow-up)

- Migrating `request-application-revisions` and `request-application-resume` off direct Resend onto the queue + `email_send_log` — separate cleanup so we get logging/retries on these too.
- Backfilling/refreshing the URL on previously-issued tokens for other applicants (none currently outstanding besides James).

## What I need from you

Just approve and I'll send the new email + run the verification.
