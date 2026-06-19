## QPassport Email — Auto-Download on Landing

### Problem
The gold "Download My QPassport" button in the QPassport email currently links to `/operator?tab=progress#qpassport`. Clicking it lands the driver on the portal but does **not** trigger the download. To actually get the file, the driver still has to find the "Download QPassport" button on the page and tap it.

The download itself is a client-side `downloadBlob(qpassportUrl)` call — it requires the app to be loaded and the operator's `onboarding_status.qpassport_url` to be fetched. We can't link directly to the signed PDF from the email (signed URLs expire and aren't generated at email-send time).

### Fix: trigger the download automatically when the driver lands from the email

1. **Update the email CTA URL** (`supabase/functions/send-notification/index.ts`, `qpassport_uploaded` case) from
   `/operator?tab=progress#qpassport`
   to
   `/operator?tab=progress&action=download-qpassport#qpassport`
   Also update `send-test-email/index.ts` to match.

2. **Add an auto-download effect in `OperatorStatusPage.tsx`**:
   - On mount (and whenever `onboardingStatus.qpassport_url` becomes available), read `URLSearchParams` for `action=download-qpassport`.
   - If present and `qpassportUrl` is loaded, call `downloadBlob(qpassportUrl, 'QPassport.pdf')` exactly once, then strip `action` from the URL via `history.replaceState` so a refresh doesn't re-trigger.
   - Guard with a `useRef` flag so it never fires twice in the same session.
   - The existing `#qpassport` hash continues to scroll the timeline section into view, so the banner is still visible immediately for context.

3. **Redeploy** `send-notification` and `send-test-email`, then send a fresh QPassport test to `emma@mysupertransport.com` to verify the download fires automatically on iOS Safari/PWA after login.

### Notes
- Drivers who aren't logged in are routed through the normal auth flow first; the query param survives the redirect, so the download still triggers after login completes.
- No changes to storage policy, no new edge function — purely a frontend trigger reading a URL flag.
- The portal's existing "Download QPassport" button stays in place for manual re-downloads.
