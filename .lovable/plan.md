## Goal

From the staff portal on desktop, pick a driver, get a QR code, scan it with your phone, and the phone opens SUPERDRIVE already signed in as that driver — a real, fully interactive session, no credentials typed.

## How it works

```text
Desktop (staff)                Phone
  pick driver                    |
  -> create-preview-session      |
     returns one-time code       |
  show QR of /preview-login?c=.. |
                          scan --+--> /preview-login
                                       -> redeem-preview-session
                                          (verifies code, mints login link)
                                       -> real driver session
                                       -> driver portal + "Previewing as" banner
```

## What gets built

**1. One-time code store (database)**
- New table `preview_sessions`: id, code hash, target user id, created-by staff id, created/expires/used/revoked timestamps.
- Codes are single-use and expire after 3 minutes.
- No client access at all (RLS closed, service-role only); everything goes through backend functions.

**2. `create-preview-session` (backend function)**
- Verifies the caller is signed in and holds `management` or `owner`.
- Refuses if the target is not an operator, and refuses to target another owner account.
- Stores the hashed code, writes an `audit_log` entry (who, whom, when).
- Returns the raw code plus its expiry once, to be rendered as the QR.

**3. `redeem-preview-session` (backend function, public)**
- Looks up the code, rejects if missing, expired, already used, or revoked.
- Marks it used immediately, then mints a one-time login token for the target driver (same admin link mechanism already used by the invite functions).
- Writes a second audit entry recording the redemption.
- Returns the token so the phone can establish the session.

**4. `/preview-login` page (new, public route)**
- Reads the code from the URL, calls the redeem function, establishes the driver session, then redirects into the driver portal.
- Shows a clear failure state for expired/used codes with a "ask staff for a new code" message.
- Records a local marker so the app knows this session is a preview.

**5. Staff-facing QR modal**
- New "Open on my phone" action added to the existing Operator Preview picker and to the driver roster row menu.
- Modal shows the QR code, the raw link (copyable), a live countdown to expiry, and a "Generate new code" button.
- QR rendering uses the `qrcode` library (small dependency, added).

**6. Preview session banner (driver app)**
- While the local preview marker is present, a fixed bar sits at the top of the driver portal: "Preview session — signed in as {name}" with an "End preview" button that signs out and returns to the login screen.
- The banner is visually distinct (uses the existing demo/warning treatment) so a preview is never mistaken for a real driver's own session.
- Auto sign-out after 60 minutes of preview session age.

## Notes and trade-offs

- Because you chose real impersonation over read-only, actions taken in a preview are real: uploads, signatures, acknowledgments, and emails all behave as if the driver did them. For live (non-demo) drivers this writes to production data — the audit trail records every preview so those actions can be traced back to the staff member who started them.
- Email rerouting only applies to accounts flagged `is_demo`; previewing a live driver will send real mail to that driver.
- Anyone who intercepts the QR within its 3-minute window can take the session, so codes are short-lived, single-use, and revocable by generating a new one.

## Technical detail

- Session minting reuses `auth.admin.generateLink` + `verifyOtp` with the token hash, matching the existing pattern in `invite-staff` / `resend-invite`.
- Both functions validate the caller with `getClaims(token)` from the Authorization header and check roles via `has_role` with `.limit(1)`, per existing project conventions.
- The redeem function is intentionally public (no JWT) since the phone has no session yet; its only credential is the one-time code.
- The banner mounts inside `OperatorPortal`, separate from the existing `previewUserId` read-only path, which stays unchanged.
