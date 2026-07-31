## 1. Purge verification — confirmed, rows and all

For operator `ee993ec0`: `rods_days` 0, `rods_events` 0, `rods_amendments` 0, `eld_malfunction_events` 0, and 9 `rods_day_purged` audit rows carrying the run's reason string. 0/0/0/0 and 9. The rows are gone, so `rods-logs` at 0 is a complete purge, not dangling paths on surviving certified rows.

## 2. Authoritative purge path

- **`purge_rods_day` (SQL)** — deletes rows, returns `storage_paths`, removes nothing from storage (`storage.protect_delete()` blocks direct `storage.objects` deletes).
- **`purge-rods-day` (edge function)** — calls the RPC, then deletes exactly the three row-owned paths through the Storage API and records the outcome. **This is the authoritative entry point.**
- **Stage 4's demo reset calls neither.** `reset-demo-driver`'s `OPERATOR_SCOPED_TABLES` has no RODS tables, and a plain `.delete()` would be refused by the BEFORE DELETE lock trigger anyway. Demo RODS data survives every reset today.
- **The harness `finally` calls nothing** — `/tmp/browser/rods-certify/` is wiped with the sandbox between turns, so the helper is rebuilt with the Playwright pass.

### a. Deliberateness as a required parameter — added first, dropped later

`set_config(..., true)` is transaction-local and PostgREST gives each RPC its own transaction, so a two-call guc opt-in is gone before the purge runs; `is_local = false` would leak across pooled connections. So the gate is a parameter:

```sql
purge_rods_day(_day_id uuid, _reason text, _storage_owner text)  -- no default
```

Raise `42501` when `_storage_owner` is null or blank: *"purge_rods_day requires a declared storage owner; invoke it through the purge-rods-day edge function, which removes the row's objects."* Transaction-safe by construction, nothing to leak, no `begin_rods_purge`.

**Two migrations, not one.** Edge functions deploy separately from migrations, and `purge_rods_day` is the only way to remove a certified row — dropping the two-arg form in the same migration leaves a window where nothing can purge, including a failed harness run.

- **Migration 1 (this change):** create the three-arg form. Keep the two-arg form as an overload but replace its body with an unconditional `42501` raise carrying the same message. The deliberateness gap closes immediately; nothing becomes unpurgeable, because the edge function is updated to the three-arg call in the same change and the old signature still resolves (loudly) until it's gone.
- **Migration 2 (follow-up):** `DROP FUNCTION public.purge_rods_day(uuid, text)` once the edge function is deployed and confirmed calling the three-arg form.

`docs/deferred-removals.md` gets an entry for the two-arg overload — same shape as the `classifyError` string fallback: what it is, why it still exists (deploy-ordering window), and the removal trigger (*edge function confirmed on the three-arg signature*), plus the one-line drop.

### b. Storage disposition, stamped and transitioned

The purge writes `storage_disposition: 'pending_caller'` next to `storage_paths`, or `not_applicable` immediately when the row owned no paths. `record_rods_purge_storage_result` moves it to `completed`, or `completed_with_failures` when the failed list is non-empty. A caller that never reports back leaves `pending_caller` in the trail, so an incomplete purge never reads as a complete one.

### c. Chain-safe ordering, in both callers

`supersedes_day_id IS NOT NULL` is one-level thinking: with original ← A1 ← A2 it is true for both A1 and A2, and the wrong order hits `23503`. Replace it with a fixpoint loop that purges only rows nothing references:

```sql
WHERE operator_id = _op
  AND id NOT IN (SELECT supersedes_day_id FROM rods_days
                 WHERE supersedes_day_id IS NOT NULL AND operator_id = _op)
```

Purge that batch, re-query, repeat until no rows remain; bail loudly if an iteration returns rows but purges none (a cycle). Applied in **both** `reset-demo-driver` and the harness `finally` — the harness's "amendment children before parent" carries the same one-level assumption and is replaced by the same loop.

### d. Demo reset routes through the edge function

`reset-demo-driver` gains a RODS step behind the existing `is_demo !== true` refusal: resolve the operator's day ids with the loop above and invoke `purge-rods-day` per batch with the reason `Demo driver reset — synthetic records of duty status, scenario <scenario>.` `eld_malfunction_events` is added to `OPERATOR_SCOPED_TABLES`.

## 3. A reader for `pending_caller`

`sweep-rods-orphans` gains a second, cheaper finding alongside the reachability scan: `audit_log` rows with `action = 'rods_day_purged'`, `metadata->>'storage_disposition' = 'pending_caller'`, and `created_at < now() - interval '1 hour'` (threshold overridable in the body), returned as `incompletePurges` — audit id, day id, log date, operator, reason, age, and the `storage_paths` array. These are *known*-orphaned paths named in the trail, not ones the scan has to infer, so the response also flags which are still present in the bucket. With `apply: true` they're deleted by the same explicit-path rule and the audit row is stamped `completed_late`.

Where it surfaces: the function is invocable-only today, so add a **Duty-status storage** card in the ELD admin area (`src/components/management/eld/`, beside `ELDMalfunctionsPanel`), owner/management only. It runs the sweep dry and shows `incompletePurges` as a warning row — *"N purges did not confirm object removal"* with day date, reason, and paths — above the inferred-orphan count, with a **Clean up** action for the apply run. An edge function that crashed between the RPC and the record call becomes visible there instead of sitting unnoticed.

## Technical notes

- Migration 1 is service-role only, `SET search_path = public`, guards written positively (`coalesce(btrim(_storage_owner), '') <> ''`) for the fail-open reason in `docs/database-security-conventions.md`; that doc gets a row for the new `42501` case.
- `docs/eld-offline-certification.md` records the edge function as the only authoritative purge path, the chain-safe ordering rule, and the disposition states.
