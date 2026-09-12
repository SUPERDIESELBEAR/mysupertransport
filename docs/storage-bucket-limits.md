# Storage bucket size limits — the authoritative record

Date: 2026-09-12

## Why this file exists

Bucket configuration is not in `supabase/migrations` and cannot be put there:
writes to `storage.buckets` are rejected in this project, so a cap can only be set
by the storage tool against the live database. Nothing in the repository records
that any cap was ever set.

That means a rebuilt environment comes up with every bucket unbounded unless someone
re-applies these values by hand. The client validators (`validateFile.ts` 10 MB,
`rateConfirmation.ts` 20 MB, `loadDocuments.ts` / `binderUpload.ts` 25 MB) are the
polite layer — they refuse a file in the browser. The bucket cap is what refuses a
direct storage API call that never loads the app at all.

So this document is the intent, and `src/test/storage-bucket-limits.test.ts` is the
check: it reads `storage.buckets` live and fails when a value drifts from the table
below, whether it was changed out of band or lost in a rebuild.

**`null` is stated explicitly, never omitted.** An absent row and an uncapped bucket
must not look the same.

## Unit inconsistency — recorded, not yet resolved

The three caps that exist are written in two different units, and neither unit was
written down anywhere before this file:

- `26,214,400` = 25 **MiB** (25 × 1024 × 1024) — `inspection-documents`, `driver-uploads`.
  This matches the client constants, which are all `N * 1024 * 1024`.
- `25,000,000` = 25 **MB** decimal — `broker-documents`. About 1.4 MB stricter than
  the 25 MiB client validator that guards the same path, so a file between
  25,000,000 bytes and 25 MiB passes the browser check and is refused by storage.
- `30,000,000` — `rate-con-ingest`, decimal, server-side ingest only.
- `10,485,760` = 10 MiB — `message-attachments`, the only cap that also exists in a
  migration (`20260427110313_c4fdf046-3b01-41b7-b8a3-9bcb1caafcf4.sql:142`).

Aligning `broker-documents` to 26,214,400 is a one-line change and a deliberate
decision, not a cleanup; it is left for the owner. Until then the guard asserts the
value that is actually live, so the record stays honest.

## Every bucket, intended limit, and live agreement

Verified against `storage.buckets` on 2026-09-12. All 21 buckets.

| Bucket | Public | Intended `file_size_limit` | Live matches | In a migration |
|---|---|---|---|---|
| application-documents | no | null | yes | no |
| application-revision-replies | no | null | yes | no |
| avatars | yes | null | yes | no |
| broker-documents | no | 25000000 | yes | **no** |
| dot-consultant-attachments | no | null | yes | no |
| driver-uploads | no | 26214400 | yes | **no** |
| eld-notices | no | null | yes | no |
| fleet-documents | no | null | yes | no |
| ica-signatures | no | null | yes | no |
| inspection-documents | no | 26214400 | yes | **no** |
| load-documents | no | null | yes | no |
| message-attachments | no | 10485760 | yes | yes |
| operator-documents | no | null | yes | no |
| passenger-auth-executed | no | null | yes | no |
| passenger-auth-signatures | no | null | yes | no |
| pei-documents | no | null | yes | no |
| rate-con-ingest | no | 30000000 | yes | **no** |
| resource-library | no | null | yes | no |
| rods-logs | no | null | yes | no |
| service-logos | yes | null | yes | no |
| signatures | no | null | yes | no |

Four caps exist live and in no file: `inspection-documents`, `driver-uploads`,
`broker-documents`, `rate-con-ingest`. This table plus the guard is the only thing
recording them.

## Changing a cap

1. Change the value with the storage tool (`supabase--storage_update_bucket`), or
   remove it with `remove_file_size_limit`.
2. Change the same row in the table above in the same pass.
3. Run `src/test/storage-bucket-limits.test.ts`. A step-1-only change fails it, which
   is the point.

## The sixteen unbounded buckets — reported, not decided

No caps were set in this pass. Some may be unbounded deliberately. Ranked by
exposure: who can write, and whether any client check stands in front of it.

### Tier 1 — an unauthenticated or applicant-facing path writes it

| Bucket | What writes it | Client check | Limit that would match its tier |
|---|---|---|---|
| application-documents | Public application form (`Step7Documents`, `/apply`, no account), plus staff and edge functions writing generated PDFs | `validateFile` 10 MB on the form path only | 10 MiB (10485760) — matches the validator |
| signatures | Application and ICA signature canvases; small generated PNGs | none — a canvas export, never a chosen file | 10 MiB is generous; anything above that is not a signature |
| application-revision-replies | Applicant replying to a revision request | inline `MAX_BYTES` 10 MB literal in `RevisionReplyAttachments.tsx` | 10 MiB, and fold that literal into `validateFile` |

`application-documents` is the sharpest of the sixteen: the only bucket an
unauthenticated visitor writes to, currently with no server-side ceiling at all.

### Tier 2 — a driver (operator) writes it from the phone PWA

| Bucket | What writes it | Client check | Limit that would match its tier |
|---|---|---|---|
| operator-documents | Driver document uploads, 2290/registration, truck photos; also written by several edge functions | `validateFile` 10 MB on the driver paths | 10 MiB |
| load-documents | Driver load paperwork and POD, loadout photos, dispatcher uploads, revised rate cons | `validateLoadDocumentFile` 25 MB | 26214400 — same tier as `driver-uploads` |
| avatars | Own profile photo (public bucket) | inline 5 MB literal | 5 MiB, and note it is a **public** bucket |
| fleet-documents | DOT inspections, quarterly inspections, maintenance invoices | `validateFile` 10 MB on some paths; `QuarterlyInspectionPanel` uploads with no size check | 10 MiB |
| ica-signatures | Contractor/carrier signature images on ICAs and lease terminations | none — canvas exports | 10 MiB |

### Tier 3 — staff or management only

| Bucket | What writes it | Client check | Limit that would match its tier |
|---|---|---|---|
| pei-documents | Staff only (RLS `is_staff` on insert), PEI screening paperwork | 10 MB on the PEI upload path | 10 MiB |
| dot-consultant-attachments | Staff attaching files to a consultant request | inline 10 MB literal | 10 MiB |
| resource-library | Company document editor, resource PDFs | `DocumentEditorModal` 20 MB | 20 MiB, its own declared tier |
| service-logos | Service library logo upload (public bucket) | none found | 5 MiB — a logo, and the bucket is public |

### Tier 4 — server-written only; no browser upload path exists

| Bucket | What writes it | Client check | Limit that would match its tier |
|---|---|---|---|
| rods-logs | `purge-rods-day`, `sweep-rods-orphans`, ELD log generation — federal records | n/a | leave unbounded, or a high ceiling only; a cap here can *lose* a required record |
| eld-notices | Malfunction notices, officer packets, retention archives | n/a | high ceiling; a retention archive is legitimately large |
| passenger-auth-signatures | `finalize-passenger-auth` | n/a | small ceiling is safe |
| passenger-auth-executed | `finalize-passenger-auth` | n/a | small ceiling is safe |

Recommendation, for the owner to accept or refuse: cap Tier 1 and Tier 2 to match the
validator already guarding each path, cap Tier 3 the same way, and leave Tier 4 alone
unless a ceiling is chosen deliberately — a cap on `rods-logs` or a retention archive
turns an oversized federal record into a silent write failure.

## Guard blind spot found while writing this

The tier guard (`src/test/file-size-tier.test.ts`) only matches
`export const MAX_*(BYTES|SIZE) = N * 1024 * 1024` under `src/**`. It therefore does
not see the inline literals above — 5 MB in `EditProfileModal.tsx:224`, 5 MB in
`StaffMemberPanel.tsx:317`, 10 MB in `OperatorDetailPanel.tsx:414` and `:6250`,
`MAX_BYTES` in `RevisionReplyAttachments.tsx:11` (not exported). Two of those are a
5 MB tier that no declared constant records. Folding them into the declared tiers is
a separate pass; recorded here so it is not discovered a third time by accident.
