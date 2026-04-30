## ICA Template — Appendix B & D Edits

Wording-only updates to the ICA template. Applies to all newly generated ICAs and any unsigned drafts (drafts re-render from the template). Already-signed ICAs are stored as immutable PDFs and remain untouched.

### Changes

**Appendix B — Compensation & Deductions**
- Deductions row:
  - Before: *"Insurance, fuel, maintenance, trailer rental, permits, and operating expenses itemized per settlement."*
  - After: *"Fuel, maintenance, trailer rental, permits, tolls, and operating expenses itemized per settlement."*

**Appendix D — Insurance & Startup Acknowledgment**
- "Other Authorized Deductions" row:
  - Before description: *"ELD, BestPass, Transponder"*
  - After description: *"BestPass"*

### Technical Details

- File: `src/components/ica/ICADocumentView.tsx`
  - Line 330: update the `AppRow` value for Deductions.
  - Line 372: update the description in the Appendix D table data array.
- Bump `public/version.json` so existing sessions pull the new template.

### Out of Scope (For Now)

- Additional Appendix D edits you mentioned — you'll paste those after these two are in. Each new round will be a separate plan/approval.
- No changes to the ICA Builder form fields, signing flow, or Lease Termination doc.
