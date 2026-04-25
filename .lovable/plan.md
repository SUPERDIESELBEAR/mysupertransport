## Launch SUPERDRIVE Invite — Implementation Plan

A one-time onboarding launch email for the **35 active pre-existing operators** who were added directly into the dashboard (no application), with **three independent ways to send it**: one-at-a-time, hand-picked batch, or send-to-all.

---

### 1. New Email Template — `welcome-superdrive.tsx`

**Location:** `supabase/functions/_shared/email-templates/welcome-superdrive.tsx`

A branded React Email template matching the existing six auth templates (gold `#C9A84C` accent bar, SUPERTRANSPORT wordmark, Inter font, white background).

**Content sections:**
1. **Hero**: "Welcome to SUPERDRIVE" + personalized greeting (`Hi {firstName}`)
2. **Intro paragraph**: Briefly explains SUPERTRANSPORT built a dedicated app for its operators
3. **Feature highlight cards** (icon + title + 1-line description) for:
   - 🔍 **Inspection Binder** — Carry your DOT binder in your pocket
   - 💰 **Settlement Forecast** — Track your settlements before they post
   - 🚛 **My Truck** — All your truck info, photos, and registrations
   - 📍 **Dispatch Status** — Update your status and current load lane
   - 💬 **Direct Messages** — Talk to dispatch and onboarding staff
   - 📅 **Payroll Calendar** — Wed–Tue work week + pay dates
4. **Primary CTA button**: "Set Up Your Password" → recovery link
5. **Install-as-app callout**: Brief instructions to add SUPERDRIVE to home screen (PWA)
6. **Footer**: Help line / contact

---

### 2. New Edge Function — `launch-superdrive-invite`

**Location:** `supabase/functions/launch-superdrive-invite/index.ts`
**Config:** `verify_jwt = false` is **NOT** needed — this MUST require auth so only management/owner can invoke it.

**Authorization:** Validate JWT via `getClaims()`, then check the caller has the `owner` or `management` role (using the `.limit(1)` multi-role pattern from existing edge functions).

**Request body:**
```ts
{ operator_ids: string[] }   // 1 to N operator UUIDs
```

**Per-operator logic:**
1. Look up the operator's email (from `applications` if linked, otherwise from `auth.users` via the `user_id`)
2. **Idempotency**: Skip if `email_send_log` shows `template_name = 'welcome-superdrive'` for this address sent in the last **30 days** (returned in response so UI can flag it)
3. Generate a `recovery` link via `supabase.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: `${APP_URL}/reset-password` } })`
4. Enqueue the email through the existing `enqueue_email` RPC into `transactional_emails` queue with `templateName: 'welcome-superdrive'` + `templateData: { firstName, recoveryUrl }`
5. Insert an `audit_log` entry (`action: 'superdrive_invite_sent'`, entity = operator)

**Response:**
```ts
{
  sent: [{ operator_id, email }],
  skipped: [{ operator_id, email, reason: 'recently_invited' | 'no_email' | 'no_user_account' }],
  failed: [{ operator_id, error }]
}
```

---

### 3. New UI — `LaunchSuperdriveDialog.tsx`

**Location:** `src/components/management/LaunchSuperdriveDialog.tsx`

A modal that lists all eligible pre-existing operators (`is_active = true`, `skip_invite = true`) with:

- **Search bar** (filter by name)
- **Filter pills**: "Never invited" / "Invited 30+ days ago" / "All eligible"
- **Per-row checkbox** + name + email + last-invited badge ("Invited 12 days ago" if applicable, with cooldown lock)
- **Select All / Deselect All / Select Never-Invited** buttons (top of list)
- **Selection counter**: "3 of 35 selected"
- **Send button** (disabled when 0 selected) → calls `launch-superdrive-invite` with `operator_ids`
- **Live progress** during send (sent / skipped / failed counts)
- **Result summary** with collapsible sections per outcome

Mobile-responsive following the established `max-h-[90dvh]` pattern.

---

### 4. Entry Points (Three Send Modes)

| Mode | Where | Trigger |
|---|---|---|
| **One-at-a-time** | `src/pages/staff/OperatorDetailPanel.tsx` | New "Send SUPERDRIVE Invite" button (gold, secondary) in the operator's action area. Visible only to management/owner, only when operator is pre-existing (`skip_invite = true`). Calls the same edge function with `operator_ids: [operator.id]`. Shows last-invited timestamp. |
| **Hand-picked batch** | `src/components/drivers/DriverHubView.tsx` | New "Launch SUPERDRIVE" button in the header (visible to management/owner only) → opens `LaunchSuperdriveDialog` with checkboxes for hand-picking |
| **Send to all** | Same dialog | "Select All" → "Send" |

---

### 5. Email Catalog Preview

**File:** `src/components/management/EmailCatalog.tsx`

Add a new entry "Welcome to SUPERDRIVE (Launch Invite)" in the existing catalog with:
- Description, trigger ("Manually sent by management"), recipient ("Pre-existing operators")
- Live HTML preview (rendered the same way the other six auth templates are previewed)

---

### 6. Audit Trail

Each send writes to `audit_log`:
- `action`: `superdrive_invite_sent`
- `entity_type`: `operator`
- `entity_label`: operator's name
- `metadata`: `{ template: 'welcome-superdrive', email, recovery_link_generated: true }`

This shows up in the existing Activity Log UI automatically.

---

### 7. Files Created / Modified

**New files (4):**
- `supabase/functions/_shared/email-templates/welcome-superdrive.tsx`
- `supabase/functions/launch-superdrive-invite/index.ts`
- `src/components/management/LaunchSuperdriveDialog.tsx`
- (No new pages — entry points hook into existing views)

**Modified files (3):**
- `src/components/drivers/DriverHubView.tsx` — Add "Launch SUPERDRIVE" header button + dialog
- `src/pages/staff/OperatorDetailPanel.tsx` — Add per-operator "Send SUPERDRIVE Invite" button
- `src/components/management/EmailCatalog.tsx` — Add catalog entry + preview

**No DB migration needed** — uses existing `transactional_emails` queue, `email_send_log`, `audit_log`, and `auth.users`.

---

### 8. DNS / Sender Address

DNS for `notify.mysupertransport.com` is still verifying. The launch button will be **fully functional immediately** — emails will queue and send the moment you click. Until DNS goes green, they'll send from the default Lovable sender; once verified, they'll automatically switch to `welcome@notify.mysupertransport.com` with no code change.

You can:
- **Build now, send now** — emails go out from the default sender (still branded, just default From address)
- **Build now, send after DNS verifies** — recommended; everything ready to fire as soon as DNS is green

---

### 9. Safety Rails

- **Authorization**: Only management/owner can invoke
- **30-day idempotency**: Prevents accidental double-sends
- **Per-row badges**: Operators recently invited show a lock icon with cooldown countdown
- **Send-to-self test**: You can send to your own management email first by selecting yourself if you appear in the eligible list — recommended as the first send
- **No bulk loop in client code**: The client passes an array; the edge function loops server-side (clean, auditable, idempotent)

---

### Recommended First Use Sequence
1. Open **Launch SUPERDRIVE** dialog → select **2–3 trusted operators** → Send
2. Confirm they receive the email, click the button, set their password, and land in SUPERDRIVE
3. Return to the dialog → **Select All** (remaining ones, the already-sent will be locked) → Send

Ready to build on approval.