# Per-driver pay — Pass 2 of 5: version the company pay policy

2026-09-22 14:45 UTC. BUILD MODE. Option (c), chosen by the owner. Gate from Pass 1 lifted: a second
policy version may now exist.

Nothing in the prompt contradicted the live system, so no stop was needed.

## What this pass changed

**1. The one-default rule now applies to CURRENT versions only.**

```
CREATE UNIQUE INDEX pay_policies_single_company_default
  ON public.pay_policies (company_id, is_company_default)
  WHERE (is_company_default AND (effective_to IS NULL));
```

One current default per carrier; any number of closed ones. The undo is written in the migration.

**2. A pay policy version is append-only (`guard_pay_policy_append_only`, BEFORE UPDATE OR DELETE).**

- Frozen on an existing row: all ten percentages (`linehaul_pct`, `fsc_pct`, `detention_pct`,
  `layover_pct`, `tonu_pct`, `stopoff_pct`, `lumper_reimbursement_pct`, `per_ton_pct`, `loadout_pct`,
  `other_accessorial_pct`) plus `charge_pay_classes`, `effective_from`, `effective_date`,
  `company_id`, `is_company_default`, `created_at`, `created_by`. A new rate is a new version.
- The only date change allowed is setting `effective_to` on the **current** version (NULL → a date),
  and only with `pay_policy.change`. A closed version can never be re-opened or back-dated.
- `fuel_discount_passthrough`, `name`, `description`, `is_active` stay **in-place** edits requiring
  `pay_policy.change` — P40: the Settlement Settings toggle must keep working, and it does.
- DELETE is refused for everyone, the owner included. Past settlements name the version they paid on.
- No `auth.uid() IS NULL` pass-through for service_role: no edge function writes this table, so a
  privileged in-place edit would be a defect too. A migration that must move a rate uses
  `DISABLE TRIGGER` in the same transaction, deliberately and visibly.

**3. One owner-only RPC opens a version: `open_pay_policy_version(_effective_from, _rates, _name,
_description)`.**

Why one statement rather than two client writes: with the index re-scoped to current versions, a new
current version **cannot** be inserted while the old one is still current. Two writes would leave the
carrier, for the moment between them, with **no current pay policy** — and a settlement resolving
that moment would find zero versions and stop. The RPC closes the old version the day before the new
one starts and opens the new one in the same statement, inheriting every rate not named in `_rates`.
Owner only (`pay_policy.change`), no back-dating, rate keys checked against an allowlist. EXECUTE to
`authenticated` and `service_role`; revoked from PUBLIC and `anon`.

## A defect this pass found and fixed before it shipped

The Pass 2 probe refused to open a version at all: `open_pay_policy_version` stamped `auth.uid()`
into `created_by` / `updated_by`, but both columns reference `profiles(id)`, and a profile id is not
an auth user id. Every attempt died on `pay_policies_updated_by_fkey` (23503) — the function could
never have worked. Migration **0039** re-creates it using `public.current_profile_id()`, which is
what every other writer on this table already uses. This is exactly what the rehearsal is for: the
first real owner-side attempt would otherwise have failed in front of Marcus.

## Proof, with real sessions, inside a transaction that raised

Marcus Mueller (owner), Mae Lauron (management), Leo Wallace (dispatcher).

| # | Attempt | Result |
|---|---|---|
| 1 | a second **current** default inserted | REFUSED 23505 `pay_policies_single_company_default` |
| 2 | Marcus opens v2 (82% from 2026-09-30) | ACCEPTED — v1 closed at 2026-09-29, v2 current from 2026-09-30 |
| | v2's inherited rates | detention 100, lumper 100, tonu 72, fsc 72, per_ton 72, loadout 72 — unchanged |
| 3 | resolver on 2026-09-22 / 09-29 | v1, linehaul **72** |
| 3 | resolver on 2026-09-30 / 11-29 | v2, linehaul **82** |
| 3b | rows matched per date | **1 / 1 / 1** — never two, never zero |
| 4 | a closed version's percentage changed | REFUSED 42501 append-only, naming `linehaul_pct` |
| 4c | a closed version re-opened (`effective_to = NULL`) | REFUSED 42501 already closed through 2026-09-29 |
| 4b | the **current** version's percentage edited in place, by Marcus | REFUSED 42501 append-only |
| 5 | Mae sets `effective_to` | REFUSED 42501 only the owner changes pay policy |
| 5 | Mae calls `open_pay_policy_version` | REFUSED 42501 |
| 5 | Leo sets `effective_to` | REFUSED 42501 |
| 6 | Marcus deletes the current version | REFUSED 42501 never deleted |
| 6 | Marcus deletes the closed version | REFUSED 42501 never deleted |
| 7 | Marcus toggles the fuel pass-through on, then off | SAVED both ways, **2 → 2 versions** (no new version) — P40 intact |
| 7b | name / description / is_active in place | SAVED |
| 8 | Marcus opens a **back-dated** version | REFUSED 22007 — a past work week keeps the rate in force for it |
| 8b | Marcus names an unknown rate `linhaul_pct` | REFUSED 22023 |

Two earlier runs of this same probe were **red** on rows 4b, 5 and 6 (an in-place edit and a delete
accepted, management and dispatch silently matching zero rows instead of being refused). Those are
the lines the guard now closes; they are recorded here because the outcome above only means something
next to them.

## Proof nothing moved (after rollback)

- `pay_policies`: **1** version, **1** current default, linehaul **72.00**, `effective_from`
  2000-01-01, `effective_to` NULL, `effective_date` 2026-08-18 untouched.
- Index present in its new form (current versions only).
- Settlement `f77911b0-50cd-4ae3-bff2-ebb0bc4331af`: **paid, gross 327.94, net 327.94, 1 line**.
- Dispatch verdicts: detention 100, lumper 100, tonu 72.
- Steve Figueroa: **72**; all **157** driver records still 72. His forecast unchanged (0 forecast
  loads; the forecast reads `operators.pay_percentage`, untouched by this pass).

## Step 5 — not run

This pass finished at 14:45 UTC, **before 15:05**, so today's idle-operator job had not run yet and
counting today's `operator_idle` notifications would prove nothing. Stated rather than skipped
silently.

## A finding raised, not silenced

`open_pay_policy_version` has **no caller** — the company pay policy screen is Pass 3. The
uncalled-function guard caught it, correctly. It is allowlisted with `AWAITING` and the ceiling
raised by exactly one, because the RPC genuinely has to exist first: it is the only way a second
version can be created at all. The entry says to remove it when the screen lands; it is not a licence
to leave the function unreachable past Pass 3.

## Files this pass authored

- `drizzle/migrations/0038_pay_policy_versioning_append_only.sql`
- `drizzle/migrations/0039_open_pay_policy_version_profile_attribution.sql`
- `src/integrations/supabase/types.ts` (regenerated)
- `src/test/function-reachability.test.ts` (allowlist entry + ceiling)
- `docs/passes/2026-09-22-1445-per-driver-pay-pass-2.md`
- `docs/tms-build-status.md`, `docs/tms-wish-list.md` (records)

Nothing else is deployed: this pass is database-only plus one test file. Confirmed by re-reading the
live catalog — the index definition, the trigger and the RPC signature all came back from the
database itself, not from the migration text.
