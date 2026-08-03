# Database security conventions

These rules are enforced by tests. **Nothing runs those tests for you.**

## The platform re-grants EXECUTE after a migration applies

**Read this before the copy target below.** The `REVOKE` line in that template
is necessary and **not sufficient**, and assuming otherwise is how four
functions ended up anon-callable with a correct `REVOKE` sitting in their
creating migration.

- The platform re-grants `EXECUTE` to `anon` and `authenticated` on newly
  created functions in `public` **after** the migration transaction applies.
  A `REVOKE` written inside the creating migration does not survive that step.
- The revoke therefore has to be **re-asserted in a follow-up statement or a
  follow-up migration**. A correcting migration is not exempt from the re-grant
  either, so re-assert and then *read the result back*.
- `src/test/definer-live-catalog.test.ts` is the only thing that proves the end
  state, because it reads the live catalog. The file-based guards parse
  migration text — correct as written, and irrelevant to this failure mode: the
  text is right and the ACL is wrong.

Read the end state, never the migration:

```sql
SELECT p.proname,
       array_agg(DISTINCT a.grantee::regrole::text) AS grantees
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN LATERAL aclexplode(p.proacl) a ON true
 WHERE n.nspname = 'public' AND p.proname = '<name>'
 GROUP BY 1;
```

A `NULL` `proacl` means the default — `EXECUTE` to `PUBLIC` — not "no grants".

Observed 2026-08-03: `discard_rods_amendment`, `log_ica_event`,
`match_staff_help_knowledge` and `revoke_share_token` each shipped a `REVOKE`
in their creating migration and were anon-executable live. A second migration
re-asserting the revoke did stick, confirmed by reading the ACL back — but the
read is the proof, not the statement.

## The definer header — copy this, then fill the blanks

Do not write a `SECURITY DEFINER` function from memory. Start from this block
every time; every clause in it is a rule that has been broken at least once:

```sql
CREATE OR REPLACE FUNCTION public.<name>(<args>)
RETURNS <type> LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$ ... $$;
REVOKE EXECUTE ON FUNCTION public.<name>(<argtypes>) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.<name>(<argtypes>) TO <authenticated|service_role>;
```

Swap `sql`/`STABLE` for `plpgsql`/`VOLATILE` as the body requires; the
`search_path`, `REVOKE`, and `GRANT` lines do not vary. Trigger functions get
`TO service_role` only — nothing calls them directly.

**This cannot be automated here.** Migrations are authored by writing SQL
straight into the migration tool: there is no scaffold step, no template file
the tool reads, and no pre-apply hook that could inject this header. With no CI
and no git hooks (§0), `npm run test:guards` is post-apply by construction. So
this block is a copy target, and its only enforcement is that someone opens
this file.

## 0. Run the guards after every migration

There is no CI in this setup, no git hooks, and git is platform-managed — so
the assertions below execute only when someone types the command. Immediately
after authoring or applying any migration, in the same turn:

```sh
npm run test:guards
```

Before that: if the migration created or replaced a `SECURITY DEFINER`
function, check it against the copy target at the top of this file. The
checklist is copy-then-verify, not verify-only.

That runs the four suites that catch silent failures:

| Suite | Catches |
| --- | --- |
| `src/test/definer-search-path.test.ts` | a `SECURITY DEFINER` without `SET search_path = public, extensions` (§1) |
| `src/test/policy-grant-parity.test.ts` | an RLS policy with no matching `GRANT` (§3, §4) |
| `src/lib/__tests__/postgrestEmbeds.test.ts` | broken embeds *and* column references that do not exist (query lint) |
| `src/lib/eld/offline/__tests__/parityFixtures.test.ts` | client/server validation drift |

**A structural observation, not a lapse.** All of these guards were written
*after* a class of silent failure had already shipped, each is correct, and
none of them runs on its own. Batches have shipped anon-callable definers
repeatedly *after* the rule was written down — the demo-guardrail triggers, the
§3/§4 RODS batch, the twelve rewritten notification functions, the §5
extension-request triggers, and the §6 retention RPCs including
`is_retention_admin`.

**Two distinct causes, and they must not be collapsed into one.** The 2026-08-03
sweep separated them by comparing migration text against the live ACL:

- **Genuine omission** — the migration contains no `REVOKE` at all. 61 `public`
  functions are anon-executable with nothing in any migration that ever tried to
  close them. That is the hand-authoring failure this paragraph originally
  described, and the copy target is the fix.
- **Platform re-grant** — the migration contains the correct `REVOKE` and the
  function is anon-executable anyway. Four proven cases
  (`discard_rods_amendment`, `log_ica_event`, `match_staff_help_knowledge`,
  `revoke_share_token`). No amount of care at authoring time prevents this one;
  see the re-grant section at the top of this file.

The detection latency is the defect in both. Until this project has CI or hooks,
the guards are a checklist item tied to the turn, not an automatic safety net.
Do not assume a migration is clean because the rule exists, and do not assume it
is clean because you wrote the `REVOKE`.

## 1. SECURITY DEFINER functions must pin `search_path`

Every `SECURITY DEFINER` function in schema `public` must declare:

```sql
SET search_path = public, extensions
```

`SET search_path = public` alone is **not** enough. pgcrypto lives in the
`extensions` schema, so a definer pinned to `public` cannot see
`gen_random_bytes`, `digest`, `hmac`, `crypt`, or `gen_salt`.

This is not theoretical: `get_or_create_short_link` shipped with
`SET search_path = public` and a bare `gen_random_bytes(8)` call. Every
invocation raised `function gen_random_bytes(integer) does not exist`, and the
`document_short_links` table sat at zero rows until it was found in the
2026-07-30 audit.

### 1a. …and must revoke the default `PUBLIC EXECUTE`

Postgres grants `EXECUTE` to `PUBLIC` on every new function automatically. A
definer created without an explicit `REVOKE` is therefore callable by `anon`,
regardless of what it reads — and a definer reads with the owner's privileges,
so §3's table grants do not protect it. This default is the mechanism behind
all five batches counted in §0, not carelessness.

Pair every definer with:

```sql
REVOKE EXECUTE ON FUNCTION public.<name>(<argtypes>) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.<name>(<argtypes>) TO authenticated;  -- or service_role
```

Grant `anon` only when a signed-out page genuinely calls the RPC (§3's
tokenized flows). Note that an `auth.uid()` gate inside the body does not make
the grant harmless if the function takes a user id as an argument: that shape
answers role-membership questions for any uuid the caller supplies.

## 2. Extension calls must be schema-qualified

Write `extensions.gen_random_bytes(32)`, not `gen_random_bytes(32)`. Pinning
the search path and qualifying the call are belt and braces — do both.

Exceptions (these are **not** in `extensions`, do not qualify them):

| Function / operator | Lives in |
| --- | --- |
| `sha256()`, `encode()`, `convert_to()`, `gen_random_uuid()` | `pg_catalog` (built-in since PG 13) |
| `net.http_post()` | `net` |
| `<=>`, `<->`, `vector`, `halfvec` | `public` (pgvector installed there) |
| `similarity()`, `show_trgm()` | `public` (pg_trgm installed there) |

## 3. `anon` gets almost no table privileges

`anon` holds exactly two table privileges in `public`:

| Privilege | Why |
| --- | --- |
| `INSERT ON applications` | the public job-application form |
| `SELECT ON faq` | published owner-operator FAQs, row-filtered by policy |

Every other signed-out flow — `/inspect`, `/s/:code`, `/pei/respond`,
`/pei/release`, `/passenger-auth`, `/application/approve`, `/apply`,
`/preview-login` — goes through a `SECURITY DEFINER` RPC or an edge function.

Do **not** add `GRANT ... TO anon` to a new table. If a signed-out page needs
data, add a definer RPC that returns exactly the columns that page renders.

Default privileges for role `postgres` in `public` no longer grant `anon`
anything, so new tables start closed.

## 3a. `TO public` means `anon` **and** `authenticated`

A policy written without a `TO` clause defaults to `TO public`, which
`pg_policy.polroles` stores as `{0}`. PUBLIC is every role — signed-out
visitors and every logged-in user alike.

Two consequences, both learned the hard way on 2026-07-30:

1. **"No policy names `anon`" is not evidence that an `anon` grant is inert.**
   The `faq` SELECT policy was `TO public`; that grant was the live anon read
   path the whole time. Resolve `polroles` before reasoning about reachability —
   `{0}` renders as `public`, not as an empty set.
2. **Auditing an access change must cover `authenticated`, not just `anon`.**
   A `TO public` policy with no `authenticated` grant is the same defect with a
   much bigger blast radius: every logged-in user hits it, not just visitors.

Also note that `information_schema.role_table_grants` only shows grants
involving roles the *current* role is a member of, so it silently returns zero
rows for `anon`/`authenticated` and will fabricate a false regression. Audit
privileges with `aclexplode(pg_class.relacl)` instead.

`src/test/policy-grant-parity.test.ts` enforces this statically: a new policy
admitting `public`/`anon`/`authenticated` must ship with a matching `GRANT` for
that role and command in the same migration set.

## 4. Secrets belong in `app_private`

`app_private.config` is a key/value store with RLS on, no policies, and no
grants to `anon` or `authenticated`. It is readable only from
`SECURITY DEFINER` functions and `service_role`. The share-token IP salt
(`share_token_ip_salt`) lives there.

Code that depends on a value from `app_private` must **fail open** when the
value is missing — never block a user-facing read on a config lookup. See
`resolve_share_token`, which logs a `NULL` fingerprint with
`hash_version = 'v2_salt_unavailable'` and still serves the document.

## 5. Authorization predicates: positive refuse, coalesce every operand

Write the guard as *refuse unless clearly allowed*, never as *refuse if not
permitted*:

```sql
-- WRONG. If v_claim_role is NULL the comparison is NULL, NOT NULL is NULL,
-- and `IF NULL THEN` never fires. The guard permits everyone.
IF NOT (v_claim_role = 'service_role' OR session_user IN ('postgres')) THEN
  RAISE EXCEPTION 'not authorized';
END IF;

-- RIGHT. Every operand collapses to a definite boolean first.
v_allowed := coalesce(v_claim_role = 'service_role', false)
          OR coalesce(session_user IN ('postgres', 'supabase_admin'), false);
IF NOT v_allowed THEN
  RAISE EXCEPTION 'not authorized';
END IF;

-- Also RIGHT for a single call: require an explicit TRUE.
IF coalesce(public.is_own_rods_operator(v_day.operator_id), false) IS NOT TRUE THEN
  RAISE EXCEPTION 'not yours';
END IF;
```

This is the same family as the `current_user`-inside-`SECURITY DEFINER` bug
(rule 1) and the unqualified extension call (rule 2) — except this one fails
**open**. `purge_rods_day` shipped with the wrong shape on 2026-07-31; a direct
`psql` connection holding `EXECUTE` passed the check because `request.jwt.claims`
is unset outside PostgREST.

Notes:

- `IS DISTINCT FROM` is NULL-safe and fails closed; the RODS lock triggers use
  it deliberately (`current_setting('rods.privileged', true) IS DISTINCT FROM 'on'`).
- Helpers that return `EXISTS (...)` (`has_role`, `is_staff`,
  `is_own_rods_operator`) never return NULL, so negating them is safe today.
  Wrap them anyway: the rule has to be mechanical to be checkable, and a helper
  can be rewritten to return NULL later.
- `src/test/definer-fail-open.test.ts` flags a negated guard in a definer body
  that reads `current_setting`, `request.jwt`, `session_user`, or `current_user`
  without `coalesce`. It is a heuristic for the shape, not a proof.

### 5a. Seeded round-trip proof, 2026-07-31

Run from a real `@supabase/supabase-js` client holding a driver session minted
through `create-preview-session` → `redeem-preview-session` → `verifyOtp`
(demo driver `ee993ec0`), against seeded scratch `rods_days` rows, all purged
afterwards via `purge_rods_day` (11 rows, `rods_days`/`rods_events`/
`rods_amendments` back to 0, 11 `rods_day_purged` audit rows).

Observed verbatim in `PostgrestError.code`: `P0010`, `P0011`, `P0012`, `P0013`,
`P0014`, `P0015`, `P0020`, `P0021`, `P0022`, `P0023`, `P0030`, `P0031`, plus
`42501` for `purge_rods_day`. The deferred continuity trigger arrived as
`P0001` on that run and now carries `P0042` (see rule 7).

Not observed, and unreachable from a driver client: `P0002`, `P0040`, `P0041`,
`P0044`. The `rods_days` UPDATE and DELETE policies both require
`locked = false`, and every `rods_events` policy gates on the parent day's
`locked = false`, so RLS filters a certified row out before the lock trigger
runs — the write returns **0 rows and no error**. Any client logic that waits
for one of those codes will wait forever; check the affected row count instead.

### 5b. The `record_source` bypass, demonstrated and closed, 2026-08-01

Same harness as §5a (demo driver `ee993ec0`, scratch rows purged immediately).

**Before the fix**, `certify_rods_day` ran its segment and header block only
when `record_source <> 'eld_document'`, and nothing stopped a driver from
changing that column on their own unlocked draft:

1. keyed draft with a 60-minute hole at minute 360 → `certify_rods_day` → `P0021`
2. `UPDATE rods_days SET record_source = 'eld_document'` over PostgREST, as the
   driver → **accepted**, 1 row
3. `certify_rods_day` again → **succeeded**: `status = certified`,
   `locked = true`, gap intact, every header field null, no source document

That is a bypass of the entire content guard, not an edge case. Three layers
now close it (`20260802000000_close_record_source_bypass.sql`):

- **A** — `certify_rods_day` refuses anything that is not `keyed` (`P0019`), and
  the content block is unconditional. `eld_document` rows are filed
  already-certified by `create_eld_document_day` and never pass through it.
- **B** — `record_source` is immutable after insert (`P0045`), checked in
  `enforce_rods_day_lock` before the lock test, with **no** `rods.privileged`
  exemption.
- **C** — an `eld_document` row must reference its source document (`P0046`).

**After the fix**, observed verbatim on the same harness: the gap still returns
`P0021`, the flip returns `P0045`, an `eld_document` insert with no path returns
`P0046`, certifying an `eld_document` draft returns `P0019`, and a complete
keyed day still certifies normally (regression check).

Reachable but still unobserved: `P0016`, `P0017`, `P0018` — the amendment
change-record guards, and the only untested part of `certify_rods_day`. The
provocation each one needs is recorded in `UNOBSERVED_REACHABLE` in
`src/lib/eld/offline/__tests__/parityFixtures.test.ts`.

### 5c. The placeholder legal name, provoked over the wire, 2026-08-01

§395.8 requires the driver's name on the record. The header guard checked that
`certification_legal_name` was non-empty, not that it was a name — and the
codebase's own `|| 'Driver'` fallback produces exactly the value that clears
that check. A log certified in the name "Driver" is a false entry that passes
every guard, the same shape as the `record_source` bypass.

`certify_rods_day` now refuses a known placeholder with its own code, `P0032`,
with no `rods.privileged` exemption. Provoked from a real `@supabase/supabase-js`
client holding a driver session, against a seeded keyed draft
(`9f0c1a22…f1`), **before** the parity fixture was written:

| Provocation | `PostgrestError.code` |
| --- | --- |
| `certification_legal_name = 'Driver'` | `P0032` |
| `certification_legal_name = 'Unknown'` | `P0032` |
| `certification_legal_name = '   '` | `P0015` |
| `certification_legal_name = 'Marcus Mueller'` | none — `status = certified` |

Verbatim envelope for the first case:

```json
{
  "code": "P0032",
  "details": null,
  "hint": null,
  "message": "rods_placeholder_legal_name: \"Driver\" is not a driver name. A record of duty status must be certified in the driver's own legal name."
}
```

The whitespace case returning `P0015` is the evidence that the empty-name guard
and the placeholder guard are distinct conditions in the correct order; neither
shadows the other. Fixture 20 in
`src/lib/eld/offline/__tests__/parityFixtures.test.ts` asserts this observation,
and `P0032` is registered in `REJECTION_SQLSTATES` so the modal renders it as a
rejection rather than an unknown 500.

Scratch rows purged afterwards through the `purge-rods-day` edge function
(`purged: true`; `rods_days` and `rods_events` for that operator back to 0). The
two `storage_failed` entries on that purge are the seeded row's declared
`pdf_path` and signature path, which the probe never uploaded — no bytes were
stranded.

## 6. `duty_status` is an integer 1–4 everywhere

`rods_events.duty_status` is a physical 24-hour clock, not a labelled string.
The four values are fixed and must be used consistently in the client, the
server, and any test that constructs events:

| Integer | Meaning | US FMCSA status |
| --- | --- | --- |
| 1 | Off-duty | Off Duty |
| 2 | Sleeper berth | Sleeper Berth |
| 3 | Driving | Driving |
| 4 | On-duty, not driving | On Duty |

Do not store the enum as strings (`'off_duty'`, `'OFF'`, `'D'`) in `rods_events`.
Do not compare with string literals in SQL (`duty_status = 'off_duty'`). A
string comparison in `certify_rods_day` caused a live `22P02` error that blocked
all driver certifications after migration `20260802015334` — every historical
row was integer, but the guard was written against text literals. The guard was
repaired to integer comparisons; the convention is now that the database owns
the authoritative integer representation and every client helper must emit it.

Fixtures in `src/lib/eld/offline/__tests__/parityFixtures.test.ts` and the live
RPC test in `src/test/rods-live-certification.test.ts` both build events with
integer `duty_status` values. If a future refactor changes the representation,
both files must change together; the live test is the proof.

## 7. One code, one condition, one function

Every named condition raised from a `SECURITY DEFINER` function or a trigger
carries an explicit `USING ERRCODE`. `P0001` is the bare-`RAISE` default and is
reserved for genuinely unhandled exceptions — a named condition arriving as
`P0001` is indistinguishable from a crash.

A code identifies one condition in **one** function. Two functions never share
a code even when the condition reads the same, because the client routes on the
code alone and must be able to tell which operation refused. Grouping by
condition is done with `CONDITION_GROUPS` in
`src/lib/eld/offline/queue/types.ts`, never by overloading the wire value.

| Function | Condition | Code |
| --- | --- | --- |
| `certify_rods_day` | certification token required | `P0010` |
| `certify_rods_day` | log not found | `P0011` |
| `certify_rods_day` | not the log owner | `P0012` |
| `certify_rods_day` | token belongs to another log | `P0013` |
| `certify_rods_day` | log is not a draft | `P0014` |
| `certify_rods_day` | typed legal name required | `P0015` |
| `certify_rods_day` | written reason required to certify a correction | `P0016` |
| `certify_rods_day` | amendment carries no change record | `P0017` |
| `certify_rods_day` | change record supplied for a log that supersedes nothing | `P0018` |
| `certify_rods_day` | log is not keyed (uploaded ELD document) | `P0019` |
| `certify_rods_day` | incomplete duty-status entries | `P0020` |
| `certify_rods_day` | gap in the 24-hour period | `P0021` |
| `certify_rods_day` | overlapping duty-status entries | `P0022` |
| `certify_rods_day` | unaccounted minutes in the 24-hour period | `P0023` |
| `certify_rods_day` | missing required header fields | `P0030` |
| `certify_rods_day` | a certified log already exists for the date | `P0031` |
| `certify_rods_day` | legal name is a placeholder, not a name | `P0032` |
| `enforce_rods_day_lock` | certified log deleted | `P0002` |
| `enforce_rods_day_lock` | certified log modified | `P0040` |
| `enforce_rods_day_lock` | locked log deleted | `P0041` |
| `enforce_rods_day_lock` | correction draft deleted outside `discard_rods_amendment()` | `P0043` |
| `enforce_rods_day_lock` | `record_source` changed after the log was filed | `P0045` |
| `enforce_rods_day_source_document` | `eld_document` row with no source document | `P0046` |
| `enforce_rods_certified_continuity` | certified log superseded with no certified replacement in the same transaction | `P0042` |
| `enforce_rods_event_lock` | duty-status entries of a certified log changed | `P0044` |
| `get_or_create_short_link` | invalid share token | `P0050` |
| `get_or_create_short_link` | authentication required | `P0051` |
| `enforce_eld_event_driver_update` | locked malfunction record changed by a driver | `P0060` |
| `enforce_eld_event_driver_update` | notice upload timestamp changed once set | `P0061` |
| `enforce_eld_suppression_rules` | written reason required | `P0062` |
| `enforce_eld_suppression_rules` | expiry date required | `P0063` |
| `enforce_eld_suppression_rules` | pause exceeds 7 days | `P0064` |
| `enforce_eld_suppression_rules` | expiry in the past | `P0065` |
| `discard_rods_amendment` | correction draft not found | `P0070` |
| `discard_rods_amendment` | not the owner | `P0071` |
| `discard_rods_amendment` | not an uncertified correction draft | `P0072` |
| `enforce_rods_correction_request_update` | request is append-only (identity/issue/provenance edited) | `P0100` |
| `enforce_rods_correction_request_update` | resolution pointer set by hand | `P0101` |
| `enforce_rods_correction_request_update` | only the driver may answer | `P0102` |
| `enforce_rods_correction_request_update` | already resolved | `P0103` |
| `enforce_rods_correction_request_update` | target status is neither actioned nor declined | `P0104` |
| `enforce_rods_correction_request_update` | decline with no written response | `P0105` |
| `enforce_rods_correction_request_update` | driver response revised after it was recorded | `P0106` |
| `enforce_rods_correction_request_update` | `resolved_at` changed after it was set | `P0107` |
| `create_eld_document_day` | certification token required | `P0080` |
| `create_eld_document_day` | not the driver filing their own log | `P0081` |
| `create_eld_document_day` | uploaded document missing | `P0082` |
| `create_eld_document_day` | token belongs to another log | `P0083` |
| `create_eld_document_day` | a certified log already exists for the date | `P0084` |
| `purge_rods_day` | caller is not the service role | `42501` |

`P0060`–`P0065` are validation-on-write, not sync-queue outcomes, so they are
deliberately absent from `REJECTION_SQLSTATES`.

### 7a. Correction requests own the `P0100` block

`enforce_rods_correction_request_update` originally raised `P0072`–`P0075`,
which collided with `discard_rods_amendment`'s `P0070`–`P0072`. `classifyError`
routes on the code alone, so a revised driver response and a failed discard
were indistinguishable on the wire. The trigger was moved to its own free block
(`P0100`+) and `P0072` belongs to `discard_rods_amendment` again.

Two conditions in that block are new, and both close the same hole: a
correction request is append-only, but `driver_response` and `resolved_at` were
not in the immutability list. A driver could re-write the text of a refusal
after the fact — no status transition occurs, so the status machine never
fired. Both are now write-once: `NULL → text` is the decline, `text → other
text` is `P0106`; `resolved_at` is stamped once and is `P0107` thereafter.

While in the function, `resolved_by_day_id → NULL` was narrowed from the broad
`rods.privileged` flag to `rods.purge` alone. Setting the pointer to a real log
still requires `rods.privileged` (that is `certify_rods_day` closing the
request); nulling it belongs only to a purge deleting the log it pointed at.
The purge exemption on `rods_day_id` was already narrow — it tolerates the
`→ NULL` transition and nothing else, and `rods.purge` is set transaction-
locally inside a service-role-gated definer.

Observed verbatim over PostgREST on 2026-08-02 from a real driver session
(demo operator `ee993ec0`, JWT via `create-preview-session` →
`redeem-preview-session` → `/auth/v1/verify`), PATCHing request `09ee2d9f`
(declined, response and `resolved_at` already set):

```json
{
  "code": "P0106",
  "details": null,
  "hint": null,
  "message": "A correction request response is recorded once and cannot be revised."
}
```

```json
{
  "code": "P0107",
  "details": null,
  "hint": null,
  "message": "The time a correction request was resolved cannot be changed."
}
```

The legal path was provoked in the same run against a scratch request
(`b62132cf`): `open → declined` carrying the response as its first write
returned HTTP 200 with a server-stamped `resolved_at`, and a second PATCH of
`driver_response` on that row returned `P0106`. Write-once is scoped to
revision, not to the decline. Both observations are pinned in
`src/lib/eld/offline/__tests__/correctionRequestRejections.test.ts`, and
`P0100`–`P0107` are registered in `REJECTION_SQLSTATES` (`append_only_record`
condition group — terminal, never retried). The scratch log and request were
purged afterwards.

## 8. On `rods_days` and `rods_events`, 0 rows is the refusal

For these two tables the driver-visible signal that a locked row refused a
write is **"0 rows affected", not an error code**. Every client write therefore
requests its rows back (`.select('id')`) and routes an empty result through
`assertRowsAffected` in `src/lib/eld/rodsWrite.ts`, which throws
`RowNotWritableError`. A delete is the one ambiguous case — removing nothing is
legitimate when there was nothing there — so the caller re-counts the remaining
rows and passes the count to `assertDeleteApplied`.

In the sync queue this classifies as `row_not_writable`: terminal, never
retried, bytes retained, and alerted to Management as `log_not_writable`.

## 9. Verify through the app's entry point, not the function

A function proven by a direct RPC is not a proven code path. Four defects in
this audit share one signature — correct or near-correct code that had simply
never been reached:

- `get_or_create_short_link` — never once succeeded; every binder email/SMS
  share had been silently falling back to a long URL.
- `discard_rods_amendment` — raised the message telling the caller to call
  itself; discarding an amendment could never work.
- `certify_rods_day` — created, guarded, extended twice, never executed until
  it was deliberately run.
- `record_rods_amendments` — worked correctly, called by nothing.

Every one of them would have passed a direct round-trip proof. "The function is
correct" and "the feature works" are different claims and need different
evidence. Where a report claims behaviour the app performs, drive the app's
real caller — the same distinction that made the driver-session 0-row proof in
rule 8 worth insisting on rather than accepting a privileged-path provocation.

## 10. RODS amendment records: carrier policy, not 49 CFR 395.30

`certify_rods_day` refuses to certify a correction without a written reason
(`P0016`) and a field-level change record (`P0017`), and files those rows in
the same transaction as the certification.

That requirement is **SUPERTRANSPORT carrier policy**. It has no federal cite,
and earlier comments in `amendmentDiff.ts`, `RodsDayEditor.tsx` and
`CertifyDayModal.tsx` were wrong to attach one:

- **49 CFR 395.30(c)(2)** does require an ELD edit to keep the original and
  carry an annotation. It is the ELD analogue of this feature and deliberately
  **not** its authority: these are *manual* records of duty status under 395.8,
  kept on the paper-log allowance at 395.34. Citing an ELD rule as the basis of
  a non-ELD feature contradicts the premise the whole build rests on.
- **395.8(e)(1)** prohibits a false report in connection with a duty status. It
  says nothing about correcting a record, annotating a correction, or
  preserving what changed — a driver who fixes a wrong truck number and leaves
  no trail has not made a false report.
- **395.8(f)(7)** is the on-point provision: the driver's signature certifies
  the entries are true and correct. That is why an amendment must be re-signed.
  It still does not require a change record.

State the requirement as carrier policy. Do not re-attach a federal cite.

## 11. Management deep links: `view` is canonical, `tab` is a shim

Every link into `/management` selects its section with `?view=`. `ManagementPortal`
reads `view` first and falls back to `tab` only because links written before the
rename are already sitting in sent emails and in `notifications.action_url` rows,
where nothing can rewrite them. The fallback never writes `tab` back to the URL,
so a session started from a legacy link converts to the canonical form on the
first navigation.

Nothing new may emit `tab`. New notification rows, edge-function CTAs and
in-app navigation all write `?view=<section>` (plus `op=` / `app=` / `event=`
for the record to open). The shim is removable once no unexpired notification
row or in-flight email carries `tab=`; there is no separate flag to flip.
