# Cause 4 on the diagnostics write path: a caller-evaluated default the caller cannot execute

## Was the Aug 20 revoke deliberate?

Yes — and it is documented as such. Migration `20260820012017` line 405-408 carries the comment:

```text
-- Internal helper. Called only from inside other SECURITY DEFINER bodies (which
-- run as the owner) and by no RLS policy, so no client role needs EXECUTE.
REVOKE ALL ON FUNCTION public.current_profile_id() FROM PUBLIC, anon, authenticated;
```

It sits in a block of ~15 deliberate revokes on trigger and helper functions, immediately
followed by explicit `GRANT EXECUTE ... TO authenticated` on the RPCs that clients *are*
meant to call. This is intentional hardening with a stated rationale, and the rationale was
correct on Aug 20 — it stopped being correct on Aug 23 when `parser_diagnostics` gained a
default (and an RLS policy) that call it from the caller's context.

## Recommendation: the RPC, not the re-grant

Move the diagnostics write behind a `SECURITY DEFINER` RPC. Reasons:

1. Re-granting `EXECUTE` to `authenticated` hands every signed-in user, including operators,
   a probe that maps auth uid to profile id. Small, but it is a deliberate revoke and undoing
   it to fix one insert is the wrong trade.
2. The re-grant does not even fully fix the write. Verified against the live catalog: the
   insert policy is
   `with_check: (created_by = current_profile_id()) AND (has_role(...))`.
   RLS policy expressions also evaluate as the caller, so `current_profile_id()` is called
   **twice** in the caller's context here — once by the default, once by the policy. And the
   policy compares `created_by` to it, which means the client would have to either send an
   actor id (banned by the standing rule) or rely on the default it cannot evaluate.
3. Every other actor-stamped write in the project already goes through a definer RPC. This
   table is the lone exception, which is exactly why it is the lone failure.

## The fix

**Migration (schema only):**

- `CREATE FUNCTION public.log_parser_diagnostics(p_rows jsonb) RETURNS integer`,
  `SECURITY DEFINER`, `SET search_path = public`. It:
  - authorizes the caller: dispatcher / management / owner / onboarding_staff, else raise;
  - inserts one row per element of `p_rows`, reading only the known payload keys
    (`kind, field, failure, occurrences, stop_number, headings, ordering, label,
    reference_class, load_id, load_number, document_id, document_label, parser_contract`)
    so a client can never smuggle `created_by` / `resolved_by` in;
  - stamps `created_by = current_profile_id()` inside the body (owner context, so the revoke
    stands);
  - returns the number of rows actually inserted, which is what the panel reports.
  - `REVOKE ALL FROM PUBLIC, anon` / `GRANT EXECUTE TO authenticated`.
- Drop the caller-evaluated default: `ALTER TABLE public.parser_diagnostics ALTER COLUMN
  created_by DROP DEFAULT`. `created_by` stays nullable — a diagnostic must never fail to log
  because an actor could not be resolved.
- Replace the insert policy with one that does not call `current_profile_id()`; the table's
  `INSERT` grant to `authenticated` is revoked since the RPC is the only writer.
  `SELECT`/`UPDATE` for staff are unchanged, so the diagnostics page and
  `resolve_parser_diagnostic` keep working.

**Client:**

- `src/lib/parserDiagnostics.ts` — `logParserDiagnostics` calls
  `supabase.rpc('log_parser_diagnostics', { p_rows: payload })` instead of
  `.from('parser_diagnostics').insert(...)`. `written` becomes the RPC's returned count.
  The `getDbErrorParts` error reporting added last turn is unchanged and still surfaces code,
  message, details and hint if this ever fails again.
- `normalizeDiagnosticRows` keeps widening every row to `FULL_ROW_KEYS` (one key set is still
  required for a clean jsonb array), and still sends no actor id.

## The exposure audit

Queried live: every `public` column default, every function named in an RLS policy, and
`has_function_privilege` for `anon` / `authenticated`.

**Function defaults on public columns:** exactly one project function is used as a default —
`parser_diagnostics.created_by → current_profile_id()`. The only other non-trivial defaults
are `gen_random_uuid()`, `now()` variants, `encode(extensions.gen_random_bytes(24),'hex')` on
`onboard_assignment_sheets.access_token` and `ica_review_links.token`, and simple expressions.
The two token tables are written only from edge functions (`send-osas-to-operator`,
`send-ica-review-link`) under `service_role`, so no caller-context evaluation happens; they are
not exposed.

**Functions used in RLS policies that the calling role cannot execute:**

| Function | authenticated EXECUTE | anon EXECUTE | Verdict |
| --- | --- | --- | --- |
| `current_profile_id` | no | no | **The bug** — used in the `parser_diagnostics` insert policy |
| `has_role`, `is_staff`, `is_thread_participant`, `is_own_rods_operator`, `is_truck_owner_for_operator`, `operator_awaiting_return`, `operator_return_requested` | yes | yes | fine |

So the exposure is a set of exactly one, on both axes, and both instances are the same table.
No other fix is needed anywhere else.

**Direct client inserts vs RPC:** many tables are still written by direct client insert; that
is fine on its own. The failure mode is narrower than "direct insert" — it is *direct insert
into a table whose default or policy calls a function the caller cannot execute*, and after
this change that set is empty. The audit query is preserved as a test rather than a one-off
(below).

## The test that catches this class

Extend the live-catalog approach already used by `grant-parity-live.test.ts`: a new assertion
that, for every `public` column default and every function named in a `public` RLS policy,
`has_function_privilege` is true for each role the table's own grants allow to write. Reads the
catalog at call time, so it cannot go stale the way checked-in migration text does.

## Docs

`docs/tms-build-status.md` gains cause 4 on this write path (write with no reader → RLS policy
mismatch → mixed row shapes → caller cannot execute the column default's function) and the
standing rule:

> A column default runs as the *caller*, not the table owner, and so does an RLS policy
> expression. A function used in either must be executable by every role that inserts — or the
> write must go through a `SECURITY DEFINER` RPC. A default the caller cannot evaluate makes a
> table that can only fail, and it is invisible to both a table-grant check and an RLS check.
