# Inspection reminders + fleet calendar

Two additions on top of the quarterly inspection work already built.

## 1. Reminder emails, switched on

The reminder job is already written. It checks every truck's current inspection cycle once a day and sends a notice at 30 days, 14 days and 3 days before the deadline, plus one when a cycle goes overdue. Each driver gets each notice once per cycle — no repeats if the job runs again.

Every reminder lands two ways: a notification inside the app and an email. Each email goes to the one driver assigned to that truck — never a broadcast list. The email names the truck, the assigned month, the deadline date, the $150 fee cap, and what to send back (report + invoice).

Because the new record-keeping only exists once this draft is accepted, switching the daily job on is the last step and happens after acceptance.

## 2. Fleet-wide inspection calendar

A new "Calendar" tab on the Inspection Program page: twelve months across the year, each month listing the units due that month, colour-coded by state.

- Group A months (Oct, Jan, Apr, Jul) and Group B months (Dec, Mar, Jun, Sep) are labelled.
- Makeup months (Feb, May, Aug, Nov) show only units carrying a grace extension or running overdue.
- Each unit chip shows the unit number, driver name, and state: complete, submitted-awaiting-review, upcoming, grace, or overdue.
- Clicking a chip opens that truck in the Vehicle Hub.
- Filters for group, state and driver; a year selector to look back or ahead.
- A one-line summary per month: "8 due, 5 complete, 1 in review, 2 outstanding."
