# Cleaning up who shows in Messages

## What I found

The people list in Messages is not filtered at all. It loads every driver record that has ever existed and shows them all under "All".

Checked against the live records right now:

- 154 driver records appear in the list
- only 60 are still active, and only 46 of those are fully live (gone through go-live and insurance)
- 51 of the names in that list belong to people whose application was **denied**
- 34 people have a lease termination on file
- 12 are on hold, 1 is a demo/test account

So roughly two out of three names in the "All" list are people you should not be messaging. The same unfiltered list feeds New message, New group chat, and Bulk Message.

## Proposed people groups

Instead of one flat list, the list gets a small row of filter buttons at the top, defaulting to **Active**:

- **Active** (default) — currently driving: active record, gone live, not terminated
- **Onboarding** — approved applicants and drivers still being set up, plus anyone pending or in revisions
- **Inactive** — terminated, deactivated, or departed drivers, hidden unless asked for
- **Denied** — hidden by default and only reachable through a "Show denied" toggle inside Inactive, so a denied applicant is never one mistaken click away

Denied people are never shown in the default list, never in Bulk Message, and never in the group-chat picker. Existing conversations with them stay readable in history so nothing disappears — they just stop appearing as someone new to write to.
