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

## 3. `anon` gets no table privileges

`anon` holds exactly one table privilege in `public`: `INSERT ON applications`
(the public job-application form). Every other signed-out flow — `/inspect`,
`/s/:code`, `/pei/respond`, `/pei/release`, `/passenger-auth`,
`/application/approve`, `/apply`, `/preview-login` — goes through a
`SECURITY DEFINER` RPC or an edge function.

Do **not** add `GRANT ... TO anon` to a new table. If a signed-out page needs
data, add a definer RPC that returns exactly the columns that page renders.

Default privileges for role `postgres` in `public` no longer grant `anon`
anything, so new tables start closed.

## 4. Secrets belong in `app_private`

`app_private.config` is a key/value store with RLS on, no policies, and no
grants to `anon` or `authenticated`. It is readable only from
`SECURITY DEFINER` functions and `service_role`. The share-token IP salt
(`share_token_ip_salt`) lives there.

Code that depends on a value from `app_private` must **fail open** when the
value is missing — never block a user-facing read on a config lookup. See
`resolve_share_token`, which logs a `NULL` fingerprint with
`hash_version = 'v2_salt_unavailable'` and still serves the document.