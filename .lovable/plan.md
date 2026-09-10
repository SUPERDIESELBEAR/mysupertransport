# Two of the three unclassifiable functions — settled

Read-only. Nothing changed. Every claim labelled **[live]** (`pg_get_functiondef`,
`pg_proc.proacl`, `pg_policies`, `pg_proc.prosrc`, `pg_views`,
`information_schema.columns`, `cron.job`) or **[repo]** (text search of the tree).

---

## 1. `is_valid_application_draft_token(text)` — **CALLED. Not superseded. False positive.**

### Live bodies of both functions

**[live]** `is_valid_application_draft_token(_token text)` — oid 68467, `sql`,
`STABLE SECURITY DEFINER`, `SET search_path TO 'public'`:

```sql
SELECT EXISTS (
  SELECT 1 FROM public.applications a
  WHERE a.is_draft = true AND a.draft_token IS NOT NULL
    AND a.draft_token::text = _token
);
```

**[live]** `get_application_by_draft_token(p_token uuid)` — oid 40076, `sql`,
`STABLE SECURITY DEFINER`, `SET search_path TO 'public'`:

```sql
SELECT * FROM public.applications
WHERE draft_token = p_token::text AND is_draft = true
LIMIT 1;
```

**[repo]** Migrations defining each: `is_valid_...` — exactly one,
`20260721181336_aa440d86...sql:3` (newest = only). `get_application_by_draft_token`
— exactly one, `20260327151550_6d2637b6...sql:8`.

They are **not the same function with different names**. One returns a **boolean**
and takes **text**; the other returns **`SETOF applications`** — the entire
application row — and takes **uuid**. Neither is a delegator; each reads the table
directly.

### What calls it

**[live]** Two RLS policies on **`storage.objects`** call it in their `WITH CHECK`:

| policy | bucket | check |
| --- | --- | --- |
| `Applicants upload docs under their own draft token` | `application-documents` | `is_valid_application_draft_token((storage.foldername(name))[2])` + 20 MB cap + image/pdf mimetype |
| `Applicants upload signatures under their own draft token` | `signatures` | same call + 2 MB cap + image mimetype |

**[repo]** Both are created in the same migration that defines the function,
`20260721181336_...sql:32` and `:61`. This is its whole purpose: the storage policy
cannot call `get_application_by_draft_token` in its place — that one takes `uuid`
and returns rows, not a boolean, and the folder segment is text.

**Why the guard missed it.** **[repo]** `src/test/function-reachability.test.ts:129`
scans `pg_policies pl WHERE pl.schemaname = 'public'`. The callers are in the
**`storage`** schema. The guard did not search where the caller lives.

Other categories, all **[live]** unless noted: other function bodies (`prosrc`,
**all** schemas) — none; views — none; column defaults — none; `cron.job` — none;
triggers — n/a (not a trigger function). **[repo]** whole tree, all quoting styles:
7 hits, all non-callers (its own migration ×3, generated `types.ts`,
`definer-live-catalog.test.ts` ×2, `legacyPublicOnlyPins.ts`). **[repo]** dynamic /
variable-held RPC sites read individually — none resolves to it.

So: **no client caller, two live policy callers.** The supersession recorded from
the names is wrong.

### Exposure, stated plainly

**[live]** `proacl` = `{=X/postgres, postgres, anon, authenticated, service_role}` —
PUBLIC **and** `anon` hold EXECUTE, same as `get_application_by_draft_token`.

- Anon **with** a valid draft token: `true`. Nothing else — no name, no email, no
  row. And the token they hold already unlocks the full row through
  `get_application_by_draft_token`, so the boolean discloses nothing new.
- Anon **without** a token, or with a wrong one: `false`, and nothing else.

It is a **confirmation oracle** over `applications.draft_token`. The tokens are
UUIDs and the function is unthrottled and unlogged, so an attacker could in
principle enumerate — but a hit on a v4 UUID is not reachable by brute force, and
the same oracle already exists implicitly in `get_application_by_draft_token`
(rows vs no rows). It is **not** the 2026-09-03 shape: that function required no
secret at all.

### Recommendation — **keep, with a registered justification**

Register it in the reachability allowlist with the reason
`CALLED BY storage.objects RLS: 'Applicants upload docs/signatures under their own
draft token' (migration 20260721181336)`. Dropping it would silently break applicant
document and signature upload.

Two follow-ups, neither part of this pass:

1. **Fix the guard, not the finding.** Drop `schemaname = 'public'` from the policy
   subquery so `storage`, `realtime` and any other schema count as callers. Predict
   before rerunning: the finding count should fall by **at least one** (this
   function); if it falls by more, each extra is another false positive of the same
   kind and must be read individually.
2. `anon` needs EXECUTE (the uploader is unauthenticated) — but **PUBLIC does not**,
   and it holds it. Same grant-hygiene defect as the dropped delegator, same
   remedy: `REVOKE EXECUTE ... FROM PUBLIC` while keeping the `anon` grant.

---

## 2. `can_driver_message_staff(uuid, uuid)` — **UNCALLED. No indirect policy call.**

### Live body

**[live]** oid 72193, `plpgsql`, `STABLE SECURITY DEFINER`, `search_path 'public'`.
It returns whether a driver may open a conversation with a staff member, in order:
suppression row → `FALSE`; assigned onboarding staff → `TRUE`; dispatcher on the
driver's most recent `active_dispatch` → `TRUE`; then
`staff_messaging_settings.availability_mode`: NULL/`none` → `FALSE`, `all_drivers`
→ `TRUE`, otherwise an explicit `driver_staff_contacts` row.

**[repo]** Two migrations define it: `20260729154047_...sql:117` and
`20260729164130_...sql:119` (newest; bodies identical). A third,
`20260903193033_...sql:19,34`, revoked PUBLIC and `anon` and granted
`authenticated, service_role` — **[live]** `proacl` confirms:
`{postgres, authenticated, service_role}`. No PUBLIC, no `anon`.

### The indirect-call question — answered, and the answer is no

**[live]** The `prosrc` scan was run across **every schema, every function**, not
just `public`: **zero** function bodies mention it. That covers the indirect case
completely — a policy can only reach it *through* a function, and no function
contains it.

**[live]** Policy expressions on `messages`, `message_threads` and
`thread_participants` were expanded in full. They resolve through
`is_thread_participant(...)`, `has_role(...)`, `auth.uid()` equality and inline
`EXISTS` subqueries on `message_threads` — **[live]** and `is_thread_participant`'s
own body does not call it either. The messaging permission tables
(`driver_staff_contacts`, `driver_staff_contact_suppressions`,
`staff_messaging_settings`) are policed by plain `auth.uid()` / `has_role`
predicates.

Remaining categories, **[live]**: views — none; column defaults — none; `cron.job`
— none; triggers — n/a. **[repo]** whole tree: 6 hits, all non-callers (two defining
migrations, the revoke migration, generated `types.ts`,
`definer-live-catalog.test.ts`, `legacyPublicOnlyPins.ts`). **[repo]** edge
functions — zero. **[repo]** dynamic RPC sites — none resolves to it.

**Nothing calls it.**

### What the app uses instead

**[repo]** The driver UI asks a different question: `list_driver_contacts(_driver)`
— `NewChatChooser.tsx:60`, `NewGroupModal.tsx:57`, `DriverContactsPanel.tsx:48`.
That function, defined in the **same migration**, returns the whole eligible-staff
list applying the same rules (auto-assignment, availability mode, suppression
exclusion). `can_driver_message_staff` is the single-pair form of a question the
product only ever asks in list form. It was written alongside its sibling and never
wired up.

### Exposure

**[live]** No PUBLIC, no `anon`. An authenticated caller can pass **any** two UUIDs
— it does not check that `_driver = auth.uid()`. What they learn is one boolean
about a driver/staff pair: whether messaging is permitted. No names, no message
content, no contact details. That is a weak inference channel, not a leak, and it
is closed to the unauthenticated.

### Recommendation — **drop it**

`DROP FUNCTION public.can_driver_message_staff(uuid, uuid);`, remove its entries
from `legacyPublicOnlyPins.ts` and `definer-live-catalog.test.ts` (lowering each
ceiling by one), regenerate types.

Named defence: nothing calls it — ten categories empty, including the
all-schema `prosrc` scan that is the only way a policy could reach it indirectly.
Its sibling `list_driver_contacts` is what the product actually calls, and it
re-implements the same rules independently, so deleting this one removes no logic
the app depends on.

Weaker alternative if a single-pair check is wanted later: keep it and register the
justification as `INTENDED SERVER-SIDE GUARD, NOT YET WIRED` with a dated review.
Not recommended — a dead function with an allowlist entry is the state that let the
2026-09-03 incident sit for four months. Re-adding it later is one migration.

---

## Should the guard learn to follow the chain

It already does for functions: the `prosrc` subquery catches a function called by a
function called by a policy. The gap this pass found is **schema scope, not depth** —
`pg_policies` filtered to `public` while the real callers sat in `storage`. That is
the change worth making, and it is a one-line change.

---

## Status of the three

| function | verdict |
| --- | --- |
| `is_valid_application_draft_token(text)` | **called** by 2 `storage.objects` policies — keep, register, fix the guard, revoke PUBLIC |
| `can_driver_message_staff(uuid,uuid)` | **uncalled**, superseded in practice by `list_driver_contacts` — drop |
| `get_application_pei_summary(uuid)` | not investigated, as instructed |
