

## Feature Announcement System — In-App Changelog + Email

### Overview
Build a lightweight release notes system where management can post feature announcements that automatically notify all staff via in-app bell notifications and email.

### Database

**New table: `release_notes`**
- `id` (uuid, PK)
- `title` (text, required) — e.g. "In-App Document Preview"
- `body` (text, required) — short description of the change
- `created_by` (uuid, references profiles)
- `created_at` (timestamptz)
- RLS: management/owner can insert/update; all authenticated staff can read

### In-App Notifications

When a release note is inserted, a database trigger iterates over all users with staff roles (`onboarding_staff`, `dispatcher`, `management`, `owner`) and inserts a notification per user into the existing `notifications` table with:
- `type: 'release_note'`
- `title`: the release note title
- `body`: the release note body
- `link`: `/management?view=changelog` (or a dedicated changelog section)

This leverages the existing bell icon and notification infrastructure — no new UI for delivery.

### Email Notifications

The same trigger (or the edge function it calls) sends an email to each staff member using the existing Resend-based email system (not the transactional email scaffold, since this is a one-to-many internal staff notification — not a user-triggered transactional email). The edge function would:
1. Query all staff users' email addresses
2. Send a branded email per recipient with the release note content

### Management UI

Add a "What's New" section (likely a tab or card in the Management Portal) where management can:
- Compose a new release note (title + body)
- See past announcements
- Each post triggers the notifications + emails automatically on save

### Files Changed

| File | Change |
|------|--------|
| Migration | Create `release_notes` table with RLS |
| Migration | Create trigger to notify staff on insert |
| New edge function `send-release-note` | Sends branded email to all staff |
| `src/pages/management/ManagementPortal.tsx` | Add "What's New" tab/section |
| New component `ReleaseNotesManager.tsx` | Compose + list release notes |
| `src/components/NotificationBell.tsx` | Handle `release_note` type (icon/styling if needed) |

### Notes
- Since this targets internal staff only (not end-user operators), it's an admin broadcast — not a marketing email. The emails are triggered by a specific management action and go to a known, finite set of staff members.
- The existing notification preferences system could be extended with a `release_note` event type so staff can opt out if desired.

