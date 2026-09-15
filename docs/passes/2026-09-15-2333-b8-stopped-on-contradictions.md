# 2026-09-15 23:33 — B8 (token / share tables) — STOPPED ON CONTRADICTIONS

Mode: BUILD. **No DDL was executed. No migration was created. No file other than
this report was changed.** The pass stopped at step 2 because two facts read from the
live database contradict the record's B8 decision, and step 4 cannot be settled
without the owner. Per the standing instruction, contradictions are reported, not
reconciled.

---

## 1. THE LIST, from the live catalog

`count(*)` at 2026-09-15 23:33 UTC. `pg_stat_user_tables` was NOT used for these
figures — its `n_live_tup` is stale on this database (it reports `share_tokens` as 0).

| table | live rows | record's figure | writer | shape the writer implies |
|---|---|---|---|---|
| `share_tokens` | 693 | 693 ✓ | signed-in staff, `INSERT` policy gated on four staff roles; created from `src/pages/InspectionSharePage.tsx` and the three send- edge functions | Shape 1 |
| `share_token_access_log` | **157** | 156 ✗ (+1 since the plan) | `public._share_token_gate(uuid)`, SECURITY DEFINER, on an **anonymous** path. No client policy exists for INSERT at all. | Shape 3 |
| `document_short_links` | 25 | 25 ✓ | `public.get_or_create_short_link(text)`, SECURITY DEFINER — **but see contradiction 1: it refuses anonymous callers** | Shape 1, not Shape 3 |
| `binder_share_bundles` | 8 | 8 ✓ | signed-in authenticated user, `WITH CHECK (created_by = auth.uid())`; `supabase/functions/send-binder-share` | Shape 1 |
| `ica_review_links` | 2 | 2 ✓ | signed-in staff, `supabase/functions/send-ica-review-link` | Shape 1 |
| `officer_packet_links` | 0 | 0 ✓ | `supabase/functions/send-officer-packet` (service role); no client INSERT policy | Shape 1 / service-role |
| `preview_sessions` | **119** | 112 (recorded 2026-09-14) ✗ | `supabase/functions/create-preview-session` (service role); single policy `No client access to preview sessions` denies all client access | Shape 1 / service-role |
| `passenger_authorizations` | **8** | not sized in the record | `supabase/functions/send-passenger-auth` (service role, staff-gated) | Shape 1 / service-role |

Batch total **1,012 rows**, not the 1,004 the record carries — the 7-table B8 figure
of 1,004 reconstructs exactly as 693 + 156 + 25 + 8 + 2 + 0 + 112, i.e. it did **not**
include `passenger_authorizations`. This is drift, not an error in the plan.

`application_resume_tokens` (56 rows) is a token table that also lacks `company_id`
and is **not** in B8 under any reading of the record. It hangs off `applications`,
which is declared GLOBAL, so it has no reachable parent company — the same structure
that correctly stopped the `applications` pass. It is named here so the next pass does
not discover it as a surprise.

Only ONE of the eight is written on a genuinely anonymous path: `share_token_access_log`.

---

## 2. CONTRADICTION 1 — `get_or_create_short_link` is not an anonymous writer

The record, under *DECISION — a THIRD stamping shape, scope limited to B8*, states:

> `document_short_links` via `get_or_create_short_link` is the same.

The live body says otherwise:

```sql
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'P0051';
  END IF;
...
    INSERT INTO public.document_short_links (code, share_token, created_by)
    VALUES (v_code, _share_token, auth.uid());
```

It **refuses** an anonymous caller before it writes, and stamps `created_by` with the
caller. It is a signed-in write behind a definer wrapper. Shape 1 (`current_company_id()`
from the caller) fits it exactly, and Shape 3 is not needed for it.

Consequence: Shape 3's scope as recorded — "the two anonymous-path writers" — covers
**one** table, not two. That is a narrowing of a recorded decision, so it is the owner's
to make, not mine.

---

## 3. CONTRADICTION 2 — the anonymous writer has rows with NO parent, by design

Shape 3 requires the definer function to derive the company from the parent and to
**refuse when the parent cannot be resolved**. `_share_token_gate` cannot honour that
without breaking what it exists to do.

The gate's parent is the `share_tokens` row for the presented token. When the token is
unknown it records the attempt anyway:

```sql
  SELECT * INTO v_tok FROM public.share_tokens t WHERE t.token = p_token;
  IF NOT FOUND THEN v_outcome := 'not_found';
  ...
  INSERT INTO public.share_token_access_log
    (token, scope, resource_id, outcome, ...)
  VALUES (p_token, v_tok.scope, v_tok.resource_id, v_outcome, ...);
```

Live distribution of `share_token_access_log` (157 rows):

| outcome | rows | rows with a `resource_id` |
|---|---|---|
| ok | 143 | 143 |
| not_found | **8** | **0** |
| revoked | 2 | 2 |
| throttled | 2 | 2 |
| expired | 2 | 2 |

All 8 `not_found` rows reference a token that is absent from `share_tokens` (verified
by `NOT EXISTS`), so their parent does not exist and never did. They are the record of
someone presenting a bad or guessed token — precisely the rows a security log must keep.

Therefore:

- A `NOT NULL company_id` on this table cannot be backfilled for those 8 rows.
- "Refuse when the parent cannot be resolved" would turn every unknown-token probe
  into an exception instead of a logged `not_found`, deleting the log's most
  security-relevant class of row and changing the gate's fail-closed behaviour.

Neither Shape 3 as written nor a plain nullable column resolves this: a null would
conflate "unknown token" with "writer forgot to stamp", which is the exact conflation
the `audit_log` decision rejected four hours ago. A defensible answer needs a decision
(e.g. table stays GLOBAL as a cross-carrier abuse log, or the column is nullable with a
CHECK tying null strictly to `outcome = 'not_found'`). I am not choosing it here.

Related, and reported for completeness: **4 of 693** `share_tokens` rows point at an
`inspection_documents` row that no longer exists. `share_tokens` is staff-written so
this does not block Shape 1, but it does mean a parent-derived shape would not have
worked for `share_tokens` either.

---

## 4. STEP 3 — the token indexes, confirmed unscoped (nothing was changed)

Live non-primary unique indexes on the batch, all on the token/code alone:

- `share_tokens_scope_resource_unique` — `(scope, resource_id)`
- `share_tokens_token_key` — `(token)`
- `binder_share_bundles_token_key` — `(token)`
- `document_short_links_share_token_key`, `document_short_links_code_key`
- `ica_review_links_token_key`
- `passenger_authorizations_response_token_key`
- `preview_sessions_code_hash_key`

None carries `company_id`, and none may gain it: every one of them is probed before any
tenant is known. The guard asserting this was **not written**, because writing a guard
for a migration that was not applied would be a green-and-empty check of exactly the
kind recorded this evening.

---

## 5. STEP 4 — `share_tokens`: what turns on it, and the recommendation

**Something does read it cross-carrier.** Both read policies are role tests only:

```
share_tokens "Staff can view share tokens"
  USING (has_role(...'management') OR ...'owner' OR ...'onboarding_staff' OR ...'dispatcher')
share_token_access_log "Management can view share token access log"
  USING (has_role(...'management') OR has_role(...'owner'))
```

`has_role` was narrowed on 2026-09-15 to `auth.role() = 'service_role' OR
ur.company_id = current_company_id()`, so it proves the *role* belongs to the caller's
carrier. It says nothing about the row. With a second carrier present, carrier B's
dispatcher listing share links would see carrier A's — including `resource_id`, which
names carrier A's inspection documents. The anonymous resolve path is unaffected either
way, because `resolve_share_token` runs as definer and looks up by token.

**Recommendation: the ROW carries `company_id`** (Shape 1, derived from the staff
creator), the indexes stay global, and the two read policies gain
`AND company_id = current_company_id()`. The public link keeps working because it never
goes through those policies.

Per the instruction, this is a recommendation only. `share_tokens` was not among the
owner's five decisions, so **the pass does not choose it** and no column was added.

---

## 6. STEP 5 — verification not performed, and why

The anonymous-resolve check (fetch a live share link unauthenticated, confirm the
access-log row it writes carries the right company) is meaningless before the column
exists. It is the acceptance test for the migration this pass did not make. No
structural check, no typecheck claim, no guard-failure demonstration is offered here:
nothing was changed, so there is nothing whose passing would be evidence.

---

## 7. WHAT REMAINS IN THE TENANCY SEQUENCE — measured

`55` public tables still lack `company_id` (live catalog count, 2026-09-15 23:33). Of
those, this batch is 8 tables / 1,012 rows. The rest are the already-declared GLOBAL
set, the DEFERRED content group, the two logs decided GLOBAL earlier today
(`audit_log`, `email_send_log`), and `application_resume_tokens` / the
`applications`-and-`pei_requests` family whose GLOBAL declaration the audit-log
decision identified as the only thing that could ever unblock them.

B8 is the last batch, and after it the remaining work is not migration work but the
two open reversals: `applications`/`pei_requests`, and cross-carrier isolation, which
stays unverifiable while one real carrier exists.

## 8. CONTRADICTIONS — count

Two new, both mine to report and neither mine to settle:

11. `get_or_create_short_link` recorded as an anonymous writer; it refuses anonymous callers.
12. Shape 3's "refuse when the parent cannot be resolved" is unsatisfiable for
    `share_token_access_log`, whose 8 `not_found` rows have no parent by design.

Plus drift, not contradiction: `share_token_access_log` 157 vs 156, `preview_sessions`
119 vs 112, and `passenger_authorizations` (8) absent from the 1,004 figure.
