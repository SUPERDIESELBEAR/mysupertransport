# Two separate things, and only one is a misunderstanding

**You did not misunderstand the tightening — the pairs in your screenshot are supposed to still be there.** All three are one-character look-alike substitutions of exactly the kind the rule keeps: `…504<b>6</b>6` vs `…504<b>8</b>6`, `…1005<b>6</b>6` vs `…1005<b>8</b>6`, `…2542<b>6</b>9` vs `…2542<b>8</b>9`. The 6/8 pair is on the keep-list because 6 and 8 are genuinely confusable on a printed label. What the tightening removed was fuel-card numbers and sequential tails (…901 vs …903) — not these.

**The real defect is the red toast: "Could not mark as different devices — Unknown error."**

Confirmed by query: the table that stores those decisions, `equipment_serial_conflict_dismissals`, has **zero grants** in the live database — no privileges for `authenticated` at all. Its RLS policies exist and are correct, but with no GRANT the Data API refuses every read, insert and delete on it.

So: every time you pressed "These are different devices" the write was rejected, nothing was ever saved, and on the next load the pair came back. There are currently **zero rows** in that table — none of your earlier dismissals survived. This is why it looks like previously-corrected items are re-reporting: nothing was ever recorded as corrected.

The migration file on disk does contain the GRANT statements. The live database does not have them — the same repo-vs-live divergence already recorded in the build status doc.
