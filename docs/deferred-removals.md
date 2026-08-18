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

## `purge_rods_day(uuid, text, text)` — the three-argument overload

**Where:** database function
`public.purge_rods_day(_day_id uuid, _reason text, _storage_owner text)`

**What:** the pre-attribution signature. Its body is now a single delegation to
the four-argument form with `_actor_id => NULL`, so the purge logic lives in
exactly one place and the two cannot drift. A call through it purges normally
and records `actor_id = auth.uid()` — which is NULL under the service-role
client `requireStaff` returns, i.e. the defect this pair exists to retire.

**Why it still exists:** the edge function and the migration deploy separately.
`purge_rods_day` is the only way to remove a certified record of duty status,
so dropping the three-argument form in the same migration that added the
four-argument one would leave a window — between the migration applying and
`purge-rods-day` going live — in which the deployed function calls a signature
that no longer exists and nothing can be purged, including a failed test run.
Same sequence as the seven-argument `certify_rods_day`: migration 1 (new
signature, old one kept as a delegate) → edge function deploy → migration 2
(drop).

`_actor_id` defaults to NULL deliberately, and that default outlives this
entry: a genuinely unattended service-role call — a scheduled sweep — has no
human behind it and should record `service_role` honestly rather than fail.

**Removal trigger:** `purge-rods-day` is deployed and confirmed calling the
four-argument form — a successful purge whose `rods_day_purged` audit row
carries a non-null `actor_id`. Confirm with:

```sql
SELECT id, actor_id, actor_name, created_at
  FROM public.audit_log
 WHERE action = 'rods_day_purged'
 ORDER BY created_at DESC
 LIMIT 5;
```

**How to remove:**

```sql
DROP FUNCTION public.purge_rods_day(uuid, text, text);
```

## `certify_rods_day(uuid,text,text,text,text,uuid,jsonb)` — the seven-argument overload

**Deploy timestamp:** UNCONFIRMED as of 2026-08-02. The blank cannot be filled
from the database: across all of `rods_days`, every certified row has
`certification_signature_validation IS NULL` (latest `certified_at`
2026-08-01T22:31:53Z), so not one certification through the eight-argument
path has been observed. Fill this from the deploy record when the bundle ship
time is known — a timestamp back-derived from data or git history is a guess,
not the moment the old argument set stopped being issued.

**Drain check has an empty numerator.** The only certified rows in the table
were the `is_demo` scratch days, purged 2026-08-02. Until real certifications
accumulate, the query below returns zeros for both columns and proves nothing;
the removal trigger stays unmet.

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

## Anon-executable functions with no `REVOKE` in any migration — the 61

**Where:** schema `public`, 61 functions. Confirmed 2026-08-03 by comparing the
live ACL (`aclexplode(pg_proc.proacl)`, extension-owned objects excluded via
`pg_depend.deptype = 'e'`) against every `REVOKE` in `supabase/migrations`.

**What:** 61 functions hold `EXECUTE` for `anon` with nothing in any migration
that ever tried to close them. Genuine omissions, distinct from the four
platform re-grant cases (fixed 2026-08-03), which had the `REVOKE` and lost it
after apply.

**Risk read, done today, not deferred.** Four are write paths reachable by
`anon` at the grant layer. All four hold a body-level gate and all four fail
closed, because `auth.uid()` is NULL for `anon`:

| Function | Gate | Anon outcome |
| --- | --- | --- |
| `assign_user_role` | inline `EXISTS` on `user_roles` for management/owner; refuses `owner` outright | raises `Only management users can assign roles` |
| `remove_user_role` | same inline `EXISTS`; refuses `owner` outright | raises `Only management users can remove roles` |
| `set_go_live_with_override` | `has_role(auth.uid(), 'owner')` | raises `insufficient_privilege` |
| `move_revisions_to_pending` | `is_staff(auth.uid())` | raises `not_authorized` |

Hygiene, not an open door: the grant layer is reachable, the body is not. The
remaining 57 are reads and helpers, several taking a caller-supplied uuid
(`get_user_roles`, `get_staff_contact_info`, `get_thread_participants`,
`get_equipment_shipping_for_operator`, the PEI queue family) — the
`has_role`/`is_staff` role-membership oracle shape already registered, at wider
scope.

**Removal trigger:** each function's `anon` grant is revoked and the revoke is
re-read live (per the re-grant section of `database-security-conventions.md`),
with the tokenized signed-out flows in §3 explicitly exempted. Closed when the
live sweep returns zero non-exempt anon-executable functions.

## Duplicated role-membership check in `assign_user_role` / `remove_user_role`

**Where:** `public.assign_user_role`, `public.remove_user_role`.

**What:** each carries its own inline
`EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('management','owner'))`
instead of calling `public.has_role`. Two independent copies of "who may assign
roles", governing role assignment itself — the same drift shape as the label
drift and `AMENDABLE_HEADER_FIELDS`. A change to the role hierarchy that lands
in `has_role` does not reach these two.

**Removal trigger:** both bodies consolidated onto `has_role` (or
`has_any_role`), with the `owner` refusal kept as its own explicit check — or a
line recorded here stating why the inline copy has to exist.

## Removed 2026-08-18: `create_eld_document_day`, `replace_rods_document`

**What:** both SECURITY DEFINER functions were dropped in the tap-to-change
paper-log migration, along with their only caller,
`src/components/operator/rods/UploadEldLogModal.tsx`.

**Why now, rather than a note:** the redesign removes the driver-facing path
that filed an ELD-produced log file, so both functions lose their last caller
in the same change. A definer function nothing reaches drifts from the schema
around it — their offline queue handlers had already drifted from the RPC
argument lists before they were deleted, which is exactly the failure this
records against. Leaving two orphans plus a note would repeat it.

They were checked separately rather than treated as equivalent:

- `replace_rods_document` replaces the document on a `record_source =
  'eld_document'` row. A live query returned **0 such rows**, so it is
  unreachable in every sense — there is nothing for it to act on and no way to
  create something for it to act on.
- `create_eld_document_day` had a plausible future: a staff-side filing path.
  With zero document days in existence, that path would be built new against
  whatever staff UI is written, not against this signature. Dropping it costs
  nothing; keeping it would preserve an argument list no future caller would
  match.

**What stays, deliberately:** `rods_days.record_source`, its `'eld_document'`
CHECK value, `enforce_rods_day_source_document`, and the P0019 / P0045 / P0046
guards. The schema still knows what a document day is, so re-adding a staff
filing path is one additive migration and no data migration.

**Re-add trigger:** staff ask to file an ELD-produced log on a driver's behalf.
Write the RPC against the new caller's argument list — including a display
rendition path and conversion-failure flag, which the deleted pair never took.
