The user reports that the full-width stage cards for stages 1–8 in `OperatorDetailPanel` still appear to have sharp/less-rounded corners compared to Stage 9, the Inspection Binder, and Driver Documents.

Verified cause: Stage 9 (`div className="...rounded-xl overflow-hidden shadow-sm"`) and the `InspectionBinderPanel` wrapper both use `overflow-hidden`, which clips the inner content to the card's rounded border. The 8 stage wrappers for stages 1–8 (code keys `stage1`, `stage2`, `stage3`, `stage4`, `stage5`, `stagePE`, `stage6`, `stage7`) use `rounded-xl` but are missing `overflow-hidden`. Their sticky headers have `bg-white rounded-t-xl`, so without clipping the corners look slightly off/less soft.

Plan
1. In `src/pages/staff/OperatorDetailPanel.tsx`, find each of the 8 stage card wrappers (stage 1–7 plus the Pre-Employment Screening stage) that render the full-width accordion rows.
2. Add `overflow-hidden` to their outer `className` strings, keeping the existing `rounded-xl`, `bg-white`, conditional border colors, `shadow-sm`, and transition classes intact.
3. Keep the sticky headers as-is — `overflow-hidden` will clip them to the card's rounded corners rather than letting them spill past the border, which is the desired behavior.
4. Verify by loading the driver detail view in the preview and capturing a screenshot to confirm stages 1–8 now have the same soft rounded corners as Stage 9, Inspection Binder, and Driver Documents.