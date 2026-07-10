## Pull Handbook, Loadout Trailer Guide, and BOL/POD Procedures into Stage 9

Stage 9 currently shows only two reference PDFs (Payroll Deposit Overview + Payroll Calendar) even though the subheading names four categories. Rather than duplicate the three missing documents, source them live from the Document Hub (`driver_documents`) and reuse the Document Hub acknowledgment system (`document_acknowledgments`) — so a driver who acknowledges the Handbook here also has it acknowledged in the Document Hub, and vice versa.

Documents to surface (already in `driver_documents`, all visible):
- **BOL / POD Procedures** — PDF
- **SUPERTRANSPORT Handbook** — PDF
- **Loadout Trailer Guide** — rich text

### Frontend — `src/components/operator/ContractorPaySetup.tsx`

- Add a second reference-docs section labeled **"Operational Procedure Documents"** below the existing Payroll Reference Documents block.
- On mount, fetch the three `driver_documents` rows by id (hardcoded ids we just confirmed; safer than title matching) plus this user's existing `document_acknowledgments` rows for those three docs.
- Render each doc as a row matching the existing acknowledgment card style:
  - Title + short description
  - **View** button — opens the PDF in the existing `FilePreviewModal` for `content_type = 'pdf'`, or opens a modal rendering `body` HTML for `content_type = 'rich_text'` (Loadout Trailer Guide).
  - Acknowledgment toggle — on flip, insert into `document_acknowledgments` (with `document_version = doc.version`) or delete the row on un-toggle.
- Expand the gating logic: `allDocsAcknowledged` becomes true only when both hardcoded payroll docs AND all three Document Hub docs are acknowledged at the current `version`. Form remains locked until then, matching your "require all 5" requirement.
- Show acknowledgment state visually the same way the existing two docs already do (green check + timestamp).

### No database changes needed

- `document_acknowledgments` already exists and has RLS policies allowing users to read/insert/delete their own rows.
- No new columns on `contractor_pay_setup` — the three new acknowledgments live in `document_acknowledgments`, so Stage 9 completion doesn't need to persist them separately. Submission is gated in-app.
- If a driver later re-visits Stage 9 after the Handbook is bumped to a new version, they'll be re-prompted to re-acknowledge (matches Document Hub behavior).

### Submitted-state view

Once Stage 9 is submitted, still show a compact "Documents acknowledged" list including all five docs, reading acknowledgment timestamps from the appropriate source (contractor_pay_setup for the two payroll docs, document_acknowledgments for the three Doc Hub docs).

### Left unchanged

- Document Hub itself — no changes to admin editing, categories, or ordering.
- Pipeline completion logic — Stage 9 still completes on `contractor_pay_setup.submitted_at`, which now inherently requires all 5 acknowledgments before submit unlocks.
- Payroll Deposit Overview and Payroll Calendar remain hardcoded (they live in company-docs storage, not the Document Hub).

### Risk note
Document ids are hardcoded. If someone deletes or replaces the Handbook / BOL / Loadout Trailer Guide entries in the Document Hub, Stage 9 will show a "document not found" error for that row. Acceptable trade-off vs. brittle title matching; we can add a staff-side "Stage 9 document mapping" admin later if needed.
