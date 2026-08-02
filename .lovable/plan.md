## Defect 1 — remove the argument, not the mistake

**`commitCertification` reads the day from `rods_days_cache` and drops `day` from its input.**

It already reads it: line 202 does `const existing = await roadsideDb.rods_days_cache.get(logDate)` inside the same transaction that writes `signedDay`, purely for the version counter. Taking the day from `existing.day` costs nothing, stays inside the transaction, and makes a stale day unrepresentable — there is no argument left to pass wrong. `flushPendingHeader` has already written the merged row by then, so the cache is authoritative.

- `CommitCertificationInput`: delete `day`. Build `signedDay` from `existing.day`. Refuse with a clear error if the cache has no row for the date — that state means the editor never flushed, and certifying it would lock a row nobody has seen.
- Update `RodsDayEditor.certify` and the two input-constructing tests (`signatureCommitGuard.test.ts`, `emptyEventSet.test.tsx`).

### Other render-time `day` uses inside `certify()`

The reason patch lands at line 202, so anything before it is fine and anything after it is suspect:

| line | use | after the patch? | verdict |
|---|---|---|---|
| 168, 171 | `assertPersistedMatches` | before | fine |
| 185, 187 | `day!.supersedes_day_id` | at | fine — untouched by the patch |
| 207 | `rods_day_id: day!.id` | after | fine — id is stable |
| **231** | `renderRodsDay({ day: { ...day!, ... } })` | **after** | **second live instance** |
| 249 | `diffAmendment` | after | already spreads the reason — the workaround |
| **265** | `commitCertification({ day: day! })` | **after** | the defect found |

Line 231 renders the officer-facing PDF from a day whose `amendment_reason` is null. Resolve the merged day **once**, immediately after the reason flush, and use that variable at 231 and 249:

```ts
const certifiedDay = (await getCachedDay(logDate))?.day ?? day!;
```

Both mechanisms: one resolved variable for the two in-handler uses, no `day` argument at all on `commitCertification`.

## Defect 2 — `operator_id` in the base payload type

Audit of every `SyncKind` at its enqueue site:

| kind | enqueue site | `operator_id` |
|---|---|---|
| `save_draft_day` | `useRodsDay.ts:231`, `:335` | yes |
| `save_draft_segments` | `useRodsDay.ts:417` | yes |
| `record_unlock` | `authorizedUnlock.ts:122` | yes |
| `send_officer_email` | `officerSend.ts:70` | yes |
| `raise_sync_alert` | `alerts.ts:120` | yes |
| **`certify_rods_day`** | `commitCertification.ts:241` | **no** |
| **`upload_signature`** | `commitCertification.ts:232` | **no** |
| **`upload_rods_pdf`** | `commitCertification.ts:237` | **no** |
| **`upload_notice_pdf`** | `noticeDrain.ts:186` | **no** |
| **`upload_notice_signature`** | `noticeDrain.ts:196` | **no** |
| **`send_notice`** | `noticeDrain.ts:207` | **no** |
| **`upload_merged_packet`** | `officerSend.ts:64` | **no** |
| `create_eld_document_day` | none | deleted, below |
| `replace_rods_document` | none | deleted, below |

Eight live kinds carry no `operator_id`, so each has the same undeliverable-alert defect waiting. The notice chain matters most: a notice that permanently fails to send is exactly what Management must hear about.

- Add `operator_id: string` to the queue payload base type, so `EnqueueInput` / `queueEntry` will not typecheck without it. A new kind cannot omit it.
- Backfill all eight. Every one of those scopes already holds the operator id.
- `reportTerminal` reads it as required; the `undeliverable` counter stays as a runtime backstop, not the guarantee.

## Deleting the two enqueue-less kinds

Delete them. No planned offline path justifies keeping them, and they have **already diverged** — the evidence is in the code as of now:

- `UploadEldLogModal.tsx:129` calls `replace_rods_document` with `p_display_document_path` and `p_display_conversion_failed`. The handler at `handlers.ts:253` passes neither.
- `UploadEldLogModal.tsx:151` calls `create_eld_document_day` with the same two display arguments. The handler at `handlers.ts:237` passes neither.

So the drift the concern predicts is not hypothetical — the handlers are already behind the only real caller and would file document days with no display rendition. Wiring them up today would ship that bug.

Removing:
- The two handler methods in `handlers.ts`.
- The two members of the `SyncKind` union in `db.ts:259-260`.
- Any test fixture referencing them (`parityFixtures.test.ts:407` is a comment about the RPC, not the kind — it stays).

Not removing: the RPCs themselves, their SQLSTATE entries in `types.ts` (P0080-P0084), and their `definer-live-catalog.test.ts` pins. The modal calls both RPCs directly and that path is live.

`SyncKind` is a durable value in Dexie, so an entry queued by an older build could in principle carry a removed kind. Nothing ever enqueued these, so no such entry can exist — but the runner's unknown-kind path will be checked to confirm it fails the entry loudly rather than crashing the drain, and that fact recorded in the deletion commit.

## Defect 3 — approved as reported

The day header reads `sync_stalled` / `sync_rejected` from the cache instead of showing the green "Signed on this device, syncing" unconditionally, and surfaces `last_error` from the terminal entry.

## Guards — five files, all in `test:guards`

1. **Notification priority** — scan `supabase/migrations/*.sql`, extract the allowed set from the latest `notifications_priority_check`, fail on any literal `priority` outside it.
2. **Payload `operator_id`** — assert at runtime that every enqueued payload carries a non-empty `operator_id`, backing the compile-time base type.
3. **`tab` alias** on `ManagementPortal.tsx`, framed in the comment as a compatibility shim, not a convergence.
4. **Conventions doc** — `docs/database-security-conventions.md` records `view` as canonical for both portals; `tab` accepted as legacy input, never written by new code.
5. **Deep-link writer audit** — the `send-notification` edge function, the DB notification triggers, and in-app `navigate` calls each verified against their target.

Both new tests are registered in `test:guards` so neither depends on someone remembering to run it.

## Then resume

Re-run the §4 walkthrough from step 3: amend, certify, `certify_rods_day` succeeds, the amendment supersedes `689eb664`, one `rods_amendments` row per changed field, and the correction request auto-closes.
