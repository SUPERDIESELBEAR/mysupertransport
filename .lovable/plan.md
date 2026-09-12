# Two checks on the 2026-09-12 file-size pass

Read-only. Nothing in the project changed; mutations ran against a throwaway copy under `/tmp`, since deleted. `git status` is clean.

## 1. The bucket caps exist only in the live database

Live `storage.buckets` values, all 21 buckets:

| Bucket | Live `file_size_limit` | In a migration file? |
|---|---|---|
| inspection-documents | 26,214,400 (25 MiB) | **no** |
| driver-uploads | 26,214,400 (25 MiB) | **no** |
| broker-documents | 25,000,000 | **no** |
| rate-con-ingest | 30,000,000 | **no** |
| message-attachments | 10,485,760 | yes — `20260427110313_c4fdf046…sql:142` (`10485760, -- 10 MB`) |
| application-documents, application-revision-replies, avatars, dot-consultant-attachments, eld-notices, fleet-documents, ica-signatures, load-documents, operator-documents, passenger-auth-executed, passenger-auth-signatures, pei-documents, resource-library, rods-logs, service-logos, signatures | null (unbounded) | n/a |

Plainly: **four caps exist live and in no file.** The only cap recorded in `supabase/migrations` is `message-attachments`, from 2026-04-27. `inspection-documents` and `driver-uploads` were set by the storage tool during yesterday's pass; `broker-documents` and `rate-con-ingest` were set the same way in August. Nothing in the repository records that any of them was ever set.

Consequences, stated without fixing them:

- Rebuild the environment from migrations and the binder path returns to unbounded — the exact hole the pass was closing. The client validator still refuses at 25 MB, but a direct storage API call does not go through it.
- The values also disagree with each other in kind: 26,214,400 is 25 MiB, 25,000,000 is decimal 25 MB, and neither is written down.
- `storage.buckets` cannot be written from a migration in this project (writes are rejected), so recording them means the storage tool plus a durable note, not SQL. That is a decision for a build pass.

## 2. The tier guard fails on all three mutations

Baseline in the scratch copy: 5 passed. Each mutation applied alone, then reverted.

**a. Value drifted off its tier** — `MAX_BINDER_BYTES` 25 → 30 MB. 2 of 5 failed:

```text
FAIL … > keeps every constant on one of the three allowed tiers
+   "src/lib/binderUpload.ts::MAX_BINDER_BYTES (30 MB)",
FAIL … > matches the declared megabyte value for each constant
+   "src/lib/binderUpload.ts::MAX_BINDER_BYTES is 30 MB, declared 25 MB",
```

**b. Fourth constant at a new size** — `export const MAX_ARCHIVE_BYTES = 40 * 1024 * 1024` added to `loadDocuments.ts`, with a `SIZE LIMIT` comment above it so only the tier assertions could catch it. 2 of 5 failed:

```text
FAIL … > declares every file-size constant in the tier table
+   "src/lib/loadDocuments.ts::MAX_ARCHIVE_BYTES (40 MB)",
FAIL … > keeps every constant on one of the three allowed tiers
+   "src/lib/loadDocuments.ts::MAX_ARCHIVE_BYTES (40 MB)",
```

**c. Recorded reason removed** — the `SIZE LIMIT` block above `MAX_BINDER_BYTES` deleted. 1 of 5 failed:

```text
FAIL … > requires a recorded reason above each constant
+   "src/lib/binderUpload.ts::MAX_BINDER_BYTES",
```

No mutation passed silently. Unlike the nav-target case, this guard reads real file text and names the offending constant, so a green run means the four declared constants are the only ones present, on tier, at their declared values, each with a reason. Its blind spot is scope, not assertion strength: it only reads `src/**` for `export const MAX_*(BYTES|SIZE) = N * 1024 * 1024`. A limit written as a bare byte count, declared inside an edge function under `supabase/functions`, or — as section 1 shows — held only in a storage bucket, is invisible to it.

## Suites run

`src/test/file-size-tier.test.ts` — baseline 5/5 green, then 2 failed, 2 failed, 1 failed across the three mutations. No other suite was run; nothing was fixed.
