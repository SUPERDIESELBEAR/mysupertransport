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

## `purge_rods_day(uuid, text)` — the two-argument overload

**Where:** database function `public.purge_rods_day(_day_id uuid, _reason text)`

**What:** the old two-argument signature. Its body is now nothing but an
unconditional `RAISE EXCEPTION ... ERRCODE = '42501'` carrying the same message
as the three-argument form's storage-owner gate. It cannot purge anything.

**Why it still exists:** edge functions deploy separately from migrations.
`purge_rods_day` is the only way to remove a certified record of duty status, so
dropping the signature in the same migration that added the three-argument form
would leave a window — between the migration applying and `purge-rods-day`
going live — in which the deployed function calls a signature that no longer
exists and nothing can be purged, including a failed test run. Keeping the
overload as a loud refusal closes the deliberateness gap immediately without
creating an unpurgeable window.

**Removal trigger:** `purge-rods-day` is deployed and confirmed calling the
three-argument form (a successful purge with `storage_owner` present in the
`rods_day_purged` audit metadata).

**How to remove:**

```sql
DROP FUNCTION public.purge_rods_day(uuid, text);
```

## `certify_rods_day(uuid,text,text,text,text,uuid,jsonb)` — the seven-argument overload

**Deploy timestamp:** ______ (fill on deploy)

**Where:** database function
`public.certify_rods_day(_day_id uuid, _legal_name text, _signature_path text,
_pdf_path text, _device_info text, p_certification_token uuid, p_changes jsonb)`

**What:** the pre-signature-validation signature. Its body now delegates to the
eight-argument form with `p_signature_validation => NULL`, so the certification
logic exists in exactly one place and the two cannot drift. A call through it
certifies normally and records no validation — correct for a client that never
computed one.

**Why it still exists:** the client and the migration deploy separately, and
certify entries are already sitting in drivers' sync queues, some offline for
days. Dropping the old signature in the migration that adds the new one would
mean every queued call landing between the migration and the new bundle hits a
function that no longer exists. Worse than the `purge_rods_day` case: a missing
signature classifies as `server`, so the entry burns its attempt budget rather
than waiting for the client that would have fixed it. Sequence is: migration 1
(new signature, old one kept) → client deploy → migration 2 (drop).

**Interim guard:** both signatures are in `KNOWN_AUTHENTICATED_EXECUTABLE` in
`src/test/definer-live-catalog.test.ts`, with `KNOWN_AUTHENTICATED_EXECUTABLE_MAX`
at 66 instead of 65. The guard stays strict; the pair is declared, not tolerated.

**Removal trigger:** no queued entry can still carry the old argument set. In
practice: the new bundle is live, and every `rods_days` row certified after the
deploy timestamp recorded at the top of this entry carries a non-null
`certification_signature_validation`, with none appearing for a full offline
drain window (the outer bound of the queue's retry budget). Fill that blank when
the client bundle ships — the check below cannot be run without it, and a
timestamp reconstructed from git history months later is a guess, not the
moment the old argument set stopped being issued. Confirm with:

```sql
SELECT count(*) FILTER (WHERE certification_signature_validation IS NULL) AS unvalidated,
       count(*) AS certified_since_deploy
  FROM public.rods_days
 WHERE certified_at > '<deploy timestamp>';
```

**How to remove:**

```sql
DROP FUNCTION public.certify_rods_day(uuid,text,text,text,text,uuid,jsonb);
```

Then drop both the interim entry and the comment from the catalog guard and put
`KNOWN_AUTHENTICATED_EXECUTABLE_MAX` back to 65.
