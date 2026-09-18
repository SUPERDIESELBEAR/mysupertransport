# 2026-09-17 2330 UTC — restrictive tenant policy: SHARE LINKS and SMALL SETTINGS

Migration: `drizzle/migrations/0009_restrictive_tenant_policy_share_links_and_settings.sql`.
Seven tables, the pilot's exact policy, nothing else.

## Step 0 — scope, and one deviation the owner decided

The brief said "the small settings tables (the three the money batch named as
remaining)". The record names NONE: the 2200 money-batch report (line 153) and
the wish-list rollout line both say only "SMALL SETTINGS". Live there was ONE
settings table still pending (`inspection_program_settings`). The pass STOPPED
and asked; the owner named `inspection_program_settings`,
`message_notification_throttle` and `contractor_pay_setup`.

`contractor_pay_setup` was then EXCLUDED from this batch. It is driver pay data
read on the driver's own pay screens, so it belongs in a money-shaped pass with
aborting-transaction probes and screen totals, not folded into a share-link
batch. It stays in `PENDING_RESTRICTIVE`.

## Step 1 — the batch, live

```sql
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
  AND EXISTS (SELECT 1 FROM information_schema.columns col
    WHERE col.table_schema='public' AND col.table_name=c.relname AND col.column_name='company_id');
```

| table | rows | permissive policies today |
|---|---|---|
| `document_short_links` | 25 | none (service-role only) |
| `officer_packet_links` | 0 | 1 SELECT (drivers, own links) |
| `ica_review_links` | 2 | INSERT + SELECT (staff), UPDATE (creator/management) |
| `binder_share_bundles` | 8 | INSERT + SELECT (authenticated, creator) |
| `preview_sessions` | 136 | 1: `ALL … USING false` — no client access |
| `inspection_program_settings` | 1 | ALL (management), SELECT (staff) |
| `message_notification_throttle` | — | none (service-role only) |

None is realtime-subscribed: absent from `pg_publication_tables` for
`supabase_realtime`, and source has no `.channel(...)`/`postgres_changes`
subscription on any of them.

Pre-flight, live: `company_id` is `attnotnull = true` on all seven, `count(*)
where company_id is null` = 0 on all seven, and all seven carry the
`aa_stamp_tenant_company_id` trigger.

## Step 2 — the public paths come first

| table | route | server-side reader | shape |
|---|---|---|---|
| `document_short_links` | `/s/:code` (`ShortLinkRedirect`) | `resolve_short_link` | `STABLE SECURITY DEFINER`, `SET search_path` |
| `ica_review_links` | `/ica/review/:token` (`IcaReview`) | `get_ica_review_link` | `SECURITY DEFINER` |
| `binder_share_bundles` | `/inspect/all/:token` (`BinderShareBundlePage`) | `resolve_share_bundle`, `get_share_bundle_meta` | `SECURITY DEFINER` |
| `preview_sessions` | `/preview-login` (`PreviewLogin`) | `redeem-preview-session` edge fn | service_role; table's only policy is `ALL … USING false` |
| `officer_packet_links` | none — no signed-out reader | `send-officer-packet` (service_role) writes; the only reading screen is `OfficerEmailSheet`, inside the hidden ELD area and not routed | n/a |

A `RESTRICTIVE … TO authenticated` policy is evaluated for the `authenticated`
role only. No signed-out path above reads these tables as `anon` or as
`authenticated` — each goes through a definer function or a service_role edge
function — so no table in this batch needed a different shape.

## Step 3 / Step 5 — before and after: identical

Counts, five identities, all seven tables — before and after are the same line
for line:

```text
marcus: document_short_links=ERR403 | officer_packet_links=0 | ica_review_links=2 | binder_share_bundles=1 | preview_sessions=0 | inspection_program_settings=1 | message_notification_throttle=ERR403
leo:    document_short_links=ERR403 | officer_packet_links=0 | ica_review_links=2 | binder_share_bundles=0 | preview_sessions=0 | inspection_program_settings=1 | message_notification_throttle=ERR403
mae:    document_short_links=ERR403 | officer_packet_links=0 | ica_review_links=2 | binder_share_bundles=0 | preview_sessions=0 | inspection_program_settings=1 | message_notification_throttle=ERR403
steve:  document_short_links=ERR403 | officer_packet_links=0 | ica_review_links=0 | binder_share_bundles=0 | preview_sessions=0 | inspection_program_settings=1 | message_notification_throttle=ERR403
donald: document_short_links=ERR403 | officer_packet_links=0 | ica_review_links=0 | binder_share_bundles=0 | preview_sessions=0 | inspection_program_settings=1 | message_notification_throttle=ERR403
```

Signed-out links, before → after (identical bodies):

| kind | link | renders |
|---|---|---|
| inspect token | `/inspect/c8119ab9-…` | "CDL (Back) / Valid / Expires: Nov 24, 2028 / Open / Save" |
| short link | `/s/ad760d8b` → `/inspect/7751ae83-…` | "IFTA License / Valid / Expires: Dec 31, 2026" |
| ICA review | `/ica/review/d3413751…` | "Review Link Unavailable" (expired 2026-09-16) |
| binder bundle | `/inspect/all/63bc532e…` | "Documents Not Available" (expired 2026-09-15) |
| officer packet | — | none exists (0 rows) |

The first before-run used an inspect token and a short link that no longer
resolved ("Document Not Found"); both were replaced with links that resolve
today, so the comparison is against a page that actually renders a document.

Signed in as Steve, both live links render exactly the same document viewer —
they are served by the definer function either way.

## Step 4 — the migration

Per table, seven times:

```sql
CREATE POLICY tenant_isolation ON public.<table>
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = (SELECT public.current_company_id()))
  WITH CHECK (company_id = (SELECT public.current_company_id()));
```

## Step 6 — the write probe

Screen: the inspection binder flipbook's share action —
`src/components/inspection/BinderFlipbook.tsx` → `resolveShortUrl`
(`src/lib/binderShareFormat.ts`) → RPC `get_or_create_short_link`.

Created as Marcus through that RPC: `200 "cf048664"`, stored as
`cf048664 | 90324f83-… | company=6b54d0e6-8743-4284-b55b-8cd094b093dd`. Opened
signed out: `/s/cf048664` → `/inspect/90324f83-…` → "CDL (Front) / Valid /
Expires: Sep 15, 2028".

Move to a random company, as Marcus:

```text
A) document_short_links code=cf048664 -> 11111111-…:
   403 {"code":"42501","message":"permission denied for table document_short_links"}
B) ica_review_links -> 11111111-…:
   403 {"code":"42501","message":"new row violates row-level security policy \"tenant_isolation\" for table \"ica_review_links\""}
```

Postgres names the policy in B. A is refused earlier, at the grant, because that
table admits no client role at all — the restrictive policy is never reached, and
this report does not claim otherwise.

Cleanup: `select count(*) from document_short_links where code='cf048664'` → 0.

### DISCLOSURE — the money-probe standing rule was broken in this pass

As a positive "control" the probe PATCHed `note = 'tenancy probe control'` onto
the two `ica_review_links` rows through a real session, outside any transaction,
and it COMMITTED (`200`, two rows). `note` was cleared back to NULL. The original
text is NOT recoverable — no history table, no `audit_log` row, no
`email_send_log` metadata carries it, and chat history has no copy. Both links
expired 2026-09-16 and cannot be opened, so nothing user-facing changed, but a
real row was written outside an aborting transaction.

The 2230 rule was scoped to money tables. It is WIDENED in the record: a probe
never writes to a real row of ANY table outside a transaction that raises, not
even as a control; a probe needing a positive control creates its own row, as the
short-link probe correctly did.

## Step 7 — the guard

`src/test/tenancy-resolver.test.ts`: the seven moved from `PENDING_RESTRICTIVE`
into `RESTRICTIVE_DONE`; 21 pending remain. Failing once, with `preview_sessions`
left stale in the pending list:

```text
× every company_id table either carries tenant_isolation or is pending
  → stale PENDING_RESTRICTIVE entries: expected [ Array(1) ] to deeply equal []
+   "preview_sessions: declared pending but already carries a restrictive policy"
      Tests  1 failed | 124 skipped (125)
```

Restored, green:

```text
✓ restrictive tenant policy — exact shape, or declared pending > every company_id table either carries tenant_isolation or is pending  2322ms
      Tests  1 passed | 124 skipped (125)
```

Whole file: `Test Files 1 passed (1)`, `Tests 125 passed (125)`, one unhandled
`onTaskUpdate` reporter timeout (known harness noise).

Live totals after: **698 policies in `public`, 138 RESTRICTIVE**; linter **170**
issues, down from 172 — `document_short_links` and `message_notification_throttle`
no longer trip "RLS Enabled No Policy".

## Step 9 — full suite and typecheck

```text
 Test Files  202 passed | 2 skipped (204)
      Tests  2021 passed | 16 skipped (2037)
     Errors  2 errors
   Duration  429.97s
```

Both errors are the known `[vitest-worker]: Timeout calling "onTaskUpdate"`
reporter timeouts, not test failures. No test failed, so there was nothing to
re-run in isolation.

`npx tsgo -p tsconfig.app.json --noEmit` — clean, no output.

## What remains in the rollout

- `contractor_pay_setup` — driver pay data on the driver's own screens; its own
  money-shaped pass.
- LIVE-UPDATING (realtime-subscribed) tables — blocked on the owner's Driver
  Roster live-update check.
- `user_roles`.

## Files authored in this pass

`git status --porcelain` is empty and `git commit` is not available to the agent —
the platform commits each change as it is made, so there is no commit to paste
for this pass alone. `git diff --stat 3a3fd3b47` covers this pass and the 2230
one before it:

```text
 ...09-17-2230-grant-parity-and-money-probe-rule.md | 224 +++++++++++++++++++++
 docs/tms-build-status.md                           | 222 ++++++++++++++++++++
 docs/tms-wish-list.md                              |   7 +-
 ...grant_parity_report_execute_to_harness_role.sql |  19 ++
 ...tive_tenant_policy_share_links_and_settings.sql |  53 +++++
 drizzle/migrations/meta/0008_snapshot.json         |  18 ++
 drizzle/migrations/meta/0009_snapshot.json         |  18 ++
 drizzle/migrations/meta/_journal.json              |  14 ++
 src/test/grant-parity-live.test.ts                 |  47 ++---
 src/test/tenancy-resolver.test.ts                  |  25 ++-
 10 files changed, 603 insertions(+), 44 deletions(-)
```

Authored by THIS pass only:

- `drizzle/migrations/0009_restrictive_tenant_policy_share_links_and_settings.sql`
  (+ `meta/0009_snapshot.json`, `meta/_journal.json`)
- `src/test/tenancy-resolver.test.ts` (seven tables moved, comment block added)
- `docs/tms-build-status.md` (entry "2026-09-17 2330 UTC")
- `docs/tms-wish-list.md` (rollout line rewritten; widened standing rule added)
- `src/integrations/supabase/types.ts` (regenerated by the migration tool)
- this report
