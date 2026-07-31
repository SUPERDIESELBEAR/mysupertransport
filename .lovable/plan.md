## Confirmed before planning

**`rods.privileged` is already transaction-scoped.** Every setter passes `is_local = true`: `certify_rods_day`, `create_eld_document_day`, `replace_rods_document`. Readers are `enforce_rods_day_lock` and `enforce_rods_event_lock`. No live pooling hole today. `rods.discard` and `rods.purge` will be set the same way, and the scope test pins the property so a later `set_config(..., false)` cannot slip in unnoticed.

**`audit_log` exists and covers `purge_rods_day`'s needs:** `id`, `actor_id uuid`, `actor_name text`, `action text NOT NULL`, `entity_type text NOT NULL`, `entity_id uuid`, `entity_label text`, `metadata jsonb`, `created_at timestamptz NOT NULL DEFAULT now()`. No table creation needed.

---

## Step 1 — §8 verification 3b, in a browser

Signed-out headless Chromium, four loads of `/s/:code` — valid, revoked, expired, unknown code — reported as **rendered page state** with screenshots, not RPC returns. Then `share_token_access_log` rows for the window with their `outcome` and `hash_version`, then cleanup with post-cleanup counts. Two-hop note stands: `/s/:code` resolves at the link layer and refuses at `resolve_share_token`, so a revoked token should show "Document Not Found", not "Link not found".

## Step 2 — DELETE guard re-key, discard deadlock, purge escape

One migration to `enforce_rods_day_lock`:

```sql
IF TG_OP = 'DELETE' THEN
  -- Sanctioned service-role path. Safety lives in purge_rods_day's caller
  -- check and its audit write, not here. Must precede every branch: a
  -- certified amendment has supersedes_day_id set and would otherwise be
  -- sent to discard_rods_amendment(), which only handles drafts.
  IF current_setting('rods.purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  IF OLD.supersedes_day_id IS NOT NULL
     AND current_setting('rods.discard', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Use discard_rods_amendment() to remove a correction draft.';
  END IF;
  IF OLD.certified_at IS NOT NULL OR OLD.status = 'certified' THEN
    RAISE EXCEPTION '...' USING ERRCODE = 'P0002';   -- certified federal record
  END IF;
  IF OLD.locked THEN
    -- Locked but not certified. After the re-key this is near-unreachable;
    -- if it fires, a row is locked without being certified — a state that
    -- should not exist. Distinct code so it is visible on its own.
    RAISE EXCEPTION '...' USING ERRCODE = 'P0041';
  END IF;
  RETURN OLD;
END IF;
```

`rods.purge` short-circuits all three. `rods.discard` escapes only the supersedes branch, so a discard still cannot remove a certified row.

`discard_rods_amendment` gains `PERFORM set_config('rods.discard','on', true)` after its own guards — fixing the deadlock where it raised the message telling the caller to call itself.

Migration comment records that `discard_rods_amendment` runs *through* this trigger rather than bypassing it, and that all three gucs are transaction-local by contract.

**Guc scope test:** set each guc inside a transaction, then after both a COMMIT and a ROLLBACK confirm `current_setting('rods.purge', true)` no longer returns `'on'` on the same connection. Reported per guc.

## Step 3 — `purge_rods_day`

`public.purge_rods_day(_day_id uuid, _reason text)`, `SECURITY DEFINER`, `SET search_path = public, extensions`:

- Refuses unless `current_user = 'service_role'`; refuses a blank or too-short `_reason`.
- Reads the row `FOR UPDATE`, writes the `audit_log` row **before** deleting — `action = 'rods_day_purged'`, `entity_type = 'rods_day'`, `entity_id = _day_id`, with driver, log date, status, `certified_at`, `record_source` and the verbatim reason in `metadata`.
- `PERFORM set_config('rods.purge','on', true)` — transaction-local.
- Deletes `rods_events`, then `rods_amendments` rows referencing the day, then the day.
- Comment cites 49 CFR 395.8(k)(1) six-month retention.

Stage 4's demo reset is repointed at it. `docs/database-security-conventions.md` records unlock-then-delete as a **known gap**, scratch data only — not a procedure.

## Step 4 — amendment lifecycle, executed end to end

Committed, on the demo operator, cleaned up via `purge_rods_day` (which also exercises purge against a certified amendment). Each step reported as worked-first-time or what needed fixing.

1. Certify Day A — already proven, re-run as the base.
2. Clone as an amendment draft. Confirm the original stays `certified` and the partial unique index on `(operator_id, log_date)` tolerates both rows.
3. `discard_rods_amendment` on that draft — confirm it now succeeds.
4. Clone again and certify the amendment. In one transaction confirm: amendment lands `certified`; original flips to `superseded`; `rods_amendments` gains one row per changed field; the deferred `rods_days_certified_continuity` trigger passes at COMMIT (it is `AFTER UPDATE ... DEFERRABLE INITIALLY DEFERRED`, so this only proves out on a real commit).
5. Purge both rows, confirm the audit rows landed, confirm zero residue.

## Step 5 — distinct SQLSTATEs in class `P0`

`USING ERRCODE` on every raise in `certify_rods_day` and `enforce_rods_day_lock`, messages unchanged:

| Condition | Code |
| --- | --- |
| tiling gap / overlap / short day | `P0010` |
| incomplete segment | `P0011` |
| missing header fields | `P0012` |
| token required / day mismatch | `P0020` / `P0021` |
| duplicate certified date | `P0022` |
| not draft / not owner | `P0030` / `P0031` |
| locked record **changed** (UPDATE branch) | `P0040` |
| locked record **deleted** (DELETE branch, not certified) | `P0041` |
| certified record deleted | `P0002` |

`P0001` stays unused — it is `raise_exception`, the default being disambiguated from.

**Round-trip proof first:** every code in the table, `P0041` included, provoked over PostgREST from a real client and the received `error.code` recorded, before any fixture is written. If one does not arrive verbatim the scheme stops there and I report it. `P0041` needs a deliberately constructed row — locked, not certified — to provoke.

`classifyError` then routes on `err.code`. Existing string markers stay as a fallback for stale bundles, each hit incrementing `eld_sync_classify_string_fallback` tagged with the marker. Fixtures assert on **codes only**, never message text, plus one test proving a `P0010` with an unrecognized message still classifies correctly. New `docs/deferred-removals.md` carries the fallback with its trigger — remove once telemetry shows zero hits for 30 days — alongside the `pendingNotice.ts` deletion.

---

## Technical notes

- `certify_rods_day` is pinned to `SET search_path = 'public'` with no `extensions`; it makes no pgcrypto calls so it is not broken, but it violates the convention and is fixed in the Step 5 migration.
- Order: Step 1 first and independent; Steps 2–4 as one sequence (the lifecycle test needs both the discard fix and `purge_rods_day`); Step 5 last, so its codes land on a trigger that is already correct.
