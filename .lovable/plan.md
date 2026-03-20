
## Plan: Test Resend Domain Verification

**What we're doing**: Fire a real test email via the `send-cert-reminder` edge function to the operator on file (`marc@mysupertransport.com`). This will make a live call to Resend and reveal immediately whether `mysupertransport.com` is verified or still blocked.

### How the test works

The edge function requires an authenticated staff user, a valid `operator_id`, and dummy expiry data. We'll call it from the plan perspective — once approved I'll invoke it live using the curl tool:

- **Operator ID**: `ec79e22f-3001-4e5b-b8d1-7347e7a4c718`
- **Recipient**: `marc@mysupertransport.com`
- **Doc type**: `CDL` with a dummy 45-day expiry window (non-critical, informational tone)
- **From address**: `onboarding@mysupertransport.com`

### Expected outcomes

| Result | Meaning |
|--------|---------|
| `{ "success": true, "sent_to": "marc@..." }` | Domain is verified — Resend accepted the send |
| `email_error` contains `domain is not verified` or `validation_error` | DNS records still pending |
| `401 Unauthorized` | Need to be logged in as staff first |

### After the test

- If **verified**: email arrives in `marc@mysupertransport.com` inbox within seconds.
- If **not verified**: I'll surface the exact DNS records still missing from the Resend error response so you know exactly what to fix.

No code changes are needed — this is a pure live API test.

**Prerequisite**: You'll need to be logged in as a staff/management user in the preview for the auth token to pass through. The session replay shows the preview is active — confirm you're logged in and I'll fire the test.
