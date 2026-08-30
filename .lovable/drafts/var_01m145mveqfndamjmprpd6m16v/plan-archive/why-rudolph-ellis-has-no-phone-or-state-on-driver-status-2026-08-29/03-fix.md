## The fix

**1. Fill in the account records from the applications**
For every active driver whose account phone or home state is blank, copy the value from their application. Rudolph gets `(337) 886-8585` and `LA`. Records that already have a value are left alone. This corrects Driver Status plus anywhere else that reads the account record — messaging, notifications, exports.

**2. Keep it filled in going forward**
When an application is approved and linked to a driver, copy the phone and state into the account record if those fields are still blank. Never overwrite a value staff set by hand.

**3. Fallback on Driver Status**
Give Driver Status the same display fallback Driver Hub already uses (fall back to the application when the account record is blank), so a driver with no linked application still renders correctly.

## One decision

Should the copy ever **overwrite** a value already on the account record, or only fill blanks? The plan fills blanks only, so a number staff corrected by hand always wins.
