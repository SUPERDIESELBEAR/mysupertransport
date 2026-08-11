# Move the status pill away from the close button

In the Onboard Systems assignment sheet preview, the "Draft" status pill sits flush against the dialog's X close button in the top-right corner.

## Change

Add right-side spacing to the status pill row in the assignment sheet preview header so the pill clears the close button, keeping the title and driver name unchanged.

## Technical detail

In `src/components/equipment/SignOffSheetPreviewModal.tsx`, the header row (`flex items-start justify-between`) renders the status `Badge` at the far right, under the absolutely positioned dialog close button. Add `pr-8` (or `mr-6`) to the badge wrapper so the pill is offset left of the X, on all statuses (Draft / Sent / Signed / Void).
