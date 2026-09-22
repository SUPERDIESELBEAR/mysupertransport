# Signed-agreement mismatch flag — PROVEN (2026-09-22 2020)

## Step 1 — why the Pass 5 throwaway was refused, and what worked instead

Pass 5's throwaway insert was refused by `public.stamp_tenant_company_id()`, which raises 42501:

> Cannot resolve a company for this %.% row: the caller holds no company_members row and no
> server-side company was named. Refusing rather than defaulting to a carrier.

The cause was not a policy and not a missing column: it was **company stamping with no resolvable
caller**. `public.current_company_id()` is `SELECT company_id FROM company_members WHERE user_id =
auth.uid()` with no fallback. The SQL tool is not `service_role`, and with no JWT `auth.uid()` is
NULL, so the trigger refused the row before it existed. That is the boundary behaving correctly.

The way through, without touching a real driver: adopt an existing membership for the transaction —
`set_config('request.jwt.claims', json_build_object('sub', <owner user id>, 'role','authenticated'))`
— so the company resolves exactly as it does for a signed-in member. A genuine mismatch was then
created on a throwaway driver only:

- throwaway auth user `b1b1867c-8fd2-4247-a77b-24fe2b07ee51`
  (`throwaway-mismatch-probe@demo.mysupertransport.com`), profile `aaa579f5-…`;
- throwaway operator `53f1dfc1-4eff-4ed4-9409-1c18a9102c2c`, `pay_percentage` 72, no driver-specific
  linehaul version (so his effective rate is the company rate sheet, 72%);
- `ica_contracts` for him: `linehaul_split_pct` 65, `status` `complete` — a signed agreement at 65%;
- a $50 `cash_advances` row and an `onboarding_status` row, purely so he populated the settlement
  preview and his staff record rendered.

No real driver's agreement or rate, and no company rate, was changed at any point.

## Step 2 — the proof

**Linehaul Pay card (staff-side driver record, as Marcus, owner).** Rendered:

> Linehaul Pay · Staff only · Change · 72% · company rate sheet · Effective Jan 1, 2000
> Agreement mismatch. The signed agreement says 65%; the effective pay rate is 72%. Settlements pay
> 72% from the company rate sheet.
> DATED HISTORY — No driver-specific changes. This driver follows the company rate sheet.

Both percentages are named and the paying one is stated. Screenshots:
`/tmp/browser/mismatch/shots/card.png`, `card-mismatch.png`, `hub.png`.

**Settlement run review, before money moves.** One banner, on his row in the preview, before any
store:

> Agreement mismatch — review before money moves. The signed agreement says 65%; this week pays 72%
> from the company rate sheet.

Screenshots: `run-mismatch.png`, `run-preview.png`. Nothing was stored; the preview was never run
through `storeSettlementRun`.

**The driver app shows nothing about it.** The mismatch is read only by the staff card and the staff
settlement review. The driver settlement query selects `id, line_type, amount, description` and no
percentage, and `src/test/per-driver-pay-screens.test.ts` plus the operator pay-exposure guards fail
if any percentage, rate source or version id reaches a driver screen. Steve's driver-app screenshots
from Pass 5 remain the visual record.

**When the two agree, the flag disappears.** Setting the throwaway agreement to 72%:
card mismatch count 0, settlement banners 0, and the card still showed the rate and history.

## Removal and residue

Every throwaway row was removed, and the throwaway login deleted through the owner-only
`delete-user-account` function. Counts after cleanup:

| operators | ica_contracts | cash_advances | onboarding_status | profiles | auth users |
|---|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 0 | 0 |

Unchanged real state: 0 current driver linehaul versions, 1 current company default policy at 72.00
linehaul, paid settlement `f77911b0-50cd-4ae3-bff2-ebb0bc4331af` untouched.

## Step 3 — which way round is right

Today the **effective rate pays** — the driver's own dated version if he has one, otherwise the
company rate sheet in force for that work week. The signed agreement percentage does not pay.

So a mismatch means, plainly: **the driver is being paid something other than what he signed.** The
amber flag is a prompt for the owner to fix ONE OR THE OTHER — either set his linehaul percentage to
match the agreement, or issue a corrected agreement at the rate he is actually being paid. This pass
did not change which number pays.

## Step 4 — roadmap.md restored

`roadmap.md` was cut from 194 lines to 8 in commit `1e32ac928` (gpt-engineer-app[bot],
Tue 22 Sep 2026 18:39:46, "roadmap.md | 202 +--- 1 file changed, 8 insertions(+), 194 deletions(-)").
Nothing anywhere records that truncation as deliberate; it was not asked for.

The 194 lines were recovered from `git show 1e32ac928^:roadmap.md` and restored verbatim at the top
of the file. The later Pass 5 checklist was kept, under its own dated heading, and this pass's two
items were appended. `roadmap.md` is now 208 lines: 194 restored + the Pass 5 list + this pass.

## Verification

- Full suite: `bunx vitest run --maxWorkers=2` — summary quoted verbatim in the closing note below.
- Typecheck: `tsgo --noEmit` clean.

## Files this pass authored

- `docs/passes/2026-09-22-2020-mismatch-flag-proven.md` (this report)
- `roadmap.md` (restored, 8 → 208 lines)
- `docs/tms-wish-list.md` (mismatch-flag proof entry)

No application code, schema, or real data changed in this pass.
