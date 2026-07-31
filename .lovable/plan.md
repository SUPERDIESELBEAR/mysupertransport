## Item 1 — Fail-open predicate class

**Confirmed by reads this turn:**
- Definer functions in `public` whose body contains `IF NOT (`: `approve_application_correction`, `certify_rods_day`, `handle_operator_deactivated`, `notify_driver_equipment_sheet_ready`, `notify_operators_on_fleet_share`, `revoke_share_token`.
- Definers reading `current_setting`: `enforce_eld_signature_lock`, `enforce_go_live_ack_gate`, the three `onboarding_status` guards, `enforce_rods_day_lock`, `enforce_rods_event_lock`, `purge_rods_day`, `resolve_share_token`, and three DOT/binder sync triggers.
- Intersection: `certify_rods_day`, `revoke_share_token`.

**Work:**
1. Dump every definer body in `public` and read each guard predicate. Classify: safe positive-refuse / NULL-vulnerable negated-permit (fix) / non-authorization branch (leave). `certify_rods_day`, `create_eld_document_day`, `replace_rods_document`, `discard_rods_amendment`, `resolve_share_token`, `revoke_share_token`, the malfunction-notice functions, and the short-link functions are each reported individually, including when clean.
2. One migration rewriting each vulnerable predicate to the standing form: every operand wrapped in `coalesce(...)`, written as a positive refuse (`IF coalesce(a,'') <> 'x' AND coalesce(b,'') <> 'y' THEN RAISE`), never `IF NOT (...)`. Legitimate callers unaffected; only the NULL path flips permit → refuse.
3. Add the standing rule to `docs/database-security-conventions.md` beside the `current_user` entry: the `NOT (a OR b) → NULL → IF never fires` explanation, the "positive refuse, coalesce every operand" rule, and a good/bad snippet pair.
4. **Heuristic test** — new `src/test/definer-fail-open.test.ts`. Scans **all** negation shapes, not just `IF NOT (`:
   - `IF NOT (...)` and `IF NOT <ident>`
   - `AND NOT (...)` / `OR NOT (...)`
   - `IS DISTINCT FROM` / `IS NOT DISTINCT FROM` inversions
   - `<>` / `!=` inside a negated conditional
   Flag whenever an authorization identifier — `current_setting`, `jwt`, `auth.uid`, `session_user`, `current_user`, `has_role` — appears inside such a predicate without a `coalesce` wrapping it. False positives are expected and accepted; a checked-in allowlist with a one-line justification per entry is the handling mechanism, so every accepted hit stays visible.

**Exposure window on `purge_rods_day` — three sources, not one.** `audit_log` alone is insufficient: `purge_rods_day` writes its audit row before deleting, so a purge that failed after the write, or a deletion by any other route, leaves no entry. I will check all of:
- whether `audit_log` holds any `rods_day_purged` entries at all (expected: lifecycle-test rows only);
- whether `certify_rods_day` has ever been invoked in production — a row certified and later removed leaves no trace in `rods_days`;
- the function's migration timestamp against the first-ever `rods_days` insert.

`rods_days`, `rods_events`, `rods_amendments` currently read 0 rows — a point-in-time observation, not the window. If all three sources come back empty the finding is reported as **"no evidence of any reachable row during the window,"** not "no exposure."

## Item 2 — One seeded, committed, purged run

A single script under `/tmp/browser/seeded-run/`: seed → provoke → certify/amend → purge, using a real `supabase-js` client over PostgREST for every claimed result.

1. **Seed** — sign in as an existing demo driver (real session), create one scratch `eld_malfunction_events` row plus the `rods_days`/`rods_events` rows each probe needs.
2. **Provoke** P0002, P0012, P0020, P0021, P0022, P0030, P0031, P0040, P0041 from the client, recording literal `error.code`, `error.message`, `error.details` per probe. Report a per-code table of observed values. A code that does not arrive verbatim stops the scheme for that code.
3. **Amend trail** — certify a day, amend it, certify the amendment; report the verbatim `field_path` rows written to `rods_amendments`, not a count.
4. **Continuity trigger** — instrument the deferred trigger so its execution at COMMIT is directly observed (captured `RAISE NOTICE` / counter), never inferred from absence of an error. Report the captured evidence.
5. **Purge — one arm only, stated plainly.** No service-role key is reachable from this environment, so `purge_rods_day` **cannot** be called as `service_role` over PostgREST here. The run will purge over a direct `postgres`/`supabase_admin` connection, which exercises the **`session_user` arm only**. The **`request.jwt.claims` arm — the one Stage 4's demo reset will actually use — remains untested**, and will be recorded as such. It will not be described as verified from both paths. After the purge, verify zero residue across `rods_days`, `rods_events`, `rods_amendments`, and storage paths.

**Fixtures:** parity fixtures in `src/lib/eld/offline/__tests__/classify.test.ts` are written only for codes observed in step 2. Unobserved codes stay out.

## Order
Predicate migration first, then the seeded run against the fixed gates.
