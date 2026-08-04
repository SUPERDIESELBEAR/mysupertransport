# Fix: Desktop Push Alerts toggle blocks itself with a red alert

## What happened

The "Desktop Push Alerts" row is not a normal preference toggle — it asks the phone's browser for notification permission.

Sequence on the driver's iPhone:
1. Toggle was on with browser permission still unresolved (`default`).
2. Toggling off just stored a local preference — fine.
3. Toggling back on called `Notification.requestPermission()`. Mobile Safari (outside an installed home-screen app) answers `denied` immediately, with no prompt shown to the user.
4. Because the answer was not `granted`, the code showed the red "Permission required" alert, refused the toggle, and then permanently disabled and greyed the row ("Browser permission denied — this cannot be changed from within the app").

So the toggle wasn't broken by a bug in saving — it was blocked by a browser capability the phone doesn't have, surfaced as an error the user can't act on.

## The fix

1. Detect support up front. If the browser has no Notification API, or is an iOS browser not running as an installed app, hide the Desktop Push Alerts row entirely. Desktop alerts are meaningless there, and the other preferences (In-App / Email) keep working normally.
2. Never block the toggle. Turning the switch on saves the user's preference immediately. Permission is requested in the background; if it isn't granted, the switch stays where the user put it.
3. Replace the red error toast with a quiet inline hint under the row ("Your browser is blocking alerts — allow notifications in site settings"). No popup, no destructive styling.
4. Stop hard-disabling the switch on `denied`. The user can still express the preference; it activates automatically if permission is later allowed.
5. Apply the identical treatment to the staff version of this modal so behavior matches on both sides.

## Files touched

- `src/components/operator/OperatorNotificationPreferencesModal.tsx`
- `src/components/staff/StaffNotificationPreferencesModal.tsx`
- Small shared helper for "does this browser actually support desktop push" (placed alongside the existing desktop-preference helpers).

No database, edge function, or notification-delivery changes — In-App and Email preferences are untouched.

## Verification

Load the driver notification preferences at phone width and confirm: the Desktop Push row is absent on mobile, and toggling In-App/Email on and off repeatedly produces no red alerts.
