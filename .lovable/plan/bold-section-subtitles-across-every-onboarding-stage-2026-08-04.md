# Bold section subtitles across every onboarding stage

Stage 5 already uses the new bold, gold-accented section subtitle style (Truck Decals, ELD, Fuel Card, Assigned Device Numbers). Apply the same treatment to the section headings inside every other stage, so each stage reads with the same hierarchy: bold stage title in the ribbon, bold subtitles for the groups inside.

## What gets a subtitle

- Stage 1 — Background Check: MVR, Clearinghouse, MVR / Clearinghouse Approval, Notes
- Stage 2 — Documents: Required Documents, Truck Photos, Notes
- Stage 3 — ICA: Contract Dates, Notes, Lease Termination (Appendix C), ICA Amendments, Void ICA
- Stage 4 — Missouri Registration: Registration Details
- Stage 6 — Pre-Employment Screening: Screening Status, Results Documents
- Stage 7 — Insurance: keeps its existing subtitles; the collapsible "Additional Insured" and "Certificate Holder" panel headers get restyled to match (bold, same size), keeping their expand/collapse behavior and status dots
- Stage 8 — Go Live: keeps existing subtitles (Go-Live, Email DOT Consultant)
- Stage 9 — Payroll and Procedures: Payroll Reference Documents, Operational Procedure Documents

Existing card titles, field labels, and inline helper text stay as they are — only group headings change, so nothing shifts in behavior or data.

## Technical notes

- All headings route through the existing `SectionSubtitle` component in `src/pages/staff/OperatorDetailPanel.tsx` (bold 13px uppercase, gold accent bar, thin divider), with the `accent="gold"` variant reserved for exception/warning groups such as Shop Visit Exceptions.
- Groups that currently have no heading (for example Stage 1 MVR vs Clearinghouse) get a wrapping `div` with the subtitle above the existing fields; no field, state, or save logic is touched.
- The Additional Insured and Certificate Holder headers keep their `button` / flex row structure and only swap the text classes for the subtitle typography, so collapse state and the green on-file dots are unchanged.