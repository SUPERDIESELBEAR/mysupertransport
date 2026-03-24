
## Add Payroll Document Thumbnails to Stage 8 — Staff Panel

### What "Two Items" Means
The user uploaded two company-authored reference documents:
1. **SUPERTRANSPORT Payroll Deposit Overview** (DOCX) — the written payroll policy
2. **Supertransport Payroll Calendar** (PDF) — the payroll schedule

These are not operator-uploaded files. They are company documents staff should be able to preview inline from the Stage 8 section of the Operator Detail Panel, so staff can confirm the operator has seen and acknowledged them.

---

### What Will Be Built

In the **Stage 8 section** of `OperatorDetailPanel.tsx` (the "Uploaded Documents" area), add two **document thumbnail cards** that staff can click to expand into a readable in-panel lightbox/modal. No new files or database changes required.

**Approach — Static URLs + Inline Lightbox:**
- Upload both files to the `operator-documents` Supabase storage bucket as public company-level assets (path: `company-docs/payroll-deposit-overview.pdf` and `company-docs/payroll-calendar.pdf`)
- In the Stage 8 section of the detail panel, render two document cards:
  - A PDF-style thumbnail card with title, icon, and a "View" button
  - Clicking either card opens a full-screen modal (Dialog) with an embedded `<iframe>` rendering the PDF at readable size
  - Staff can also download or open in a new tab from the modal

**Card Design:**
```text
┌─────────────────────────────────────────────────────────┐
│  [PDF icon]  Payroll Deposit Overview          [View]   │
│              PDF • Company document                     │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  [PDF icon]  Payroll Calendar                  [View]   │
│              PDF • Company document                     │
└─────────────────────────────────────────────────────────┘
```

**Lightbox/Modal:**
- Full-screen Dialog overlay (existing shadcn `Dialog` component)
- `<iframe>` rendering the PDF, taking full modal height
- Header bar with doc title, Download button, Open in New Tab button, and Close
- Uses the same pattern as the existing `FilePreviewModal` memory

---

### Files Changed (no new files)

**`src/pages/staff/OperatorDetailPanel.tsx`**
- Add a `CompanyDocPreviewModal` inline component (small, ~50 lines) for the lightbox with iframe + controls
- In the Stage 8 "Uploaded Documents" section, add a second sub-section titled "Payroll Reference Documents" with the two static cards above the operator's W-9 / Voided Check rows
- The cards are always visible regardless of whether the operator has submitted (staff reference docs)

The DOCX will be converted to PDF before uploading so it renders inline in the iframe. The two files are uploaded to storage as part of this implementation.

---

### No Changes To
- Operator portal (ContractorPaySetup.tsx) — untouched
- Database schema — no migrations needed
- Any other stage or panel
