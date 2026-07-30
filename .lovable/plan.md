## Confirmed before planning

**FAQ — live regression, wider than reported.**

`pg_policy.polroles` for "Anyone can view published owner-operator FAQs" is `{0}` — `roles = {public}`. PUBLIC includes `anon` **and** `authenticated`, so that policy was always the anon read path; the grant was never inert.

`information_schema.role_table_grants` for `public.faq` returns **zero rows**. No role holds any privilege: signed-out visitors, logged-in drivers, and staff are all broken.

**Deferred constraint — confirmed present.**

`rods_days_certified_continuity` is a constraint trigger, `DEFERRABLE INITIALLY DEFERRED`, evaluated at COMMIT — so the rolled-back Day A/Day B run never fired it. It is the only deferred constraint on `rods_days`; the FK, PK and three CHECKs are immediate, and `rods_days_lock_update` / `rods_days_lock_delete` are ordinary immediate triggers.

---

## Step 1 — Restore `faq`, then audit grants-versus-policies for all roles

Immediate migration:

```sql
GRANT SELECT ON public.faq TO anon;
GRANT SELECT ON public.faq TO authenticated;
GRANT ALL   ON public.faq TO service_role;
```

`anon` gets SELECT only; the policy already narrows rows to `is_published AND audience='owner_operator'`.

Then the full audit, before granting anything else. For **every** table in `public`, join `pg_policy.polroles` (resolved to role names, with `{0}` rendered as `public`) against `information_schema.role_table_grants`, and report:

- table, policy name, command, resolved roles
- grants currently held by `anon`, `authenticated`, `service_role`

Flagged as a defect: any table where a policy admits a role that now holds **no** grant for that command — checked for `anon` **and** `authenticated` independently. A `TO public` policy with no `authenticated` grant is the identical bug with a far bigger blast radius, since every logged-in user hits it.

The full list is reported before any grant beyond `faq` is issued.

## Step 2 — Signed-out browser pass, after Step 1 lands

Headless Chromium, no session, real page loads, screenshot each — not RPC curls; the point is what renders.

`/faq` (owner-operator), public application form (submit + resume-token link), `/inspect/:token`, `/s/:code`, PEI respond, PEI FCRA release, passenger-auth signing, unsubscribe, `/p?c=` preview login, splash/login.

Reported as a table: route → renders / empty / error, plus console errors. With no pre-migration baseline, each failure is classified into **three** buckets, not two:

1. **Grant-caused regression** — fails now, passes when the grant is present.
2. **Pre-existing, unrelated** — fails identically with and without the grant, and the cause is identified.
3. **Fails both ways, cause unknown** — listed explicitly as a separate open bug, never folded into bucket 2.

Re-revoking inside a rolled-back transaction is the discriminator between 1 and 2/3; it cannot separate 2 from 3, so 3 stays its own line item until diagnosed.

## Step 3 — `certify_rods_day` success path, committed

Same scratch fixture, inserted as service role so the malfunction wizard never runs (no notice PDF, no email, no notifications) — but **committed**, since the deferred continuity trigger only fires at COMMIT.

- Day A `record_source='keyed'`: events tiling 00:00–24:00, all twelve guarded header fields populated.
- Negative case re-run (gap) — expect the raise.
- Restore the segment, call `certify_rods_day`, **COMMIT**. Confirm `status='certified'`, `locked=true`, deferred continuity trigger passed. Report whether it worked first time or needed fixing, and exactly what.
- Cleanup in a **separate committed transaction** as service role: a certified day has no DELETE policy and `rods_days_lock_delete` fires immediately, so cleanup uses `session_replication_role` or a targeted service-role delete — I'll report which.
- Day B `create_eld_document_day`, also committed: certified + locked + `pdf_path` null.
- Final report: `count(*) = 0` for `rods_days`, `rods_events`, `eld_malfunction_events`, `eld_malfunction_notifications`, plus `email_send_log` / `email_send_state` empty for the run window.

## Step 4 — Verifications 4 and 5

- Execute `get_or_create_short_link`; confirm a `document_short_links` row lands — the first successful call in its life. Report the row.
- Then 3b for real: create a share token + short link, revoke the token, load `/s/:code` signed out, confirm "Document Not Found"; repeat for an expired token; confirm **both** wrote `share_token_access_log` rows; then un-revoke, delete the short link and the scratch token.

---

## Technical notes

- Only Step 1 changes the database; Steps 2–4 are verification. No application code changes.
- New test file `src/test/policy-grant-parity.test.ts` — separate from `definer-search-path.test.ts`, because grants-versus-policies and `search_path` pinning are different concerns. It fails when a migration creates a policy admitting `public`/`anon`/`authenticated` on a table without a matching `GRANT` for that role and command, asserting `authenticated` on the same footing as `anon`.
- `docs/database-security-conventions.md` gains a section on `{public}` vs `{anon}`: a `TO public` policy is an `anon` **and** `authenticated` path, and "no policy names anon" is not evidence that a grant is inert. That reasoning error is the root cause of this regression.
