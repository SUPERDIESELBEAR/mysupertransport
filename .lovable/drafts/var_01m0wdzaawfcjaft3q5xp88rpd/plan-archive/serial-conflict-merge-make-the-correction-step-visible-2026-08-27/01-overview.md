# Serial conflict merge — make the correction step visible

The McMillan / Huddleston fix is already built in this draft. What the screenshot shows is the conflict panel *before* any choice is made. The serial-correction step lives one tap further in: pressing "This one is correct" opens a confirmation dialog that asks, separately, which number is right — McMillan's, Huddleston's, or "Neither — type the correct number."

Nothing is broken. The only problem is that the card gives no hint that a correction step is coming, so it reads as if keeping Huddleston will lock in his wrong digit.

## What to change

Two small wording changes on the conflict card, no logic changes:

1. Change the card button label from "This one is correct" to **"Keep this record"** — it picks the record, not the number.
2. Replace the footnote under the pair with: **"Next you'll confirm which serial number is right — you can keep either number or type a corrected one."** (replacing the current "Keeping a record closes the other driver's assignment..." line, which moves into the dialog where it already appears.)
