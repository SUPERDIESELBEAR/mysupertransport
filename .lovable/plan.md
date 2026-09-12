# File size limits: what is enforced vs. what is shown

Read-only investigation. Nothing changed.

## 1. Every upload path

| Path | Enforced in code | Shown on screen | Agree? |
|---|---|---|---|
| Create Load — Scan Rate Con with AI (`RateConfirmationParser.tsx:172`) | 20 MB (`validateRateConFile`); parse function also rejects above ~21 MB | nothing stated | no statement |
| Revised Rate Con (`RevisedRateConModal.tsx:183`) | 20 MB (`validateRateConFile`) | "PDF or image, up to 10MB." (line 590) | **no** |
| Load documents / POD (`UploadDocumentsDialog`) | 25 MB (`validateLoadDocumentFile`) | 25 MB | yes |
| Driver load paperwork, loadout photos | 25 MB | not stated | no statement |
| Late-accessorial proof (`ProofPicker`) | 25 MB | not stated | no statement |
| Maintenance invoice + AI scan (`MaintenanceRecordModal:139,193`) | 10 MB (`validateFile`) | not stated | no statement |
| Applicant documents (`Step7Documents`) | 10 MB | 10 MB | yes |
| Operator document upload, driver vault, 2290/registration, DOT inspection, equipment, PE screening, staff decal | 10 MB | 10 MB where stated | yes |
| Paper ICA, equipment sign-off sheet | 10 MB | 10 MB | yes |
| Company document editor (`DocumentEditorModal`) | 20 MB | 20 MB | yes |
| Message attachments | 10 MB (client) + 10 MB bucket cap | 10 MB | yes |
| QPassport (`OperatorDetailPanel`) | 10 MB | 10 MB | yes |
| DOT inspection binder rows (`DocRow`, `OperatorBinderPanel`, `InspectionBinderAdmin`) | **no client size check**; bucket has no cap | nothing | unbounded |
| Broker paperwork (`BrokerPaperworkSection`) | **no client size check**; `broker-documents` bucket caps at 25 MB | nothing | silent server reject |
| FAQ generation from a document | no upload — picks an existing resource | n/a | n/a |
| Rate cons arriving by email | server side, `rate-con-ingest` bucket caps at 30 MB | n/a | n/a |

## 2. Where they disagree, and how bad each is

- **Revised Rate Con — displayed lower than enforced (10 shown, 20 enforced).** The invisible shape: a dispatcher holding a 14 MB revised rate con reads "up to 10MB" and doesn't try. Silent lost action. This is the only true displayed-vs-enforced contradiction in the app.
- **Broker paperwork — displayed higher than enforced, effectively.** No limit is stated, and anything over 25 MB is refused by the storage bucket with a raw error. Visible and confusing, but rare.
- **Binder rows — no limit stated and none enforced anywhere.** Not a disagreement, a gap: a 200 MB scan is accepted and uploaded.
- **No path has two competing validators.** `validateFile` (10 MB) and `validateRateConFile` (20 MB) are never both called on the same file. The "stricter silently wins" shape does not occur.

## 3. Does a 10–20 MB file work on the Create Load parse path?

Traced, not assumed: the Create Load strip calls only `validateRateConFile` — 20 MB — and never `validateFile`. The file is then base64-encoded and sent to `parse-rate-confirmation`, whose own guard is `file_base64.length > 28_000_000`, about 21 MB of raw file. A 20 MB file encodes to roughly 26.7 M characters, under that guard.

So yes, by trace: 10–20 MB is accepted client-side and passes the server guard. What is not proven is the model-gateway request-body ceiling, which no constant in this project controls. That is the one thing worth confirming with a real 15 MB rate con before anyone advertises 20 MB on screen.

## 4. Why there are two

- `MAX_FILE_SIZE_BYTES = 10 MB` — `validateFile.ts`, commit `4aae3d558`, 2026-03-09, "Add form validations". The original applicant/document validator, built for phone photos and scans.
- `MAX_RATECON_BYTES = 20 MB` — `rateConfirmation.ts`, commit `f8a19c702`, 2026-08-20, with the rate-con parser work, five months later.

`rateConfirmation.ts` does not import `validateFile`, does not mention it, and carries no comment explaining the different number; it also duplicates the accepted-type list. Neither is superseded, and the difference is defensible — a multi-page broker PDF is genuinely larger than a licence photo — but the record shows the second arrived without acknowledging the first. `validateLoadDocumentFile` at 25 MB is a third, independent limit, added with load documents.

## 5. Recommendation, one answer per path

Do not collapse to a single number. Keep three tiers and make every screen state the tier it enforces:

- **Rate confirmations — 20 MB.** Fix `RevisedRateConModal.tsx:590` to say 20 MB, and add the same sentence to the Create Load strip, which currently states nothing. Confirm the 15 MB end-to-end parse first.
- **Load documents and photos — 25 MB.** Already correct where stated; add the sentence to driver load paperwork, loadout capture, and the accessorial proof picker.
- **Driver, applicant and equipment documents — 10 MB.** Already consistent; leave it.
- **Broker paperwork — adopt 25 MB explicitly:** validate client-side against the bucket cap and say so, so the rejection stops being a raw error.
- **Binder rows — pick a limit and enforce it.** 25 MB matches the other staff-scanned paperwork.
- Add a cross-reference comment to each constant naming the other two, so the next one added has to acknowledge them.
