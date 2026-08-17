# ICA Review Copy — Download & Email from Forms Catalog

Let prospective drivers review the Independent Contractor Agreement before onboarding: staff can download a watermarked ICA PDF from the Forms Catalog, or email a review link to any address.

## What staff will see

In the Forms Catalog, the Independent Contractor Agreement card (and its preview modal) gets two new actions:

- **Download Review Copy** — generates the full blank ICA as a PDF, every page stamped with a diagonal "REVIEW COPY — NOT FOR SIGNATURE" watermark, and downloads it immediately.
- **Email for Review** — a small dialog asking for recipient name, email, and an optional note. Sends a branded email with a button that opens the watermarked ICA in the browser, where the recipient can also download it.

## Recipient experience

The email button opens a public page (no login) showing the watermarked ICA with a Download PDF button. The link is tokenized and expires after 30 days. The page states clearly that this is a review copy only and no signature is collected.

## Technical notes

- Watermark: a reusable `<IcaWatermark />` overlay applied per rendered page in `ICADocumentView`, gated by a `watermark` prop; PDF generation reuses the existing jsPDF + html2canvas approach from `src/lib/ica/fileExecutedIca.ts`, extracted into a shared `generateIcaPdf(el, { watermark })` helper so download and the public page share one code path.
- New table `ica_review_links` (token, recipient name/email, created_by, expires_at, opened_at, revoked) with RLS: staff/management insert + select, no anon table access. Public reads go through a SECURITY DEFINER RPC that validates the token, plus GRANTs for `authenticated` and `service_role`.
- New public route `/ica/review/:token` rendering the blank ICA with watermark and a download button; token validated via the RPC.
- New app-email template `ica-review-copy.tsx` registered in `transactional-email-templates/registry.ts`, sent via the existing `send-transactional-email` function with an idempotency key derived from the token. Email carries a link, not an attachment.
- Blank/unfilled ICA is used for both download and the review link — no applicant data is embedded.
