# Email routing: how it works today, and a Staff Email Settings control panel

## Part 1 — Remove the "View Driver" button from Pay Setup emails

Drop the gold **View Driver →** button from the pay setup notification. Everything else stays; the closing line is reworded so it no longer points at a button ("Open SUPERDRIVE and go to the driver's detail panel to review the full pay setup and send the Everee payroll link.").

## Part 2 — What decides who gets which email today

There is no single place that controls this. Each email is sent by its own backend function, and each one hardcodes its own recipient rule. There are three different patterns in use:

1. **Role list only.** The function asks for everyone holding certain roles and emails all of them. Example: cert reminders go to onboarding staff + dispatchers + management, period.
2. **Role list, then per-person preference.** The function asks for a role list, then checks each person's saved notification preference for that event, with a built-in default when they've never saved one. Pay Setup works this way: owner + management only, owner defaults ON, management defaults OFF. That is exactly why "only certain people" get it.
3. **Hardcoded address.** A specific email is baked into the code (for example the deactivation notice always copies an outside consultant).

Staff can already self-manage some of this: the bell/settings modal in the staff and dispatch portals shows a list of event types filtered to their own roles with in-app and email toggles. But it has real gaps:

- Staff can only change **their own** settings; the owner cannot set anyone else's.
- The list only covers ~10 event types. Most emails the system sends (application actions, binder shares, retake requests, deactivation notices, broadcasts, ELD escalations) are not in it at all, so they cannot be turned on or off by anyone.
- The role defaults are hardcoded in the sending functions, so "should onboarding staff get pay setup emails?" is a code change, not a setting.

## Part 3 — Proposed Email Notification Settings

A single control surface, owned by management/owner, backed by one shared recipient rule.

**Where it lives:** a new "Email Notifications" tab inside Staff Directory, plus a per-staff "Email settings" action on each staff row. Individual staff keep their existing self-service modal, which will read the same data.

**Two layers:**

- **Role defaults** — a grid of email categories (rows) by role: owner, management, onboarding staff, dispatcher, truck owner (columns). Each cell is on/off. This is the "who normally gets this" baseline and is editable by owner/management only.
- **Per-staff overrides** — for any individual, any category can be forced ON or OFF regardless of their role default. The staff view shows three states per row: Default (follows role), Always on, Always off.

**Resolution rule at send time:** person's override if one exists → otherwise their role default (if they hold any role that has it on) → otherwise no email.

**Categories** (grouping the emails that actually exist today, so every send is covered):

- Applications — new application, moved to pending, revisions requested/reverted, denial, correction requests, document retake requests
- Onboarding — milestones, documents uploaded, idle operator alerts, pay setup submitted, payroll docs
- Compliance — CDL/Med cert 30-day and 60-day, inspection expiry, ELD escalations
- Dispatch — truck down, dispatch status change
- Messaging — 48-hour unread message reminder
- Fleet & documents — binder shares, officer packets, onboarding-to-vehicle-hub sync notices
- Staff & admin — staff invites, release notes, deactivation notices, birthdays/anniversaries

**Also included:**
- Each category row shows a live "currently receiving" list so the owner can see, at a glance, exactly who gets that email.
- A test-send button per category (sends only to the person clicking it).
- Changes to defaults and overrides are written to the audit log.

**Not included:** driver-facing emails (application status, invites, ICA signing) stay as-is — those are addressed to the driver, not routed by staff role.

## Technical detail

- New table `notification_role_defaults` (role, category, email_enabled) seeded to match current behavior so nothing changes on day one.
- Extend `notification_preferences` with a nullable tri-state override keyed by category; keep existing rows working.
- New shared helper `supabase/functions/_shared/recipients.ts` exporting `resolveEmailRecipients(category)`, implementing the resolution rule once.
- Refactor the sending functions listed above to call that helper instead of their own `in('role', [...])` blocks. Hardcoded addresses (deactivation consultant) become a managed recipient entry rather than a literal in code.
- New `EmailNotificationSettings` component under `src/components/management/staff-directory/`, and update `StaffNotificationPreferencesModal` to read categories from the same source.
- RLS: only owner/management may write role defaults; a staff member may write their own overrides, owner/management may write anyone's.

This is a large change touching ~25 backend functions. It can ship in two passes if preferred: settings surface + resolver first (with the highest-pain categories wired in), then the remaining functions migrated.
