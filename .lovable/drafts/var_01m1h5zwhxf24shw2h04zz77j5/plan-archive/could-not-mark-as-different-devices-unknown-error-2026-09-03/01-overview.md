# "Could not mark as different devices — Unknown error"

Confirmed from the live database: the table that stores your "these are different devices" decisions has **zero access grants** for app users. Its access rules exist, but the permission layer underneath was never applied to the live database, so every read, save, and undo of a dismissal is rejected before the rules are even consulted.

That is the whole error. The 6-vs-8 conflict pairs in the screenshot are being reported on purpose — the earlier fix removed fuel-card and sequential-tail false positives but deliberately kept single-character substitutions, since those are the ones that are genuinely either a typo or two real devices. Nothing regressed there.

## Fix

The corrective migration is already staged in this draft and applies when you accept it:

- restores `SELECT, INSERT, DELETE` for signed-in staff and full access for backend services on the dismissals table
- no schema change, no change to the access rules themselves

The panel's error handling was also already updated so a permission failure shows the real database message instead of "Unknown error".

Nothing left to build — accepting the draft applies the grant and the button starts working.
