
# Management Dashboard — Sidebar/Page Title Alignment

Standardize sidebar labels and page headers so they match. Also normalize the Inspection Binder header size and add missing page titles.

## Decisions

| Area | Sidebar label | Page header |
|---|---|---|
| Overview | Management Overview | Management Overview |
| Pipeline | Onboarding Pipeline | Onboarding Pipeline |
| PEI Queue | PEI Queue (unchanged) | (page header left as-is per your request) |
| Messages | Messages | Messages (add — currently missing) |
| Notifications | Notifications | Notifications (was "Notification History") |
| Compliance | Fleet Compliance | Fleet Compliance |
| Inspection Binder | DOT Inspection Binder | DOT Inspection Binder (also normalize font size to match other page headers) |
| Equipment | Equipment Inventory | Equipment Inventory |
| Staff | Staff Directory | Staff Directory |
| Activity | Activity Log | Activity Log |
| What's New | What's New | What's New (add — currently missing) |
| Broadcast Email | Broadcast Email | Broadcast Email |
| Email Log | Email Log | Email Log (was "Email Log & Resend") |
| Terminations | Lease Terminations | Lease Terminations |

## Changes

1. **Sidebar (`src/pages/management/ManagementPortal.tsx`)** — update `navItems` labels:
   - Overview → Management Overview
   - Applicant Pipeline → Onboarding Pipeline (also mobile `navItems`)
   - Compliance → Fleet Compliance (also mobile)
   - Inspection Binder → DOT Inspection Binder
   - Equipment → Equipment Inventory
   - Staff → Staff Directory
   - Activity → Activity Log
   - Terminations → Lease Terminations

2. **Page headers** — locate the H1/title in each view component and update:
   - Overview view header → "Management Overview"
   - Messages view → add H1 "Messages"
   - Notifications view header → "Notifications" (drop "History")
   - What's New view → add H1 "What's New"
   - Email Log view header → "Email Log" (drop "& Resend")
   - Broadcast Email view header → "Broadcast Email" (was "Operator Broadcast")

3. **Inspection Binder page header** — restyle the H1 to use the same Tailwind classes as sibling pages (e.g., `text-2xl font-semibold`) so the size matches.

## Notes

- No routing paths change; only display labels.
- PEI Queue intentionally left with mismatched sidebar/page per your instruction.
- After edits, run TypeScript check to confirm no regressions.
