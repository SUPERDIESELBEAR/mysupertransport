# Paper Logs (RODS) — is it working, and what should change

Short answer: the screen is built and wired up, but **as of right now nobody in the office can actually read a log on it.** Two things block that, and both are confirmed against the live data, not read off the code.

## What the live data says

- Only one driver has any paper logs at all: 2 days (Aug 3 and Aug 18, 2026), both still **draft**, neither certified.
- That driver is **no longer active**.
- The driver picker on this page only lists **active** drivers (59 of 154). So the one driver who has logs is not in the list — the office cannot select him, and every other pick shows "No logs on file".
- Those 2 days have **zero duty-status entries**, so even if opened, the log grid draws empty.
- 3 correction requests exist (1 actioned, 2 declined), all for dates that have **no log record**. The page only shows a request underneath the day it belongs to, so all 3 are invisible on this screen today.

## The defects worth fixing

1. **Active-only driver list.** A paper log is a federal record kept for six months regardless of whether the driver still works here. The list must include former drivers (clearly marked "former"), otherwise the record is unreachable the moment someone leaves. The code comment on this list even claims it is deliberately unfiltered — it isn't.
2. **Correction requests with no matching log day disappear.** They should still be listed for the driver, under their own date, so an open request can never go unseen.
3. **No fleet-level view.** Everything requires picking one driver first. There is no way to ask "who has an uncertified day?" or "where is there an open correction request?" — the questions the office actually starts from.
4. **Default 30-day window hides history.** Older logs exist outside it and there is no quick "last 6 months" or "all" range.
5. **Nothing to hand out.** No print or PDF from this screen, even though the same log render is already used for the roadside packet.
