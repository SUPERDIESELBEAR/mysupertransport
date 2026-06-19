## QPassport Email — "Download My QPassport" Button Not Clickable

### Root cause
The QPassport email (`qpassport_uploaded` case in `supabase/functions/send-notification/index.ts`) renders its CTA through the shared `buildEmail()` helper in `supabase/functions/_shared/email-layout.ts`. That helper was already rewritten to use the bulletproof `<table>`-based button pattern when we fixed the Drug Screening email — same root cause, same fix.

The QPassport function just needs to be **redeployed** so it picks up the updated shared layout. The CTA URL (`/operator?tab=progress#qpassport`) is already correct and routes the driver directly to the Background Check stage where the QPassport download lives.

### Steps

1. **Redeploy `send-notification`** so it bundles the latest `_shared/email-layout.ts` with the bulletproof button.
2. **Update `send-test-email`** to mirror the QPassport copy (subject, heading, body, CTA label "Download My QPassport", URL `https://mysupertransport.lovable.app/operator?tab=progress#qpassport`) and redeploy.
3. **Invoke `send-test-email`** to deliver a QPassport test to `emma@mysupertransport.com`.
4. Ask the user to confirm on iOS Gmail that the gold button is now tappable and lands on the Background Check section.

### Notes
- No template copy or routing changes — clickability only.
- No DB/schema changes.
- The `send-test-email` function stays in place for the next round of verifications; it can be deleted afterward.
