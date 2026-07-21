## Recommended UX
Use a truly locked/sticky header row for the Fleet Compliance list view, with a small responsive fallback that keeps document labels visible inside each cell on narrow screens.

This is better than repeating full headers in every desktop row because it preserves the clean table layout while keeping the column meaning visible during scroll.

## Implementation Plan
1. **Fix the sticky behavior at the correct scroll level**
   - Move the Fleet Compliance list table into a bounded vertical scroll container instead of relying on the full page scroll.
   - Apply the sticky header to that container so `Driver / Status`, `CDL`, `Med Cert`, `IRP`, `Registration`, `2290`, and `Actions` remain locked while scrolling through driver rows.

2. **Keep the first column pinned**
   - Preserve the sticky `Driver / Status` column during horizontal scrolling.
   - Make sure the top-left header cell stays above both the sticky header and sticky driver column with the proper layering.

3. **Improve visual separation**
   - Add a subtle bottom border/shadow to the locked header so staff can clearly tell it is fixed while rows move underneath.
   - Use the same light Fleet Compliance palette already approved for the list view.

4. **Add a narrow-screen fallback**
   - On smaller widths, include compact document labels inside each certification cell so the row still makes sense even if the user is horizontally scrolled or the sticky header is partially off-screen.

5. **Verify in preview**
   - Test scrolling the Fleet Compliance list view with enough driver rows to confirm the header remains visible.
   - Check horizontal scroll behavior to confirm the `Driver / Status` column and corner header remain aligned.