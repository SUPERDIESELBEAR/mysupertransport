## Plan: Send QPassport test email to emma@mysupertransport.com

No code changes. Single action:

1. Invoke the deployed `send-test-email` edge function with body `{ "email": "emma@mysupertransport.com" }`.
2. The function will:
   - Look up the most recently uploaded QPassport on file.
   - Mint a fresh signed token via `buildQPassportDownloadUrl`.
   - Send the updated "Your QPassport is Ready" email (subject: *Action Required: Download Your QPassport*) with the new **"Open QPassport"** CTA pointing at the viewer page.
3. Report back: the function response status, and (if it failed) the error from `supabase--edge_function_logs`.

### What you should see in the inbox
- From the configured Resend sender.
- Gold **"Open QPassport"** button.
- Clicking it opens the PDF inline in a new tab AND auto-downloads `QPassport.pdf`.

### Fallback if the function errors
- If no operator on file has a QPassport uploaded yet, the link will fall back to the portal URL — the email will still arrive but the button won't open a PDF. In that case I'll tell you and we can upload a QPassport to a test operator first, then resend.
