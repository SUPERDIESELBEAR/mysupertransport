## The fix

**1. Restore the missing privileges (the actual repair).**
Stage an additive migration granting `SELECT, INSERT, DELETE` on `equipment_serial_conflict_dismissals` to `authenticated` and `ALL` to `service_role`. No schema change, no policy change — the policies are already correct and stay exactly as they are. This applies when you accept the draft; it cannot be applied from inside the draft.

**2. Make the failure legible instead of "Unknown error".**
In `SerialConflictsPanel.tsx`, the three catch blocks test `err instanceof Error`. A Data API error is a plain object with a `message`, so it fails that test and prints "Unknown error". Read `message` off the object first, falling back to the generic text. Applies to dismiss, restore, undo and the load path.

**3. No change to the matching rules.**
`isSoftNearMatch` and the look-alike pair list are untouched. The 6/8 pairs in your screenshot will keep appearing until you mark them — and after this fix, marking them will stick for every staff member.

## What you should expect afterwards

The three pairs in the screenshot are still listed the first time you open the panel. Press "These are different devices" on each; the toast turns into the normal confirmation, the pair disappears, and it stays gone after a refresh and on other people's screens. A "3 pairs marked as different devices — Show" line appears at the bottom if you want them back.

## Also worth recording

This is a second instance of the live database missing GRANT statements that the migration file on disk contains (the first was `carrier_profile`). Once fixed, I'd add a line to `docs/tms-build-status.md` under the existing entry on that pattern, and suggest running `grant_parity_report()` as a routine check after any new table.
