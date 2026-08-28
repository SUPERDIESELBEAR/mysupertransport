# Separate "who has the device" from "what the number is"

Right now, tapping "This one is correct" decides both things at once: the record you pick keeps its driver *and* its serial. That fails the McMillan / Huddleston case — Huddleston is the right holder, but the number typed on his record has a wrong digit. Keeping his record keeps the typo; keeping McMillan's record moves the device off the wrong driver.

The fix: the confirm dialog asks two separate questions.

1. **Which record stays** — that is what "This one is correct" already picks (the driver and unit that keep the device).
2. **Which serial number is right** — a small choice inside the dialog between the two serials, with the differing characters highlighted, plus a "Neither — type it" option for when both are wrong.

If the chosen serial is not the one already on the surviving record, the survivor's serial is corrected as part of the merge, so the result is the right driver with the right number.
