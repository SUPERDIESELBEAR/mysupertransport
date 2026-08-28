# Highlight the characters that differ between two serials

Today both serials in a conflict pair render as plain identical-looking text, so staff has to read `AABL36UG024945` against `AABL36U0024945` character by character to spot what actually differs. The plan makes the difference impossible to miss.

## What changes

In each conflict pair, the characters that differ between the two records are visually marked — a subtle highlight behind just those characters, with the rest of the serial in normal ink. Both cards mark the same positions, so the eye lands on the same spot in each.

Examples from the current queue:

```text
Onan      AABL36UG024945
Sargent   AABL36U0024945
                  ^        G vs 0

Wendell   C7715B8Z6
Wendell   C771SB8Z6
              ^          5 vs S
```

A one-line note above the pair states plainly what the difference is, e.g. *"Differs only at position 8: G vs 0 — these look alike."*

The same highlighting is applied in the confirmation dialog, so the character being decided on is visible at the moment of the decision.

## Also covered

The near-match warning in the add/edit device form (one character away from an existing serial) gets the same treatment, so the offending character is marked while typing rather than described in prose.

## Not changing

Matching, merging, and dismissal behavior stay exactly as they are. This is presentation only.
