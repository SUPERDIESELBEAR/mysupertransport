# Stop the daily ELD malfunction email

Two separate causes, two separate fixes.

**The row.** One open malfunction event exists — the ELD-TEST harness driver, code P,
discovered Aug 18, deadline Aug 26, never resolved. It shows your name because that
operator row has no application attached, so the display falls back to the profile of
the login it was created under. It gets deleted permanently.

**The rule.** Once the 8-day repair window is blown, the escalation ladder fires a
`day >= 9` notice every single day, forever, to every staff member with Compliance
email on. Nothing but resolving the event or granting an extension ever stops it. That
cadence gets capped.
