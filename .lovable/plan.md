# Stranded-applicant contact report

Read-only. Nothing was changed. Everything below comes from live queries.

## The call list

Population: `is_draft = true`, at least one resume token with `used_at NOT NULL`, and no
submitted (`is_draft = false`) application under the same email. Ordered by step
descending.

**Row count: 4.**

| Step | Name | Phone | Email | Last updated (UTC) | Latest token issued (UTC) | Live token now | Tokens issued |
|---|---|---|---|---|---|---|---|
| 9 | Timothy Mozingo | (678) 436-2108 | timothy.mozingo@yahoo.com | 2026-06-11 13:33 | 2026-06-24 00:56 | No | 1 |
| 3 | Richard Mihelitch | (509) 876-9656 | rmihelitch@gmail.com | 2026-09-02 22:05 | 2026-09-02 22:03 | No | 4 |
| 1 | Craig Pate | (479) 280-9938 | cepate60@gmail.com | 2026-08-25 14:32 | 2026-05-15 17:54 | No | 1 |
| 1 | Matthew Clovis | (516) 316-7181 | clovis.matt@yahoo.com | 2026-06-11 21:29 | 2026-06-11 21:29 | No | 1 |

**Every one of the four has a phone number.** No cell above is blank or ambiguous.

## Live tokens right now

**None of them has an unused, unexpired resume token.** All four need a freshly issued
link — there is no one on this list who can simply be nudged toward a link already
sitting in their inbox.

## Why the list is four and not seven

The earlier count of seven was "distinct applicants with a stalled draft and a used
token." Applying your two exclusions removes three of them, all correctly:

- **Ruben Reyes Islas** (ricardogabriel0616@gmail.com) — has an **approved** submitted
  application. Not stranded.
- **Marquis Bowie** (onmysooie@gmail.com) — has an **approved** submitted application.
  Not stranded.
- **Ajalin Wynn** (ajalin.wynn@yahoo.com) — has a **denied** submitted application.
  Closed, and explicitly must not appear on a call list.

Each of those three also left behind more than one abandoned draft row under the same
email, which is why the raw draft count runs higher than the applicant count.

## Notes for the callers

- **Timothy Mozingo is the priority.** He reached step 9 — the signature step, the last
  one — and his draft has not moved since 2026-06-11. His single resume token was issued
  nearly two weeks after that and consumed within 13 seconds. He did the entire
  application and lost it at the door.
- **Richard Mihelitch is the live case.** Four tokens, the most recent yesterday at 22:03
  UTC, and he is still only at step 3. He has been trying repeatedly and failing; he is
  the applicant behind the burst you reported.
- **Craig Pate's dates are worth a look before calling.** His token was issued
  2026-05-15, but the application was updated 2026-08-25 — three months later. Something
  touched that row long after the token died; I did not establish what.
- Matthew Clovis never got past step 1; the token was consumed about 3.5 minutes after
  issue and the draft has not moved since.

Fields deliberately excluded: SSN, date of birth, CDL number, address, and every other
application field. This is a call list only.

## CONTRADICTIONS WITH THE RECORD

None. The earlier figure of seven stranded applicants was reported without the
submitted-elsewhere and closed-application exclusions you have now specified; four is the
correct count under this scope, and the two figures do not conflict.
