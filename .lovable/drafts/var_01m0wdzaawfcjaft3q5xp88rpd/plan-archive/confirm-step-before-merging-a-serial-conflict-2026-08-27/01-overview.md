# Confirm step before merging a serial conflict

Right now "This one is correct" merges immediately. One mis-tap closes the other driver's assignment and clears the serial from their onboarding record — with no chance to look at it first.

The change: that button opens a confirmation dialog that spells out exactly what will happen, in driver terms, before anything is written.

## What the dialog says

- Which serial is kept, and which record is merged away.
- Which driver keeps the device (unit + name).
- Which driver's assignment gets closed and has the serial cleared from their onboarding record — named explicitly.
- When both records belong to the same driver and unit, that line reads as a simple cleanup instead of a driver-losing-a-device warning.

Actions: **Cancel** and **Keep this serial**. Nothing is written until "Keep this serial" is pressed.

Every pair still stays in the review queue for a human — same-driver pairs are not auto-merged.
