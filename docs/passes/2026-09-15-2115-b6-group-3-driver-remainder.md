# B6 Group 3 — the driver-written remainder (31 tables)

Build mode. 2026-09-15 21:15 UTC. Immutable: append only.

## 1. The list, from the live catalog

88 tables lacked `company_id`, 29,817 rows. Classified: 18 GLOBAL (997 rows),
8 DEFERRED content (318), B7 logs 4 tables (22,760), B8 token/share 7 tables
(1,004), leaving 51 candidates / 4,738 rows. 31 of the 51 are driver-written or
driver-reachable; those are this pass. `notifications` (10,827 rows) stays in B7.

Confirmed present as expected: messaging set, service-library set, `forecast_*`,
`contractor_pay_setup`, the person-owned preference tables. `preview_sessions`
(119 rows) and `passenger_authorizations` were NOT migrated here — neither is
driver-written; they fall to a later batch.

The two Group 2 findings are closed: `documents` (0 rows) and
`ica_driver_acknowledgments` (9 rows) have a live driver INSERT policy and NO
current code writer. Both were stamped: a live INSERT policy is a live write
path, and stamping it is what prevents an unscoped row later.

## 2. The person-owned tables

Eight of the eleven named in the record are here (`notifications` is B7;
`operator_documents`/`document_acknowledgments` were done in the truck-owner
pass). The resolver's three sources cover staff, drivers and truck owners. The
live check — the one that caught the truck-owner lockout — returned ZERO users
holding rows in any of the nine person-owned tables who resolve to none of the
three. `message_notification_throttle` has no `user_id`; it keys on
`sender_id`/`recipient_id`, and the guard was corrected to read `recipient_id`.

## 3. Shapes

28 tables: nullable -> backfill -> NOT NULL, no surviving default, FK
`ON DELETE RESTRICT`, generic `aa_stamp_tenant_company_id`.

3 tables — `load_status_history`, `load_change_history`,
`dispatch_status_history` — are written by SECURITY DEFINER logging triggers with
NO `auth.uid()`. The resolver-based stamp would have refused every status change.
Each derives from its PARENT row: `stamp_company_from_load()` (from `loads`) and
`stamp_company_from_operator()` (from `operators`), SECURITY DEFINER,
`search_path = public, extensions`, EXECUTE revoked from PUBLIC, anon,
authenticated at creation.

Unique indexes were read from `pg_indexes`; none of the 31 carried a global
unique key needing rescoping.

Service-role writers fixed BEFORE the column landed: `manage-group-thread`,
`send-operator-broadcast`, `send-osas-to-operator`, `invite-operator`,
`create-test-operator`, `provision-demo-driver`, `provision-test-driver`,
`reset-demo-driver`. `_shared/tenancy.ts` gained `companyIdForAnyUser()` and
`companyIdForOperator()`, both fail-closed. `send-operator-broadcast`'s recipient
insert was a bare await — the invite defect's shape — and is now fatal.

27 client insert paths across 19 files wrapped in `insertPayload`.

## 4. Verification

Structural, one query: all 31 tables `NOT NULL`, no default, FK RESTRICT, zero
null or orphan `company_id`.

Steve Figueroa, real driver session — reads on `notification_preferences`,
`messages`, `onboarding_status`, `service_resource_views`; inserts of a
notification preference, a forecast load, a forecast expense, a service-resource
view and a message. All 201. Spoofed `company_id` overwritten: one query over all
six scratch rows returned 6 of 6 carrying the live carrier id.

Truck owner `24ee1b9e-…` — read `ica_contracts` and `onboarding_status`, inserted
notification preferences bare and spoofed, both 201. His spoofed row was cleaned
before its stamped value was asserted separately; the driver query above is what
proves the overwrite.

No driver or owner operation failed.

Cleanup: all scratch rows gone. `messages` 18, `onboarding_status` 154,
`notification_preferences` 11. Two rows the driver's own RLS would not delete
were removed with service role.

## 5. A "known flake" hiding real failures

Four consecutive runs failed on `(EAUTHQUERY) auth_query secret check timed out`,
treated as a known pooler flake in earlier passes. Collapsing 93 psql spawns into
two revealed two GENUINE errors beneath it: `column x.user_id does not exist`
(`message_notification_throttle`) and `operator is not unique: text || "char"`
(`confdeltype` needs `::text`). `psql()` now retries only on that exact
connection string; any Postgres `ERROR:` is rethrown.

Also: a bare `npx tsgo --noEmit` checks nothing here — the root tsconfig has
empty `files`. The real command is `npx tsgo -p tsconfig.app.json --noEmit`.

## 6. Counts and suites

Policies 560 (unchanged). Linter 172, no new distinct finding. 139 `company_id`
columns in `public`. Typecheck clean.

`tenancy-resolver` 97 passed. `definer-live-catalog`, `definer-search-path`,
`definer-fail-open`, `grant-parity-live`, `policy-grant-parity`,
`notification-isolation`, `operator-pay-exposure` — 55 passed.

The two new stamp functions initially pinned `search_path=public` only, which
`definer-search-path` and `definer-live-catalog` caught; they were repinned to
`public, extensions` rather than allowlisted.

## 7. Remaining

B6: 20 of the 51 candidates are not driver-written and move to later batches.
Sequence: B7 logs (4 tables / 22,760 rows), B8 token/share (7 / 1,004), 8
DEFERRED content tables (318) awaiting the product-versus-carrier decision, 18
declared GLOBAL.

CROSS-CARRIER ISOLATION REMAINS UNPROVEN. One carrier exists; every probe shows
the column is server-controlled, not that a second company cannot see it.
