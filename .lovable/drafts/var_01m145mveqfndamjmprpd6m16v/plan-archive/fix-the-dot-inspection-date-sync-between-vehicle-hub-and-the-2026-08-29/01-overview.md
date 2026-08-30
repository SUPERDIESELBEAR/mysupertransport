# Fix the DOT inspection date sync between Vehicle Hub and the Inspection Binder

## Where the binder's "Inspection Date" comes from

The binder row does not generate a date. The Vehicle Hub record on the truck holds the real inspection date (Johnathan Pratt: Aug 26, 2026, pass, 90-day interval, next due Nov 24). The binder document keeps a copy of a date in the same field other documents use for expiry — for this one document it is relabeled "Inspection Date", and the green "Auto-synced" chip means the copy was refreshed from the Vehicle Hub.

## Why your Vehicle Hub edit reverted

There are three separate sync paths writing the same two values, and they disagree with each other:

1. Saving a Vehicle Hub inspection copies the **next due date** into the binder's date field — the field the binder displays as the *inspection* date.
2. Any change to that binder field writes straight back into the Vehicle Hub as the **inspection date**.
3. When the binder screen loads, the app also overwrites the binder field with the Vehicle Hub inspection date.

Two confirmed problems in that loop:

- **The re-entry guard does not work.** Path 1 raises one flag but path 2 checks a different flag name, so the write-back is never suppressed. A Vehicle Hub save immediately triggers a binder write, which immediately triggers a second Vehicle Hub write over the value just saved.
- **The two directions carry different meanings.** One direction sends "next due", the other reads the same value as "inspection date". Whichever path runs last wins, so an edit can land back on the previously stored date.

Both records for Pratt currently read Aug 26, 2026, which is the loop's stable resting point — consistent, but not necessarily what was typed last.
