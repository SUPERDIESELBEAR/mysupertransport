# Fix: Staff Help page not functioning

## Root cause

`StaffHelpPortal.tsx` calls the RPC with an unknown parameter:

```ts
supabase.rpc('search_staff_faqs', { q: query.trim() || null, match_limit: 100 })
```

But the deployed function signature is `search_staff_faqs(q text)` — no `match_limit` argument. PostgREST rejects the call ("could not find function… with parameters q, match_limit"), the toast fires "Search failed.", and results stay empty. That's why the page shows "No staff articles yet" even though 13 published staff FAQs exist in the database.

## Fix

Update `src/components/management/StaffHelpPortal.tsx`:

- Remove `match_limit` from the `supabase.rpc` call. Pass only `{ q: query.trim() || null }`.
- Leave the empty-state copy alone (it already reads correctly when there are truly zero results).

That's the entire code change. No migration needed — the RPC already returns up to 100 rows via its internal `LIMIT 100`.

## Verify

1. Reload `/dashboard?view=faq` as staff → the 13 published staff FAQs render.
2. Type a keyword → results filter with `<mark>` highlights.
3. No "Search failed" toast in console/network.
