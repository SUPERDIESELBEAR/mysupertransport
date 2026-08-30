# Print / download: server-rendered PDF

Chosen approach: **a real PDF generated on the server**, not a browser print dialog.

A new backend function renders the fully worded application (and each standalone disclosure) to a genuine PDF file and returns it. Everything downstream gets easier once a PDF exists as a file rather than a print preview:

- One **Download PDF** button produces the identical file on desktop, iPad and phone — no popup blockers, no share-sheet detour, no "my print looked different than yours".
- The PDF can be **emailed as an attachment** and **auto-filed into the driver's binder**, because it is a file.
- Page breaks, margins, headers and the repeating footer are controlled by us, not by whatever the browser decided that day.
- Text stays selectable and searchable, and the file is small.

## How it works

- A backend function receives the application id, loads the application server-side, and renders the same letterhead + full-wording document to PDF.
- The rendered PDF is stored in a private documents bucket and returned via a short-lived signed URL, so re-downloading is instant and the filed copy is byte-identical to the one that was emailed.
- File naming: `Driver-Application_LastName-FirstName_YYYY-MM-DD.pdf`.
- Authorization mirrors existing document rules: staff can generate for any applicant; an applicant can only obtain their own.

## Browser print stays as a fallback

The in-app print button is kept and upgraded to `openPrintableDocument` (the reliable path the PEI release already uses, with Letter/A4 choice and image-load waiting). It costs little to keep and covers the case where the PDF service is unreachable — staff are never blocked from getting a copy.

## Page-quality details included in the build

- Letter page size, consistent margins, and a repeating footer with company identity and page numbers ("Page 3 of 9") on every page.
- Page-break rules so an employer record, a signature block, or a question-and-answer pair never splits across pages.
- Print-safe colors — no gold-on-dark panels that render as gray mush.
- Logo and signature images embedded in the document rather than fetched at render time.
- A small footer stamp with the submission id and generation timestamp, so two copies of the same application are traceable.

# Considerations

1. **Single source of truth for identity.** The letterhead reads the legal name, USDOT and MC from the existing carrier record rather than being retyped in five files, with a constant fallback if the record cannot be read. One place to update, and it keeps per-company branding possible later.
2. **"Pleasant Hill, Missouri" only.** The ELD/roadside surfaces intentionally keep the full street address — federal logs require a real main-office and terminal address, so those are untouched. This change is limited to the application surfaces.
3. **Legal wording is not altered.** Moving question text into a shared copy file is a relocation, not a rewrite; every disclosure sentence stays byte-identical, so no re-consent is implied for anyone who already signed.
4. **Historical applications.** Older submissions store answers, not the wording that was on screen at the time. The printed document will show today's wording next to their stored answers. That is normal practice, but if you ever change a disclosure's wording materially, the honest fix is versioning the copy — worth flagging now, not needed today.
5. **Length.** A fully worded application will run roughly 6-10 pages instead of the current 2-3. That is the point, but staff should expect it.
6. **Logo file.** The current logo is a PNG. It prints cleanly at header size; an SVG or high-resolution version would be sharper if you have one.
7. **Server rendering costs a little time.** Generating the PDF takes a few seconds rather than being instant, so the button shows a progress state. Repeat downloads of an unchanged submission reuse the stored file and are immediate.
8. **The document must be defined once.** The letterhead and full wording live in one shared definition that both the on-screen view and the server renderer use, otherwise the screen and the PDF drift apart over time. This is the main reason the build is a little larger than a print-button change.

## Technical notes

- New `CompanyLetterhead` component plus a shared `companyIdentity` accessor sourced from the existing carrier record.
- New shared application-copy module holding every question and disclosure string, consumed by the Step components, the on-screen snapshot, and the PDF renderer.
- New edge function `generate-application-pdf`: authorizes the caller, loads the application, renders the document to PDF, stores it in a private bucket, returns a signed URL. Deployed explicitly.
- Generated PDFs recorded against the applicant so the file can be attached to emails and filed into the driver's binder.
- Client touch points: the four files in `src/components/application/documents/`, `SubmittedApplicationSnapshot.tsx`, `ApplicationReviewDrawer.tsx`, and the footer in `ApplicationForm.tsx`.
- Fallback print path switched from `printDocumentById` to `openPrintableDocument`.
- One additive migration for the generated-PDF record; no changes to existing columns.
