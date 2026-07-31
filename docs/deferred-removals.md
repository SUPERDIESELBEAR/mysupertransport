# Deferred removals

Code kept alive only until a stated signal says it is safe to delete. Each entry
names the trigger, not a date, so nothing is removed on a hunch.

## `classifyError` message-text fallback

**Where:** `src/lib/eld/offline/queue/classify.ts`

**What:** the `REJECTION_MARKERS` substring checks and the three
`lower.includes(...)` guards. Every refusal the database raises now carries a
class-P0 SQLSTATE (`REJECTION_SQLSTATES` in `queue/types.ts`), which
`classifyError` reads first and which never depends on message wording.

**Why it still exists:** sync-queue entries are durable. An entry queued by a
client build that predates the SQLSTATE work can still be draining on a driver's
phone weeks later, and its stored error text is all we have.

**Removal trigger:** `classifyStringFallbackCount()` reports zero for 30
consecutive days across the fleet. Every fallback hit logs the stable tag
`eld_sync_classify_string_fallback` to the console with the offending message.

**How to remove:** delete the marker loop, the `lower.includes` block, and the
`noteStringFallback` / `classifyStringFallbackCount` /
`resetClassifyStringFallbackCount` exports. Keep `extractSqlState`,
`REJECTION_SQLSTATES`, and `isDuplicateDateRejection` (the latter is a UI
question, not a retry question -- re-point it at SQLSTATE `P0031` at that time).
