## What gets built

### 1. Filter buttons on the people list

A row of small buttons above the Drivers list: **Active · Onboarding · Inactive · All**, with a count on each. Active is selected when you open Messages, and your choice is remembered next time. Denied people never appear in Active, Onboarding, or Inactive; they only surface under All with a separate "Include denied applications" checkbox.

Search keeps working, but it searches inside the group you have chosen, with a quiet line underneath when a match exists outside it: "2 more matches in other groups".

### 2. A status dot next to every name

Each person in the list gets a small label under their name instead of the generic "Owner-Operator": Active, Onboarding, On hold, Departing, Inactive, Denied. That answers "who can I write to?" at a glance, without opening anything.

### 3. Bulk Message: active-only by default

Bulk Message gets a switch at the top of the recipient step, on by default:

> **Fully active drivers only** — 46 of 154

Turning it off reveals the wider list with the same status labels, so a deliberate onboarding blast is still possible. Denied applicants stay out even with the switch off, unless the same "Include denied" checkbox is ticked. The send confirmation names the group being messaged, e.g. "Send 46 separate messages to fully active drivers?".

### 4. "Who can receive messages" view

A small panel in message settings listing anyone the app cannot reliably reach, with the reason:

- no login account set up yet
- account never activated
- email address bounced or unsubscribed
- driver has muted or blocked that staff member

Right now nothing warns you about these — a message to such a person simply sits unread forever.

### 5. Driver Status inside Messages

Yes — the dispatch status you set in the Driver Status menu can be shown here too. Each active driver's row gets their current status beside the name (Dispatched · Home · Truck Down · Not Dispatched), and a second filter row lets you narrow to one of them. Today that's 17 dispatched, 20 home, 6 truck down, 36 not dispatched.

Bulk Message already has a dispatch-status filter; it now uses the same wording and works together with the active-only switch, so "all active drivers who are currently out on a load" is two clicks.

### 6. Warning banner in the thread

Opening a conversation with someone inactive or denied shows a line at the top: "This driver is no longer active. Messages will not reach anyone monitoring the app." You can still read the history.

### 7. Applicant messaging window

Applicants stay messageable while their application is pending or in revisions, and drop out automatically the moment it is denied — nobody has to remember to clean up.

### 8. Reinstatement

If a denied application is later approved, that person reappears in Active on their own. No manual step.

### 9. Archived conversations

Threads with inactive people move to a collapsed "Archived" section at the bottom of the list instead of cluttering the main one.

### 10. Saved audiences

A recipient filter in Bulk Message can be saved and reused — "All active drivers", "Truck down this week", "Onboarding this month".


## Technical notes

- The unfiltered driver load in `loadDMCandidates` (`src/components/messaging/NewDirectMessageModal.tsx`) is the shared root cause: it does `operators.select('user_id')` with no conditions and feeds `MessagesView`, `NewGroupModal`, and the DM picker. It gains `is_active`, `is_demo`, `on_hold`, `is_departing`, `deactivated_at`, joined `onboarding_status.go_live_date`/`insurance_added_date`, joined `applications.review_status`, and existence of a `lease_terminations` row, returning a derived `lifecycle` field per candidate.
- A single shared helper (`src/lib/messagingAudience.ts`) computes the lifecycle bucket so the rail, the group picker, and Bulk Message can never disagree.
- `src/components/staff/BulkMessageModal.tsx` already queries `onboarding_status`; it adds the same lifecycle derivation, the default-on active switch, and excludes denied unless explicitly included.
- `src/components/staff/MessagesView.tsx` gains the filter chips and persists the choice alongside the existing `superdrive_messages_default_view` preference.
- Reachability panel reads `profiles.account_status`, missing `operators.user_id`, `suppressed_emails`, and `driver_staff_contact_suppressions`.
- Dispatch status comes from `active_dispatch.dispatch_status` (the same source the Driver Status menu writes), joined by `operator_id` in the shared candidate loader; no dispatch row is treated as "Not dispatched".
- Archived threads and saved bulk audiences are stored per user in `user_view_preferences`, so no new tables.
- Presentation only. No schema changes, no policy changes, and no change to who is allowed to send — existing threads and history stay intact.

