# Make serial-conflict helper text more visible and the "different devices" action look selectable

In the Serial conflicts panel on Onboard Systems, make two small UI changes:

1. Increase the visibility of the helper line "Next you'll confirm which serial number is right — you can keep either number or type a corrected one." so staff notice it before tapping **Keep this record**.
2. Give the **These are different devices** action a bordered/selectable appearance instead of the current ghost-button look.

The change is limited to the conflict card footer in `src/components/equipment/SerialConflictsPanel.tsx`. No data model, API, or merge logic changes.
