# Serial Conflicts Panel UI Polish

Two small visual refinements to the device-serial conflict cards in Onboard Systems:

1. Remove the blue info styling around the helper text "Next you'll confirm which serial number is right — you can keep either number or type a corrected one" and render it in dark text (black or dark gray) on the normal card background.
2. Restore the previous goldish hover state on the "These are different devices" outline button instead of the current muted gray hover.

Scope is limited to `src/components/equipment/SerialConflictsPanel.tsx`. No behavior or logic changes.