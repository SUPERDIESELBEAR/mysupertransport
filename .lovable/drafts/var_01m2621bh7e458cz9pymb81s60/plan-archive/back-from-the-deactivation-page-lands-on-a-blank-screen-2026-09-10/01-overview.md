# Back from the deactivation page lands on a blank screen

## What is happening

The Back and "Back to driver" buttons on Deactivation & Delease both send you to the driver's profile page, carrying the driver's ID in the address. That destination screen accepts the instruction "show the driver profile" but never picks up which driver it is, so it has nothing to draw and shows an empty page. The menu and header stay, the middle goes blank.

This is confirmed in the code, not guessed: the management screen only draws the driver profile when a driver has been selected in memory, and the one place that reads the driver ID from the address deliberately skips itself whenever the address also names a destination — which these Back buttons always do.
