# `get_inspection_doc_by_token` — read-only investigation

No code, migration, or data was changed. Every claim below is labelled **[live]**
(catalog / `pg_get_functiondef` / `pg_proc.proacl` / `cron.job`) or **[repo]**
(text search of the working tree).

## 1. What it returns, and to whom

**[live]** Newest definition (from `pg_get_functiondef`, oid 27742):

```text
get_inspection_doc_by_token(p_token uuid)
  RETURNS TABLE(id uuid, name text, file_url text, expires_at date)
  LANGUAGE sql  SECURITY DEFINER  SET search_path TO 'public'
  -- LEGACY DELEGATOR (§8). Kept for one release ...
  SELECT r.id, r.name, r.file_url, r.expires_at
  FROM public.resolve_share_token(p_token) r;
```

**[repo]** Two migrations define it: `20260317005145_...sql:124` (original) and
`20260730164628_...sql:149` (current). The newer one rewrote it into a thin
delegate and left the comment: *"Kept for one release so stale cached client
bundles keep resolving... DROP in the release following the one that ships §8."*

It performs **no checks of its own**. All validation happens inside
`resolve_share_token` → `_share_token_gate`, which **[live]**:

- looks the token up in `share_tokens`; unknown → `not_found`
- `revoked_at IS NOT NULL` → `revoked`
- `expires_at IS NOT NULL AND expires_at <= now()` → `expired`
- counts served (`outcome = 'ok'`) opens in the last hour, ceiling 60 → `throttled`,
  failing closed if the counter cannot be read
- writes a row to `share_token_access_log` on **every** outcome, with salted IP
  hash and user agent
- only for `scope = 'inspection_document'` returns the row from `inspection_documents`

**Not single-use. Expiry is optional.** **[live]** `share_tokens` columns are
`token, scope, resource_id, expires_at, revoked_at, created_by, created_at` —
there is no `used_at`/`use_count` column, and `expires_at` is nullable and treated
as "never expires" (this is deliberate: the printed QR stickers have NULL expiry).

So an anon caller **with a valid token** gets one binder document's `id`, `name`,
`file_url` and `expires_at` — the same payload the QR-sticker page serves.
An anon caller with **no token** cannot call it (argument is required, and a
non-UUID string is a type error). With a **wrong/random UUID** they get **zero
rows** — indistinguishable from revoked or expired — plus a logged attempt.

**Grant asymmetry, and this is the one real defect.** **[live]** `proacl`:

| function | PUBLIC | anon |
| --- | --- | --- |
| `resolve_share_token` | revoked | EXECUTE |
| `resolve_share_bundle` | revoked | EXECUTE |
| `_share_token_gate` | revoked | **no grant** |
| `get_inspection_doc_by_token` | **`=X/postgres` — PUBLIC holds EXECUTE** | EXECUTE |

The `20260730164628` migration ran `REVOKE ALL ... FROM PUBLIC` on
`resolve_share_token` but issued **no REVOKE for the delegator**, so it kept the
default PUBLIC grant from the March migration.

## 2. Does anything call it

Searched, and found:

| where searched | result |
| --- | --- |
| **[repo]** whole tree, all quoting styles | 7 hits, **no call site** |
| **[repo]** `src/pages/InspectionSharePage.tsx` | calls `resolve_share_token` (line 34) |
| **[repo]** `src/pages/BinderShareBundlePage.tsx` | calls `resolve_share_bundle` + `get_share_bundle_meta` (lines 38-39) |
| **[repo]** `supabase/functions/**` | zero references; `officer-packet-download` names `resolve_share_token` in a comment only |
| **[repo]** dynamic / variable-held RPC names | the handful of non-literal `supabase.rpc(` sites were read; none resolves to this name |
| **[live]** other function bodies (`prosrc`) | none |
| **[live]** RLS policy `USING` / `WITH CHECK` | none |
| **[live]** views, column defaults | none |
| **[live]** `cron.job` commands | none |

The 7 repo hits are: the two migrations, `src/integrations/supabase/types.ts`
(generated), `definer-live-catalog.test.ts` (×2), `legacyPublicOnlyPins.ts`, and
the docs. **Nothing calls it.** No trigger exists for it (it is not a trigger
function).

## 3. What serves the share pages today

**[repo]** `/inspect/:token` → `resolve_share_token(p_token)` called directly from
the browser. `/inspect/all/:token` → `resolve_share_bundle(p_token)`, which loops
the bundle's `doc_tokens` through `resolve_share_token`. The officer packet scope
goes through the `officer-packet-download` edge function →
`resolve_officer_packet_token`.

So yes: **a different function serves the live pages, and
`get_inspection_doc_by_token` is a superseded predecessor left behind with its
anon grant** — structurally the `get_pei_requests_needing_action` shape. Its own
migration comment scheduled it for deletion "the release following §8"; §8
shipped 2026-07-30 and it is still here.

## 4. The exposure — smaller than the incident, and I will not inflate it

What an unauthenticated caller can obtain: **nothing they could not already obtain
by calling `resolve_share_token` with the same token.** The delegator adds no data
and removes no check — it is the same gate, the same throttle, the same access log,
minus the `outcome` column.

To get anything they need a **v4 UUID that exists in `share_tokens`**. Guessing is
not a threat; the realistic acquisition paths are the ones that already apply to
the live path: a photograph of a printed QR sticker, or a forwarded binder-share
email.

Comparison with the recorded incident, honestly:

| | `get_pei_requests_needing_action` | `get_inspection_doc_by_token` |
| --- | --- | --- |
| authorization | **none** — any anon caller got applicant names and prior-employer emails | requires a valid, non-revoked, non-expired token |
| rate limit | none | 60 served opens/token/hour, fails closed |
| audit | none | every attempt logged with salted IP hash + UA |
| data reachable without a secret | **all of it** | none |

**Materially better protected — not the same.** The token is unguessable and
revocable; it is **not** single-use, and expiry is optional by design.

The genuine finding is narrower: **PUBLIC still holds EXECUTE on this one
function** where its own migration revoked PUBLIC on every sibling. On this
project that is a grant-hygiene defect, not a data leak, because `anon` is granted
anyway. It matters because a hardening pass that revokes `anon` across the board
would leave this door open through PUBLIC.

## 5. Recommendation — **drop it**, not allowlist, not merely revoke

1. `DROP FUNCTION public.get_inspection_doc_by_token(uuid);`
2. Remove its entry from `src/test/helpers/legacyPublicOnlyPins.ts` and the two
   `definer-live-catalog.test.ts` registrations, and regenerate types.
3. The function-reachability guard then drops from 14 findings to 13 — green by
   deletion, which is the sanctioned route.

Defence, and what breaks. **Nothing in this repository calls it** (section 2, ten
search categories, all empty). The one population the comment was written for —
stale browser bundles still holding the March client — is 6 weeks past the
one-release window the author gave it, and those bundles fetch a QR-sticker
document that a reload resolves through `resolve_share_token` anyway. A client
running code that old is already broken against the rest of the schema.

Weaker fallbacks, if dropping now feels premature: `REVOKE EXECUTE ... FROM
PUBLIC` alone closes the actual defect and leaves the dead delegator in place —
but then it must go into the allowlist with a dated `AWAITING` reason and a stated
drop date, and a dead function carrying an allowlist entry is exactly the state
that let the incident sit for four months. I do not recommend it.

**Not recommended in any form:** allowlisting it as-is. It is not unclassifiable
any more — it is confirmed uncalled and confirmed superseded.

### Also surfaced, out of scope here

`get_share_bundle_meta` is called by `BinderShareBundlePage.tsx` **[repo]** — if it
sits on the unclassified list, that settles it. The other three unclassifiable
functions were not investigated in this pass.
