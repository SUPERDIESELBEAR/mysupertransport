# Database security conventions

These rules are enforced by `src/test/definer-search-path.test.ts`. A migration
that breaks them fails CI.

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
`42501` for `purge_rods_day` and `P0001` for the deferred continuity trigger.

Not observed, and unreachable from a driver client: `P0002`, `P0040`, `P0041`.
The `rods_days` UPDATE and DELETE policies both require `locked = false`, so
RLS filters a certified row out before the lock trigger runs — the write
returns **0 rows and no error**. Any client logic that waits for one of those
three codes will wait forever; check the affected row count instead.
