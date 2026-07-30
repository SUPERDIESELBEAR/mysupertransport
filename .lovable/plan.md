## Correction to the §8 report (standing)

Verification 3b (`/s/:code` for revoked and expired tokens) **was not executed**. No short link ever existed, none was hand-inserted, none removed. The short-link revocation path is unverified and is re-tested for real below, after the `search_path` fix makes `get_or_create_short_link` capable of succeeding at all.

---

## Order of operations

**Baseline runs first and is reported before Migration 1 executes.**

### Baseline — every anonymous entry point, signed out, pre-migration
Public application form (submit + resume-token link), FAQ (owner-operator), `/inspect/:token`, `/s/:code`, PEI respond, PEI FCRA release, passenger-auth signing, unsubscribe, preview login (`/p?c=`), splash/login. `/s/:code` is expected to record as already broken — that is the point of the baseline.

---

## Migration 1 — tables and default privileges only

1. `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES, SEQUENCES FROM anon`.
2. `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon`, then re-grant only `INSERT ON applications` and `SELECT ON faq`.
3. Header comment stating the standing rule: definer functions use `SET search_path = public, extensions`; extension calls are always schema-qualified.

## Migration 2 — search_path fix

4. `get_or_create_short_link`: repin `SET search_path = public, extensions` and schema-qualify `extensions.gen_random_bytes(...)`.
5. Same repin applied preventively to other definer functions that could grow an extension call.

## Migration 3 — salted, fail-open ip_hash

6. Add `hash_version smallint` and `ip_hash_status text` to `share_token_access_log`.
7. Salt in Vault, read inside an exception block in `resolve_share_token`. If the read fails: log with `ip_hash = NULL`, `ip_hash_status = 'salt_unavailable'`, and resolve the document normally. Vault availability must never 404 an officer-facing share.
8. Successful hashes write `hash_version = 1`.
9. The 10 legacy rows are nulled with `hash_version = 0`, `ip_hash_status = 'legacy_unsalted'`. **Migration comment records the general rule: retain and re-label, not delete.** A weak hash still proves two accesses shared an address and still confirms a known IP — on a compliance access log that is evidence. Nulling is acceptable only because all 10 rows are our own test traffic; where rows represent real officer access, retention wins.

## Separate pass (after Migration 1 verifies) — function grant audit, no blanket revoke

10. Enumerate every `public` function `anon` can EXECUTE, with `prosecdef` and whether the body performs an auth check.
11. Classify: intentionally public / should be authenticated-only / unclear.
12. **Report the full list before revoking anything.** Revoke only the second category, by name.

---

## Verification

1. `relacl` scan: no `anon=` on any table except `applications` (INSERT) and `faq` (SELECT).
2. Create a throwaway table → confirm no anon grant → drop it.
3. Re-test the full anonymous entry-point list and diff against the baseline. Any regression blocks the next migration.
4. Execute `get_or_create_short_link` — first successful call in its life — confirm a `document_short_links` row lands.
5. **Re-run 3b for real**: revoke the token, hit `/s/:code`, confirm "Document Not Found"; repeat for an expired token; confirm both wrote access-log rows. Then un-revoke and delete the test short link.
6. **RODS functions — scripted, service role, two scratch days, zero side effects.**

   The RODS module is gated behind an open malfunction with `hinders_hos_recording = true`. That row is inserted **directly as service role, bypassing the wizard**: the notice-generation path is never called, so no notice PDF, no email to `carrier_profile` recipients, no in-app notifications to Management/Dispatcher. Deleting rows afterward does not unsend an email. Before running, confirm the hourly escalation job (days 3/5/6/7/8) cannot pick up a row that exists for under a minute, or schedule outside its window — report which.

   - **Day A — `record_source = 'keyed'`.** This is the day that exercises the guard, because a `certify_rods_day` call is what the twelve-field header check and the tiling check live behind. Insert `rods_events` tiling 00:00–24:00 with duty status, city and state on every segment, populate all twelve guarded header fields, then:
     - **Negative case first:** remove one segment to leave a gap and call `certify_rods_day` with the certification token. Confirm it **raises** rather than accepting. A guard that has never rejected anything is as unproven as one that has never accepted anything, and the parity fixtures assume the server rejects exactly what the client rejects.
     - Restore the segment and call `certify_rods_day` again. Confirm it succeeds and the row lands `certified` / locked.
   - **Day B — `record_source = 'eld_document'`.** Call `create_eld_document_day` and confirm it lands **certified and locked with `pdf_path` null**. It never passes through `certify_rods_day` — it is created certified — so it proves the upload path only, not the guard.
   - Delete both days, their events, the malfunction row, and any notification rows in the same script. A certified day has no DELETE policy by design and would otherwise become an undeletable artifact in the federal retention archive.
   - Report `count(*)` = **0** for `rods_days`, `rods_events`, `eld_malfunction_events`, **and `eld_malfunction_notifications`**, plus confirmation that **no email was queued or sent** (`email_send_log` / `email_send_state`, run window).
7. Two fresh `/inspect` hits produce `ip_hash` differing from unsalted SHA-256 of the same IP, `hash_version = 1`. Then simulate a Vault read failure: document still resolves, row written `NULL` / `'salt_unavailable'`.
8. Call `revoke_share_token` as a plain authenticated operator → expect `not authorized`, token still live.

### Standing guard
9. README section documenting the definer/`search_path` rule.
10. A vitest scanning `pg_get_functiondef` for every `SECURITY DEFINER` function in `public`, failing on an unqualified call to a known extension function (`gen_random_bytes`, `digest`, `hmac`, `crypt`, `gen_salt`, `uuid_generate_v4`, `pgp_*`) or a `search_path` omitting `extensions`.
