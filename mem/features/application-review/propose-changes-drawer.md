---
name: Propose Changes Drawer
description: Staff edit the applicant's full application form directly via ProposeChangesDrawer; diffed via computeApplicationDiff against the original snapshot and sent through submit_application_correction. Applicant approves all-or-nothing on ApplicationApprove with gold-highlighted diffs and per-employer add/remove/edit rendering.
type: feature
---
- Entry point: "Propose changes for applicant approval" button in ApplicationReviewDrawer opens `ProposeChangesDrawer` (Sheet, side="right").
- Editor reuses `Step3Employment` verbatim for employment history. Other sections built with `FormField`/`AppInput`/`RadioGroup`/`CheckboxGroup` and collapsible `Section` wrappers.
- Diff is computed client-side via `computeApplicationDiff(snapshot, draft)` in `src/lib/applicationDiff.ts`; submitted via existing `submit_application_correction` RPC and `send-application-correction-email` edge function.
- Locked (server + UI): SSN, signature, consent checkboxes, DL/medical uploads. Enforced by `_app_correction_editable_columns()`.
- Applicant view (`ApplicationApprove`) renders employer changes via `diffEmployers()` with added (gold) / removed (rose strikethrough) / edited (per-field) cards. Non-employer fields use a was → will-become gold card.
- Old `SuggestCorrectionsModal.tsx` deleted; do not re-add — JSON paste UX is the rejected approach.
