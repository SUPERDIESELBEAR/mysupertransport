## Goal

When an applicant's driver's license or medical card upload is blurry, cut off, or otherwise unusable, staff get two side-by-side options on the application review drawer:

1. **Replace it themselves** — upload the better copy the applicant emailed in.
2. **Ask the applicant to retake it** — a document-specific request that drops the applicant straight onto the Documents step of their own application.

Both live in the "Uploaded Documents" section of the applicant's review drawer, so the fix happens where the bad photo is spotted.

## What staff will see

Each document (DL Front, DL Rear, Medical Certificate) becomes a small row instead of a bare chip:

```text
DL Front        [ View ]  [ Replace ]  [ Request retake ]
  Replaced by Kenneth M. on Aug 2, 2026 · view original
```

**Replace** opens a compact uploader (Choose file / drag-and-drop, JPG/PNG/PDF, 10 MB max — same validation as the applicant form). On save it stores the new file, points the application at it, records who replaced it and why (short reason picker: blurry, cut off, wrong document, expired, applicant emailed a better copy), and offers an optional "Let the applicant know" checkbox, unchecked by default.

**Request retake** opens a small dialog where staff tick which of the three documents need redoing, pick a reason per document, and optionally add a note. It sends the applicant an email with a resume link that opens their application directly on the Documents step, with the flagged documents highlighted and their old file cleared so they must re-upload. The existing 7-day resume-token mechanism is reused.

## Original file handling

Originals are never deleted. Each replacement writes a history row (document slot, old path, new path, who, when, reason). The review drawer shows a "view original" link and the applicant-facing snapshot/print output shows the current file with a footnote that it was replaced by staff on a date — which is what keeps the file defensible in a DOT audit.

## Technical notes

- **New table `application_document_history`**: `application_id`, `document_key` (`dl_front_url` | `dl_rear_url` | `medical_cert_url`), `old_path`, `new_path`, `source` (`staff_replacement` | `applicant_retake`), `reason`, `note`, `changed_by`, `changed_by_name`, `changed_at`. GRANTs to `authenticated` + `service_role`; RLS restricts reads/writes to staff roles (`onboarding_staff`, `management`, `owner`) via the existing `has_role` pattern; append-only trigger.
- **Storage**: staff uploads go to the existing `application-documents` bucket under `applications/{application_id}/staff/{uuid}.{ext}` using `uploadToBucket`. A staff-scoped INSERT policy is added for that prefix (the current applicant policies are keyed on draft token). Old objects stay in place.
- **`ApplicationReviewDrawer.tsx`**: extend the existing `EditableDocumentKey` machinery (which already handles crop/rotate saves through `DocumentEditor` and `editedDocPaths`) with a replace-upload path and a history strip. New small components: `DocumentSlotRow.tsx` and `RequestRetakeModal.tsx` under `src/components/management/`.
- **Retake request**: extend `request-application-revisions` (or a thin sibling function) to accept `documents: EditableDocumentKey[]` plus per-document reason. It nulls the flagged columns, stores the flags on the application, issues the 7-day resume token as today, and emails a `/apply?resume=<token>&step=7` link.
- **`ApplicationForm.tsx` / `Step7Documents.tsx`**: on resume with retake flags, jump to the Documents step and render a gold callout per flagged document ("Staff asked for a clearer photo — reason"). Mobile already offers Take Photo / Choose File, so the applicant can shoot a fresh photo in place.
- **Audit**: both actions write to `audit_log` alongside the history table, matching the existing revision-request logging.

## Advice

Prefer the retake path when the applicant is still responsive — the file arrives already tied to their identity and no chain-of-custody note is needed. Use staff replace for emailed copies, expedited approvals, and unresponsive applicants. Keeping the reason picker mandatory on both paths is what makes the audit trail worth having.
