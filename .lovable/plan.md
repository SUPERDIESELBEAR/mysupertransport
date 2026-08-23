# Fix actor stamping across tonight's writes

## First: the answers you asked for

### Was the failure transactional? No.

ST26034 has a **half-filed baseline right now**:

- `load_references`: **5 rows written**
- `load_reference_citations`: **2 rows written**
- `load_change_history`: **0 rows** — the provenance entry never landed

`fileReferenceBaseline` does two independent round trips: `saveLoadReferences`
(plain PostgREST upsert + citation insert) and then `record_load_reference_baseline`
(the RPC). Only the RPC ran in a transaction, so its rollback rolled back nothing but
itself. Re-running after the fix is safe — the reference upsert is keyed on
`(load_id, reference_class, value_key)` and the citations are deleted and rewritten
for the references being saved — but the load is currently in a state where the rows
exist with no provenance record.

### Which writes resolve the actor correctly

| Write | Actor value | Verdict |
| --- | --- | --- |
| `record_load_reference_baseline` → `load_change_history.changed_by` | `auth.uid()` | **Broken** — FK to `profiles(id)`. This is your error. |
| `set_load_verbatim_verification` → `loads.updated_by` | `auth.uid()` | **Broken** — FK to `profiles(id)`. Same 23503, not yet hit because no load has a stored verification yet (confirmed: zero rows with `verbatim_verification`). |
| `set_load_verbatim_verification` → `checked_by` / `repaired_by` in the JSONB | `auth.uid()` | **Wrong id, no FK to catch it.** Stored as an auth uid, so the repair attribution the card renders cannot be resolved against `profiles`. |
| `saveLoadReferences` → `load_references.created_by` | never set | **Unattributed** — column has a `profiles(id)` FK, no trigger, client sends nothing, so every row is null. |
| Citation write (`load_reference_citations`) | no actor column | Fine — nothing to stamp. |
| `parser_diagnostics.created_by` / `resolved_by` | `auth.uid()` from the client | **Wrong id.** No FK, so it inserted happily; both existing rows hold ids absent from `profiles`. |
| `record_duplicate_broker_reference` | `current_profile_id()` | **Correct.** |
| `log_load_status_change` and the other existing writers | `current_profile_id()` | Correct — unchanged. |

## The fix — server-side, no actor id from the client

### 1. `record_load_reference_baseline`

`changed_by` becomes `public.current_profile_id()`.

### 2. `set_load_verbatim_verification`

`updated_by` becomes `current_profile_id()`; `checked_by` and the `repaired_by` stamp
on `manual_repair` records become the profile id too, so the verification card's
attribution resolves against `profiles` like every other actor display.

### 3. `saveLoadReferences` and the baseline become one server-side call

Rather than fixing the RPC and leaving the two-phase write in place, the reference
write moves behind a new `public.file_load_references(p_load_id, p_refs jsonb,
p_source, p_document_id, p_document_label, p_summary)`:

- Same dispatcher/management/owner authorization as the current RPC.
- Upserts `load_references` on `(load_id, reference_class, value_key)`, stamping
  `created_by = current_profile_id()`.
- Resolves stop ids by sequence and rewrites the citations for those references.
- Writes the `load_change_history` provenance entry when a summary is passed.
- All in one transaction, so a history failure can no longer leave rows behind — the
  exact shape of tonight's half-filed state.

`saveLoadReferences` and `fileReferenceBaseline` in `src/lib/loadReferences.ts` become
thin callers of it. Behaviour the callers depend on is preserved: an empty array is a
no-op, never a wipe.

### 4. `parser_diagnostics`

- `created_by` and `resolved_by` get defaults of `current_profile_id()` and FKs to
  `profiles(id)`, so the type is enforced rather than trusted.
- **Both columns stay nullable, and neither gets a NOT NULL constraint.** A Postgres FK
  never rejects a null, so when `current_profile_id()` returns null — a service-role
  insert, or an authenticated user with no profile row — the default evaluates to null
  and the row is written unattributed. A diagnostic never fails to log because the
  actor could not be resolved. The diagnostics page renders a missing actor as
  "unattributed" rather than a blank.
- The two existing rows carry auth uids; they are remapped to the matching profile ids
  in the same migration (falling back to null if no profile matches) so the FK can be
  added.
- `src/lib/parserDiagnostics.ts` stops calling `supabase.auth.getUser()` and stops
  sending `created_by` / `resolved_by` at all. `resolveParserDiagnostic` sets only
  `resolved_at` and lets the column default stamp the actor.

### 5. Clear ST26034 — delete, do not backfill

The 5 `load_references` rows and their 2 citations are deleted. No history entry is
synthesized, so the provenance record comes from the action itself when you re-run it.
After the delete I confirm and report: zero rows in `load_references`, zero in
`load_reference_citations`, and no `references.baseline` entry in
`load_change_history` for the load.


## The test that catches this class

`src/test/actor-stamp-fk.test.ts` — structural, like the wiring test, not a fixed list:

1. Read `pg_constraint` (via the checked-in migration SQL, the same way the existing
   grant-parity and definer tests read it) for every `public` column with a FK to
   `profiles(id)` — that set is discovered, not hardcoded, so a new actor column is
   covered the day it is added.
2. For each such column, find every writer: SQL function bodies that `INSERT`/`UPDATE`
   it, and client code that sends the column name in a `.insert(` / `.update(` payload.
3. Fail any writer that resolves the actor as `auth.uid()`, `auth.user().id`,
   `getUser()`, or `getSession()` rather than `current_profile_id()` / a column
   default.
4. Second assertion, the one that reaches the FK: a save-path test that calls
   `fileReferenceBaseline` against a Postgres-shaped fake enforcing the real
   `profiles(id)` FKs, seeded with a profile whose `id` differs from its `user_id`.
   Passing an auth uid raises 23503 there, so the current code fails the test before
   the fix and passes after it. This is the piece the existing suite lacks — its
   mocks accept any uuid.

## Technical notes

- One migration: the two function rewrites, the new `file_load_references` function
  with `EXECUTE` granted to `authenticated`, the `parser_diagnostics` column defaults
  plus backfill plus FKs, and the ST26034 history repair.
- No schema change to `load_references`, `load_reference_citations`, or
  `load_change_history`.
- `docs/tms-build-status.md` gains the actor-resolution rule as a standing item next to
  the both-paths rule: an actor is resolved server-side by `current_profile_id()`, and
  a client never sends an actor id.
