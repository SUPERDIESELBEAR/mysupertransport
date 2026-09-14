# Available unit numbers: fix the red error

## What you are seeing

Both the Onboarding Pipeline (Stage 5 — Onboard Systems) and the Vehicle Hub
Unit Numbers dialog read the same list of available unit numbers. That list
currently fails outright with `CREATE TABLE is not allowed in a non-volatile
function`, so no recycled numbers, no gaps and no "next available" appear
anywhere. Staff can still type a number by hand — nothing has been assigned
wrongly, the list simply never loads.

## Why it fails

Confirmed against the live database: the available-numbers routine is declared
read-only, but its body builds a temporary scratch table to hold the working
set. A read-only routine is not permitted to create anything, so the database
refuses the whole call before any numbers are computed. Every caller gets the
same message, which is why the two screens show identical text.

The lookup of who holds a typed number is a separate routine and is unaffected.

## The fix

Rewrite the available-numbers routine to compute the same result in a single
query, with the working set held in inline sub-queries instead of a scratch
table. Nothing about the rules changes:

- recycled numbers first (freed by a driver who never reached Go-Live), oldest
  freed first
- then never-issued gaps inside the sequence
- then the next number in sequence
- excluded test numbers (000, 1900, 1901) stay excluded, demo drivers stay out,
  and a number held by anyone live or still onboarding stays taken
- still staff-only: onboarding staff, management and owner; everyone else is
  refused

No new tables, no new settings, no change to either screen's appearance.
