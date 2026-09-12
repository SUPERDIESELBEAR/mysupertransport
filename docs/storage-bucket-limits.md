# Storage bucket size limits — the authoritative record

Date: 2026-09-12 (caps applied), superseding the 2026-09-12 report-only version.

## Why this file exists

Bucket configuration is not in `supabase/migrations` and cannot be put there:
writes to `storage.buckets` are rejected in this project, so a cap can only be set
by the storage tool against the live database. Only one cap
(`message-attachments`) exists in a migration file.

That means a rebuilt environment comes up with every other bucket unbounded unless
someone re-applies these values by hand. The client validators are the polite layer —
they refuse a file in the browser. The bucket cap is what refuses a direct storage API
call that never loads the app at all.

So this document is the intent, and `src/test/storage-bucket-limits.test.ts` is the
check: it reads `storage.buckets` live and fails when a value drifts from the table
below, whether it was changed out of band or lost in a rebuild.

**`null` is stated explicitly, never omitted.** After this pass a null is a DECISION,
not an omission — see "The four deliberate nulls" below. Exactly four buckets may
read null, and the guard asserts that too.

## Units

The storage tool takes `"10MB"` and stores 10,485,760 — i.e. its `MB` is a **MiB**.
Every cap in the table below is therefore a power-of-two value matching the client
constants, which are all `N * 1024 * 1024`.

One exception remains, deliberately: `rate-con-ingest` at 30,000,000 (decimal), a
server-side email ingest path with no browser validator in front of it. Nothing
compares against it, so there is nothing for it to disagree with.

`broker-documents` was 25,000,000 (decimal) — about 1.4 MB **stricter** than the
25 MiB validator guarding the same path, so a file between the two passed the browser
and was refused by storage with a raw error. Realigned to 26,214,400 on 2026-09-12.
The decimal value was not chosen for any recorded reason; it was the storage tool's
default parse at the time.

## Every bucket, intended limit, and live agreement

Verified against `storage.buckets` on 2026-09-12, after the caps were applied. All 21.

| Bucket | Public | Intended `file_size_limit` | Live matches | In a migration | Why this value |
|---|---|---|---|---|---|
| application-documents | no | 10485760 (10 MiB) | yes | no | `validateFile` on the public `/apply` form |
| application-revision-replies | no | 10485760 | yes | no | `MAX_FILE_SIZE_BYTES` in the reply attachment control |
| avatars | yes | 5242880 (5 MiB) | yes | no | `MAX_AVATAR_BYTES`, a cropped square photo |
| broker-documents | no | 26214400 (25 MiB) | yes | no | `validateLoadDocumentFile`; realigned from 25,000,000 |
| dot-consultant-attachments | no | 10485760 | yes | no | the staff attachment check on that screen |
| driver-uploads | no | 26214400 | yes | no | `validateBinderFile` / `validateLoadDocumentFile` |
| eld-notices | no | **null — deliberate** | yes | no | see below |
| fleet-documents | no | 10485760 | yes | no | `validateFile` on the inspection/maintenance paths |
| ica-signatures | no | 10485760 | yes | no | canvas exports; generous ceiling, no file chooser |
| inspection-documents | no | 26214400 | yes | no | `validateBinderFile` |
| load-documents | no | 26214400 | yes | no | `validateLoadDocumentFile` |
| message-attachments | no | 10485760 | yes | **yes** | `20260427110313_c4fdf046-…sql:142` |
| operator-documents | no | 10485760 | yes | no | `validateFile` on the driver document paths |
| passenger-auth-executed | no | **null — deliberate** | yes | no | see below |
| passenger-auth-signatures | no | **null — deliberate** | yes | no | see below |
| pei-documents | no | 10485760 | yes | no | the PEI upload check |
| rate-con-ingest | no | 30000000 | yes | no | server-side email ingest only; decimal, no client pair |
| resource-library | no | 20971520 (20 MiB) | yes | no | `DocumentEditorModal` |
| rods-logs | no | **null — deliberate** | yes | no | see below |
| service-logos | yes | 5242880 | yes | no | a logo, and the bucket is public |
| signatures | no | 10485760 | yes | no | canvas exports; generous ceiling |

Seventeen caps exist live and in no file. Only `message-attachments` is in a
migration. This table plus the guard is the only thing recording the other sixteen.

## The four deliberate nulls

`rods-logs`, `eld-notices`, `passenger-auth-signatures`, `passenger-auth-executed`.

These are **decisions, not oversights.** All four are written only by edge functions —
no browser upload path exists — and the first two hold federal records: ELD logs,
malfunction notices, officer packets, retention archives. A cap on those turns an
oversized but legally required record into a silent write failure at exactly the moment
it matters. A retention archive is legitimately large and its size is not knowable in
advance.

The two passenger-auth buckets hold small generated artefacts from
`finalize-passenger-auth`; a small cap would be safe, but there is no exposure to
justify one, since nothing outside the function can write them.

Decision owner: Marc Mueller, 2026-09-12. Revisit only if a browser upload path is
ever added to any of the four — that is the trigger, and it changes the reasoning
rather than merely the value.

## Changing a cap

1. Change the value with the storage tool (`supabase--storage_update_bucket`), or
   remove it with `remove_file_size_limit`.
2. Change the same row in the table above, and `INTENDED` in the guard, in the same pass.
3. Run `src/test/storage-bucket-limits.test.ts`. A step-1-only change fails it, which
   is the point.

## Validator / bucket pairs — no bucket is stricter than its validator

Checked after the change. A bucket stricter than the check in front of it is the
"displayed higher than enforced" defect: the browser accepts the file and storage
rejects it with a raw error.

| Bucket | Client check in front of it | Bucket cap | Verdict |
|---|---|---|---|
| application-documents | `validateFile` 10 MiB | 10 MiB | equal |
| application-revision-replies | `MAX_FILE_SIZE_BYTES` 10 MiB | 10 MiB | equal |
| avatars | `MAX_AVATAR_BYTES` 5 MiB | 5 MiB | equal |
| broker-documents | `validateLoadDocumentFile` 25 MiB | 25 MiB | equal (was stricter) |
| dot-consultant-attachments | inline 10 MiB | 10 MiB | equal |
| driver-uploads | `validateBinderFile` 25 MiB | 25 MiB | equal |
| fleet-documents | `validateFile` 10 MiB on most paths | 10 MiB | equal; the quarterly-inspection path still has no client check, so the bucket is the only guard there |
| ica-signatures | none (canvas export) | 10 MiB | bucket is the only guard, and far above a signature PNG |
| inspection-documents | `validateBinderFile` 25 MiB | 25 MiB | equal |
| load-documents | `validateLoadDocumentFile` 25 MiB | 25 MiB | equal |
| message-attachments | 10 MiB | 10 MiB | equal |
| operator-documents | `validateFile` 10 MiB | 10 MiB | equal |
| pei-documents | 10 MiB | 10 MiB | equal |
| rate-con-ingest | none (server ingest); `MAX_RATECON_BYTES` 20 MiB guards the browser path, which writes elsewhere | 30,000,000 | bucket is looser, not stricter |
| resource-library | `DocumentEditorModal` 20 MiB | 20 MiB | equal |
| service-logos | none found | 5 MiB | bucket is the only guard |
| signatures | none (canvas export) | 10 MiB | bucket is the only guard |

No bucket is stricter than the validator in front of it. Two open items, recorded not
fixed: `service-logos` and the quarterly-inspection path into `fleet-documents` have no
client check, so an oversized file there fails with a storage error rather than a
sentence on screen.

## Tier alignment

The four inline size literals the previous pass reported were folded into declared
constants on 2026-09-12: the two 5 MB avatar checks now use `MAX_AVATAR_BYTES`, a
newly **declared fourth tier** in `src/lib/validateFile.ts`; the two 10 MB checks in
`OperatorDetailPanel` and the non-exported `MAX_BYTES` in `RevisionReplyAttachments`
now use `MAX_FILE_SIZE_BYTES`. `src/test/file-size-tier.test.ts` declares 5/10/20/25
and fails on a fifth.
