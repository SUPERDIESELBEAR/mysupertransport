## §8 — Share-token scope refactor (standalone)

Verified before writing this plan:
- `inspection_documents`: **693 rows, 693 non-null `public_share_token`** (zero nulls). The backfill must produce exactly 693 `share_tokens` rows.
- `get_inspection_doc_by_token(p_token uuid)` is a `SECURITY DEFINER` SQL function selecting `id, name, file_url, expires_at ... WHERE public_share_token = p_token`. That `expires_at` is the **document's** expiry (e.g. insurance), not a token expiry — token expiry is a new, separate concept and must not be conflated.
- Exactly one client resolution call site: `src/pages/InspectionSharePage.tsx`. `/s/:code` (`resolve_short_link`) resolves a code to the same token and then redirects to `/inspect/:token`.
- **Both sticker/link formats are in use.** `InspectionBinderAdmin.tsx:915` and `DocRow.tsx:142,1001` build QR/copy links as `/inspect/{token}` directly; `BinderFlipbook.tsx` (via `resolveShortUrl` → `get_or_create_short_link`) emits `/s/{code}` for email/SMS/QR shares, falling back to the full `/inspect` URL. So printed artifacts in trucks can carry either form and **both need the revocation/expiry check**.
- Token strings are otherwise only *read for link building* — no other resolution query exists.
- `share_tokens` / `share_token_access_log` do not exist yet.

### Migration (one migration; the backfill is the critical part)

1. `share_tokens`: `token uuid pk`, `scope text` (`'inspection_document'` initially), `resource_id uuid`, `expires_at timestamptz null`, `revoked_at timestamptz null`, `created_by`, `created_at`. Unique on `(scope, resource_id)` for the legacy 1:1 mapping.
2. `share_token_access_log`: `id`, `token`, `scope`, `resource_id`, `accessed_at`, `outcome` (`ok` / `revoked` / `expired` / `not_found`), `ip_hash`, `user_agent`.
3. **Anon-safe posture on both tables — belt and braces:**
   - No `anon` grant at all.
   - `ENABLE ROW LEVEL SECURITY` on **both** tables, so a future well-meaning `GRANT SELECT ... TO anon` cannot expose 693 live tokens in one statement.
   - **No anon policy of any kind.** Policies only for management/owner reads (`share_token_access_log`) and staff management of tokens; `GRANT ALL ... TO service_role`.
   - The definer functions bypass RLS by design, so the public `/inspect` path keeps working with zero anon reachability to either table.
4. **Backfill, fail-loud**: one row per `inspection_documents` row with non-null `public_share_token`, reusing the *same* uuid, `expires_at = NULL`, `revoked_at = NULL`. Immediately after, a `DO` block asserts `count(share_tokens where scope='inspection_document') = count(inspection_documents where public_share_token is not null)` and `RAISE EXCEPTION` on mismatch, so a partial backfill aborts the migration rather than silently taking a sticker out of service.
5. `resolve_share_token(p_token uuid)` — the single resolution path. Definer; checks `revoked_at is null and (expires_at is null or expires_at > now())`, joins the resource, and writes **one `share_token_access_log` row on every call**, including miss / revoked / expired.
6. `get_inspection_doc_by_token` kept for one release as a **thin delegate** that calls `resolve_share_token` — so its access is logged identically and a stale cached bundle cannot bypass the log. Body carries a comment naming the release it is dropped in (`DROP in the release following the one that ships §8 — see §8 notes`). It no longer references `public_share_token`.
7. `public_share_token` becomes legacy read-only: `BEFORE UPDATE` trigger rejecting changes to it, plus a deprecation comment. Column not dropped this release (link builders still read it).
8. `revoke_share_token(p_token)` — management/owner only, stamps `revoked_at`.

### Application changes
- `InspectionSharePage.tsx` calls `resolve_share_token`; not-found / revoked / expired all render the existing "Document Not Found" state — no distinction leaked to the officer.
- `ShortLinkRedirect` keeps resolving the code to a token and redirecting; it renders **no document data of its own**, so the revocation decision stays solely in `resolve_share_token`. The plan explicitly re-checks that there is no cached-document shortcut on this path.
- No change to link building or short links — token values are unchanged, so printed QR stickers keep working byte-for-byte.

### Verifications, run and reported first
Against the live database and the running preview, immediately after the migration, before any other Pass B work:
1. A pre-existing (backfilled, not newly minted) token loads through `/inspect/:token` and renders the same document id/name/file as before.
2. `select expires_at from share_tokens where token = <that token>` → `NULL`.
3. Revoke it → `/inspect/:token` returns the not-found state.
3b. **Same revoked token via `/s/:code`** → the redirect completes but the destination lands on the not-found state; confirm no document renders from a cached row before `resolve_share_token` runs. Repeat both 3 and 3b for an **expired** token (`expires_at` in the past). Then un-revoke to restore service.
4. One resolution path: `pg_get_functiondef(get_inspection_doc_by_token)` shows pure delegation with no `public_share_token` reference, and a repo-wide search shows no remaining direct `public_share_token` query.
5. `select outcome, count(*) from share_token_access_log` — one row per access above, including the revoked and expired fetches on **both** URL forms, and one written through the delegator when called directly.
6. Backfilled count vs. pre-migration non-null count (expected **693 = 693**), plus a check that RLS is enabled and zero anon policies exist on both new tables.

### Technical notes
- Newly minted tokens keep today's behavior: `expires_at = NULL` unless explicitly set — no silent expiry policy introduced here.
- Access-log writes happen inside the definer function, so anon needs no table privileges.
- No changes to `document_short_links`; `/s/:code` continues to funnel into the same single path.
