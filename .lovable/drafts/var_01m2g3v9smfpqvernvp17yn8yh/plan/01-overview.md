# Next available truck number

Today, whoever adds a driver has to remember which truck numbers are already in use and type one in by hand. Nothing warns them until a duplicate alert fires afterwards.

This adds a small helper next to every truck-number field: it reads the numbers already in use and offers the next one, plus any unused numbers in between.

## What staff will see

- Next to the truck number box: **Next available: 272** with a small button to apply it.
- Below it, a short line of unused numbers inside the current range (for example 125, 126, 128), in ascending order, each clickable.
- Nothing fills in on its own. The field stays empty until someone clicks a number or types one.
- If a typed number is already taken, the existing duplicate warning still appears unchanged.

## Where it appears

- The Add Driver form.
- The truck/unit field on a driver's detail page.

## Decisions used (defaults, since the questions were skipped)

- Default offer is one above the highest number in use; unused gaps are listed alongside so staff can reuse them.
- Every number currently in use counts as taken, including the unusual ones (000, 67, 1900, 1901). They are excluded from being offered but do not push the sequence upward — the default offer comes from the normal three-digit working range.
- Non-numeric entries in use (such as ELD-TEST) are ignored when computing the sequence.
