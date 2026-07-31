## Verified before planning

- **rods_events has the same RLS shadow — confirmed.** Its INSERT/UPDATE/DELETE policies all gate on `EXISTS (… rods_days d WHERE d.id = rods_day_id AND is_own_rods_operator(d.operator_id) AND d.locked = false)`. Once the parent day is locked, every segment write is filtered out before `enforce_rods_event_lock` runs: 0 rows, no error. Segment saves are the frequent path, so this is the wider hole.
- **There are no `save_draft_day` / `save_draft_segments` queue kinds today.** `SyncKind` is: `upload_rods_pdf`, `upload_signature`, `certify_rods_day`, `create_eld_document_day`, `replace_rods_document`, `upload_notice_pdf`, `upload_notice_signature`, `send_notice`, `upload_merged_packet`, `send_officer_email`. Draft header and segment writes are **direct, unqueued** table writes in `src/hooks/useRodsDay.ts` (day update; events delete + insert) and `src/components/operator/rods/RodsDayEditor.tsx`. They discard the result and never look at row counts — so today a driver editing a day certified on another device gets a clean-looking save with nothing written.
- **Bare-P0001 audit (dumped every RODS/notice/short-link definer body).** Coded correctly: `certify_rods_day` (P0010–P0031), `enforce_rods_day_lock` (P0002/P0040/P0041). Still bare P0001: `enforce_rods_certified_continuity`, `enforce_rods_event_lock`, the `discard_rods_amendment()` hint branch of `enforce_rods_day_lock`, all of `discard_rods_amendment` (3), all of `create_eld_document_day` (5), `get_or_create_short_link` (2), `purge_rods_day` role refusal, and the `enforce_eld_*` malfunction/suppression guards.
- **P0013 / P0014 / P0015 / P0023 are already in `REJECTION_SQLSTATES`** (`src/lib/eld/offline/queue/types.ts`) with meanings; the conventions doc still carries the older, shorter table and must be brought up to date.

---

## 1. Zero rows affected becomes a distinct outcome

**New error class.** Add `row_not_writable` to `SyncErrorClass` in `src/lib/eld/offline/db.ts`, with a driver-facing message constant: *"This log was certified on another device and can no longer be edited."*

**Detection at every rods write.** Every write to `rods_days` / `rods_events` requests its rows back (`.select('id')` on update/delete/insert) and asserts a non-empty result. A shared helper `assertRowsAffected(result, context)` in a new `src/lib/eld/rodsWrite.ts` throws a typed `RowNotWritableError` carrying table, day id and log date. Applied to:
- `useRodsDay.ts` — the day `update`, the `rods_events` `delete`, and the `rods_events` `insert`.
- `RodsDayEditor.tsx` — the header update and the amendment segment writes.
- Any future queue handler that writes these tables directly (today's handlers go through RPCs, which raise properly).

**Classification.** `classifyError` returns `row_not_writable` for `RowNotWritableError` before any other branch. Never retried.

**Routing.** `runner.ts` treats `row_not_writable` like `rejected` for durability — `markTerminal(entry.id, 'rejected', 'row_not_writable', message)`, bytes retained, no purge — and raises a distinct `raiseSyncAlert({ kind: 'log_not_writable' })` so Management sees "driver's edits were silently dropped", not a generic sync failure.

At the direct (online, unqueued) sites the thrown error surfaces as the same copy in a destructive toast, and marks the day stale so hydration re-pulls the certified server row instead of leaving phantom edits on screen.

**Test.** A stubbed Supabase client returning `{ data: [], error: null }` must produce: classified `row_not_writable`, entry terminal, alert raised, cached bytes still present.

## 2. Give every named RAISE its own code — one code, one condition, one operation

No code is shared across functions. Codes are free; ambiguity isn't.

| Function | Condition | Code |
|---|---|---|
| `enforce_rods_certified_continuity` | certified log superseded without a certified replacement | **P0042** |
| `enforce_rods_day_lock` | "use discard_rods_amendment()" hint branch | P0043 |
| `enforce_rods_event_lock` | segments of a certified log changed | P0044 |
| `discard_rods_amendment` | log not found | P0070 |
| `discard_rods_amendment` | not the log owner | P0071 |
| `discard_rods_amendment` | not an uncertified correction draft | P0072 |
| `create_eld_document_day` | certification token required | P0080 |
| `create_eld_document_day` | not the log owner | P0081 |
| `create_eld_document_day` | uploaded document missing | P0082 |
| `create_eld_document_day` | token belongs to another log | P0083 |
| `create_eld_document_day` | certified log already exists for the date | P0084 |
| `get_or_create_short_link` | invalid share token | P0050 |
| `get_or_create_short_link` | authentication required | P0051 |
| `enforce_eld_*` guards | validation-on-write conditions | P0060–P0064 |

`P0010`–`P0031` stay exclusive to `certify_rods_day`. The `enforce_eld_*` codes are not sync-queue outcomes and do not enter `REJECTION_SQLSTATES`.

`REJECTION_SQLSTATES` gains P0042, P0043, P0044, P0050, P0051, P0070–P0072, P0080–P0084. Grouping by *condition* (e.g. "duplicate certified date" across operations) is expressed as a separate `CONDITION_GROUPS` mapping in `types.ts`, never by overloading the wire value.

`docs/database-security-conventions.md` gets the **full** table — including P0013, P0014, P0015 and P0023, observed but never documented — plus a standing rule: *a named condition in a definer function or trigger always carries an explicit `USING ERRCODE`, unique to that function; P0001 is reserved for genuinely unhandled exceptions.*

## 3. Seeded run — prove the driver-facing no-op now fails loudly

With a real signed-in driver session over PostgREST, against a **certified** day:

- **(a) header update** — `update rods_days … .select('id')`. Record the literal response: row count and error. Expected `[]` / `null`. Confirm `assertRowsAffected` raises `RowNotWritableError`, the day is flagged, hydration re-pulls the server row, and the driver sees the copy instead of a clean save.
- **(b) segment delete-and-insert** — `delete rods_events … .select('id')` then `insert … .select('id')`. Same recording and same three assertions.

This is the failure the item exists to close; a privileged P0044 does not substitute for it.

Additionally provoke and record verbatim: **P0042** (certify an amendment whose `log_date` mismatches, observing the deferred trigger at COMMIT), **P0043**, and **P0044** from a privileged path. Then purge the scratch rows and confirm zero residue.

## Technical notes

- No RLS policy changes. Loosening policies so the trigger could raise would widen driver write access to certified federal records; client-side 0-row detection is the correct fix.
- `SyncErrorClass` widening touches `types.ts`, `db.ts`, `store.ts`, `runner.ts`, `alerts.ts`; persisted entries carry only the three old classes and are unaffected.
- One migration; function bodies only, no table or policy changes.
