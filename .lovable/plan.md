

## Notify Marcus when a driver completes Stage 8

When a driver hits **Submit** on Stage 8 (Contractor Pay Setup), you'll get an instant **in-app notification + email at marc@mysupertranport.com** with everything you need to send them the Everee setup link.

### What you'll see

**The moment a driver submits Stage 8:**

1. **In-app bell badge** — red dot in the top bar:
   > 💰 **Pay setup ready — Bobby Thompson**
   > Submitted as Business (Thompson Trucking LLC). Send the payroll setup link.
   > *Tap to open driver →*

2. **Email to marc@mysupertranport.com** with:
   - Driver's full name
   - Contractor type (Individual / Business)
   - Legal name + business name (if applicable)
   - Phone & email
   - One-click "View Driver" button → operator detail panel
   - Submitted timestamp

3. **Desktop push** if the tab is hidden (joins `truck_down` and `new_message` in the high-priority push set).

**In Notification Preferences (Management):**
A new toggle row appears:
> 💰 **Pay Setup Submitted** — When an operator completes Stage 8 (Contractor Pay Setup) — *In-app · Email*

Default: **ON for owner (you)**, OFF for other management users — they can flip it on if they want a copy.

**No-spam guard:** If a driver edits and re-submits within 30 minutes, you don't get a second alert (same dedupe pattern as `truck_down`).

### How it works (technical)

**1. Database — one trigger + one event type**

New trigger `notify_owner_on_pay_setup_submitted` on `public.contractor_pay_setup` (AFTER INSERT OR UPDATE):
- Fires only when `submitted_at` transitions from NULL → NOT NULL **AND** `terms_accepted = true`.
- Looks up every user with role `owner` or `management` who has `pay_setup_submitted` enabled in `notification_preferences` (defaults TRUE for owner, FALSE for others — seeded in the migration).
- Inserts an in-app `notifications` row per recipient with `type = 'pay_setup_submitted'`, link `/management?operator=<id>`.
- Calls `net.http_post` to a new edge function `notify-pay-setup-submitted` for the email side.

**2. Edge function — `notify-pay-setup-submitted`**
- Receives `{ operator_id, contractor_pay_setup_id }`.
- Joins `operators → applications` for driver name + `contractor_pay_setup` for the submitted info.
- Sends a Resend email (same template style as `notify-onboarding-update`) to every recipient whose `email_enabled = true` for `pay_setup_submitted`.

**3. Frontend — small additions**
- `src/components/management/NotificationPreferencesModal.tsx`: add `pay_setup_submitted` row with `Banknote` icon, gold accent.
- `src/components/staff/StaffNotificationPreferencesModal.tsx`: same row.
- `src/components/NotificationBell.tsx` + `src/components/management/NotificationHistory.tsx`: add icon mapping for `pay_setup_submitted`.
- `src/hooks/useDesktopNotifications.tsx`: add `'pay_setup_submitted'` to `HIGH_PRIORITY_TYPES`.

**4. Seeding owner default**

In the same migration:
```sql
INSERT INTO public.notification_preferences (user_id, event_type, in_app_enabled, email_enabled)
SELECT user_id, 'pay_setup_submitted', true, true
FROM public.user_roles WHERE role = 'owner'
ON CONFLICT (user_id, event_type) DO NOTHING;
```

You (Marcus) get both channels enabled the moment the migration runs — and the email goes to **marc@mysupertranport.com** (the address on your owner account).

> **Note on the email address:** I'll send to whatever email is on your auth account. If your account email is different from `marc@mysupertranport.com` (note: that spelling is missing the "s" in "transport" — the project's published domain is `mysupertransport.lovable.app`), let me know and I'll update your owner profile email to match before deploying. Otherwise the email will go to whatever is currently on your auth user record.

### Files touched

```text
supabase/migrations/<new>.sql                              [trigger + seed]
supabase/functions/notify-pay-setup-submitted/index.ts     [NEW — email sender]
src/components/management/NotificationPreferencesModal.tsx [+ toggle row]
src/components/staff/StaffNotificationPreferencesModal.tsx [+ toggle row]
src/components/NotificationBell.tsx                        [+ icon mapping]
src/components/management/NotificationHistory.tsx          [+ icon mapping]
src/hooks/useDesktopNotifications.tsx                      [+ high-priority type]
```

### Out of scope

- No change to the operator-facing Stage 8 UI.
- No automation of the Everee link send — you stay in the loop.
- Re-submissions within 30 minutes are de-duped.

