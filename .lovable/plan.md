
## Full Resend Function Test Plan

### What we're testing
All 8 edge functions that call Resend, in a logical order that groups them by the UI action needed to trigger each one. One function was already confirmed working (`send-cert-reminder`).

---

### Test sequence

**Group 1 — Application Pipeline (requires a test applicant)**

These three fire in sequence when processing an application through the pipeline. We'll use a scratch test applicant (e.g. `test-applicant@mysupertransport.com`) submitted via the public form, then process it:

| # | Function | Trigger | Expected email recipient | From address |
|---|----------|---------|--------------------------|--------------|
| 1 | `send-notification` → `new_application` | Submit the application form | All management users | onboarding@ |
| 2 | `invite-operator` + `send-notification` → `application_approved` | Click Approve in Management Portal | Applicant email | onboarding@ |
| 3 | `deny-application` + `send-notification` → `application_denied` | Click Deny on a second test applicant | Applicant email | onboarding@ |

**Group 2 — Staff Invite**

| # | Function | Trigger | Expected email recipient | From address |
|---|----------|---------|--------------------------|--------------|
| 4 | `invite-staff` | Invite a new staff member (Invite flow, not Manual Create) from Staff Directory | New staff email | onboarding@ |

**Group 3 — Operator Lifecycle (requires existing operator)**

| # | Function | Trigger | Expected email recipient | From address |
|---|----------|---------|--------------------------|--------------|
| 5 | `resend-invite` | Click "Resend Invite" on an approved-but-not-yet-activated operator | Operator email | onboarding@ |
| 6 | `notify-onboarding-update` | Toggle any onboarding milestone (e.g. flip ICA status to `sent_for_signature`) | Operator email | onboarding@ |
| 7 | `send-cert-reminder` | Click the bell/reminder button in Driver Hub | Operator email | onboarding@ ✅ already confirmed |

**Group 4 — Document & Upload Events**

| # | Function | Trigger | Expected email recipient | From address |
|---|----------|---------|--------------------------|--------------|
| 8 | `notify-document-update` → `published` | Publish a new document in Document Hub | All operators | onboarding@ |
| 9 | `notify-upload-attention` | Flag a driver upload as "Needs Attention" in the Inspection Binder | Driver's email | support@ |

---

### What we need before starting
- Be logged in as a **management** user in the preview (required for Groups 1, 2, 3, 4)
- Have at least one operator on file with a real or test email address (Groups 3 & 4)
- A real email inbox to check delivery (or access to `marc@mysupertransport.com` as the recipient)

### Process
I'll fire each test live using the `supabase--curl_edge_functions` tool (or by triggering the UI action in the browser), then check the edge function logs immediately after to confirm `200 OK` and no Resend errors. For each one I'll report:
- HTTP status returned
- Whether Resend accepted the send (`"id":` in the response)
- Any error message if it failed

### What's NOT being tested here
- `check-cert-expiry` / `check-inspection-expiry` — scheduled jobs (no Resend, verified separately via logs)
- `notify-idle-operators` — in-app only, no Resend
- `encrypt-ssn` / `decrypt-ssn` / `get-staff-list` — no email at all

---

### Technical notes
- `notify-document-update` with `event_type: 'published'` will email **all operators** in the database — confirm you're okay with that before I fire it, or I can target it with specific `acknowledged_user_ids` instead
- `send-notification` → `new_message` type requires a `recipient_user_id` (operator's auth ID) — I'll query that from the database before calling it
- All functions except `notify-onboarding-update`, `resend-invite`, and `notify-upload-attention` require either no auth or a service-role key — the curl tool can handle this directly
