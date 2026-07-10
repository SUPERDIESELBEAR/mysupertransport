## Goal

Give every management-portal user a small, dismissible popup when an active driver has a birthday or Go Live anniversary today — with early appearance if that date falls on a weekend or US federal holiday. Each popup offers a "Send Message" action that opens a composer to send a personalized email + in-app notification, and an X to dismiss (per-user).

## Behavior

**Trigger dates** (US Central Time, matches existing birthday/anniversary job):
- On the actual date, OR
- If the date falls on Sat/Sun → show starting the prior Friday
- If the date falls on a US federal holiday → show starting the prior business day
- Popup keeps showing on every login/refresh until the current user dismisses it or sends a message

**Who sees it:** every user with a management/owner/dispatcher/onboarding_staff role (any StaffLayout user).

**Popup UI:**
- Small stacked toast-style cards in the bottom-right of the management portal (above existing toasts)
- Each card shows: driver name + avatar, event label, and two buttons: **Send Message** and **X**
- Event labels & emojis:
  - Birthday, actual day → 🎂 "Birthday Today" (e.g. "Jane Doe — Birthday Today")
  - Birthday, early (weekend/holiday) → 🎂 "Upcoming Birthday" with the real date shown (e.g. "🎂 Upcoming Birthday — Sunday, Jul 12")
  - Anniversary, actual day → 🎉 "3-Year Anniversary Today"
  - Anniversary, early (weekend/holiday) → 🎉 "Upcoming 3-Year Anniversary — Sunday, Jul 12"
- Birthday always uses 🎂; anniversary always uses 🎉 — never mixed
- Up to ~3 cards visible, rest collapsed under "+N more"
- Non-blocking, no red badge on the nav

**Send Message composer** (modal):
- Pre-fills subject + body from the existing birthday/anniversary templates, fully editable
- Channels: email (checked) + in-app notification (checked), each toggleable
- On send: calls a new edge function that emails via the transactional pipeline and inserts a `notifications` row, then marks the event acknowledged for the current user and closes the popup
- Respects the driver's `notification_preferences` for `birthday_anniversary` (grays out disabled channels with a tooltip)

**Dismissal:** X marks the event acknowledged for the current staff user only; other staff still see it. Acknowledgment auto-resets each year (keyed by event date).

## Data

New table `staff_event_acknowledgments`:
- `id`, `user_id` (staff), `operator_id`, `event_type` ('birthday' | 'anniversary'), `event_date` (the actual calendar date, not the pre-warning date), `acknowledged_at`
- Unique on (user_id, operator_id, event_type, event_date)
- RLS: staff can read/insert their own rows; service_role full access
- GRANTs per project convention

## Technical section

**New files**
- `src/hooks/useStaffBirthdayAnniversaryEvents.ts` — fetches active operators with `applications.dob` and `onboarding_status.go_live_date`, computes today's/upcoming events in CT with holiday+weekend shift logic, filters out acks for the current user, returns `{ events, acknowledge, refetch }`. Each event carries `{ kind: 'birthday'|'anniversary', isEarly: boolean, actualDate, operator }`. Small US federal holiday list embedded (fixed + observed dates for current year, computed).
- `src/components/staff/BirthdayAnniversaryPopup.tsx` — stacked cards UI, uses the hook. Renders label + emoji per the rules above. Mounted once inside `StaffLayout`.
- `src/components/staff/SendBirthdayAnniversaryModal.tsx` — composer with editable subject/body, email + in-app toggles, preview of pre-filled template.
- `src/lib/birthdayAnniversary/templates.ts` — subject/body defaults (mirrors what `send-birthday-anniversary` already sends) for staff-authored variant.
- `supabase/functions/send-staff-birthday-message/index.ts` — staff-auth edge function: validates JWT + staff role via `getClaims`, sends transactional email via existing pipeline, inserts `notifications` row, returns success.
- `supabase/migrations/<ts>_staff_event_acknowledgments.sql` — table + grants + RLS.

**Edits**
- `src/components/layouts/StaffLayout.tsx` — mount `<BirthdayAnniversaryPopup />` (single instance).

**No changes to:**
- Existing `send-birthday-anniversary` cron function (still auto-sends templated message on the actual day; staff popup is a parallel personalization channel).
- Notification bell / red badges.

**Edge cases**
- Anniversary only counts when go_live_date year < current year (matches existing logic).
- Birthday + anniversary same day → two separate cards, distinct emojis.
- Popup hidden if the acknowledgment already exists for this user/event/year.
- If both channels are disabled in operator's preferences, Send button shows tooltip "Driver has opted out of birthday notifications".
