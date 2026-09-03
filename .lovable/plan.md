# Equipment-hold fail-open: findings (read-only)

Nothing was changed. Every claim below names the query or file that produced it.

## 1. What the hold actually does

`src/lib/settlementRun.ts:289-293` sets `equipmentOutstanding`, which is passed into
`input.equipmentOutstanding` (line 326) and consumed by `computeSettlement`
(`src/lib/settlementEngine.ts:385`, `587-598`):

```ts
const equipmentExposure = equipmentOutstanding ? num(settings.equipment_value_per_driver) : 0;
const rmBalanceAfter = round2(rmBalance + rmContribution);
const coverage = round2(netAmount + rmBalanceAfter - equipmentExposure);

if (isDeparting && coverage < num(settings.hold_buffer)) {
  status = 'held';
  holdReason = equipmentOutstanding
    ? 'Payment held pending return of company equipment.'
    : 'Payment held while the driver is departing and coverage is below the buffer.';
}
```

It does not block the run, does not add a deduction, and does not change any dollar
figure. It only shifts the coverage test, and only for a **departing** driver: the
settlement is still computed in full, and what changes is `status = 'held'` versus
`paid`, i.e. whether payment goes out.

Live values (`select ... from settlement_settings`): `equipment_value_per_driver`
= **1200.00**, `hold_buffer` = **500.00**, `minimum_net_pay_threshold` = 100.00.

Monetary consequence of a wrongly-false value: exposure drops from 1200 to 0, so
coverage rises by 1200. A departing driver whose true coverage sits anywhere in
[-700, +500) is flipped from `held` to `paid` and the settlement is released. The
loss is bounded by the un-returned equipment, i.e. up to **$1,200 per driver**, plus
whatever net pay is disbursed that would otherwise have been the lever to get the
equipment back. Non-departing drivers are unaffected — `isDeparting` gates the
whole branch.

## 2. How often it could fire

Live catalog (`pg_proc`) has exactly one `public.equipment_outstanding(uuid)`,
`SECURITY DEFINER`, matching the newest and only migration defining it,
`supabase/migrations/20260831150358_...sql:150-168`:

```sql
REVOKE ALL ON FUNCTION public.equipment_outstanding(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.equipment_outstanding(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.equipment_outstanding(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_outstanding(uuid) TO service_role;
```

Live ACL confirms: `authenticated=X`, `service_role=X`, no anon.

A management or owner user running a settlement in the browser is `authenticated`,
so **they do hold EXECUTE**. The harness `permission denied` came from a psql role
outside those grants; it is not the production path. So the fail-open is currently
**latent** in the sense that the RPC normally succeeds — it becomes live on any
transport failure, network error, PostgREST error, JWT expiry mid-run, or a future
grant change, none of which are observable at the call site.

Exposure today (live counts): 0 operators with `is_departing`, 0 settlements with
status `held`, 1 settlement total, 0 open `equipment_return_confirmations`. Note the
last one: with zero confirmations on file, the correct answer is TRUE for every
operator, so any silent failure is guaranteed to be wrong, not just possibly wrong.

## 3. Other discarded errors in the settlement path

Direction is stated as: releases a guard / pays more / pays less.

`src/lib/settlementRun.ts`

- **289-293** — `catch { equipmentOutstanding = false }` and the `{ data }`
  destructure discarding `error`. Fallback `false`. **Releases a guard.**
- **102-122 / 140, 150, 153, 160, 208, 216, 221, 224, 230-232, 242, 254, 267** —
  the five `Promise.all` results plus the later fetches are consumed only as
  `res?.data ?? []` / `?? null`; no `error` is inspected anywhere. A failed `loads`
  query yields zero loads (**pays less**, or drops the operator from the population
  entirely); a failed `pay_policies` query yields a null company policy (rate
  resolution falls back — **direction depends on the fallback rates**); failed
  `settlement_line_items` yields empty exclusion sets, so already-settled items can
  be charged again (**pays more / double-charges**); failed `fuel`/`deductions`/
  `advances` yields no deductions (**pays more**).
- **271-284** — missing R&M row is treated as no deposit: `rmShortfall = 0`
  (**pays more**, no R&M deduction taken) and `rmBalance` absent from coverage.
- **286** — `carryForward[operatorId] ?? 0`: a lost negative carry-forward
  **pays more**.
- **417-425** — `store_settlement_run` is the one place that does it right:
  `if (error) throw error`.

`src/lib/settlementEngine.ts` — pure computation, no I/O. Its `?? ` uses are
defaults on optional inputs (`equipmentOutstanding = false` at 385 is the same
release-a-guard default, reached whenever the caller omits the field).

`src/lib/dispatchSettlementRun.ts` — `settRes.error` / `loadRes.error` are thrown at
733-734, and the RPC checks `error` at 411 and 542. The gather block at 120-159
(`rateRes.data ?? []`, `policyRes.data ?? null`, `loadRes.data ?? []`,
`dedRes.data ?? []`) does not, so a failed query yields a smaller or unrated
settlement (**pays less**), and a missing rate row is the same shape.

`src/lib/dispatchSettlement.ts` — pure; its `??` are field defaults on already-read
rows, no error discarding.

So: the equipment hold is the only fallback in this path that **releases a guard**.
The rest fail toward paying less or, in the exclusion-set and deduction cases,
toward paying more — different severity, still real.

## 4. Is this systemic

`rg` over `supabase/functions/**/*.ts` finds **435** `const { data ... }`
destructures (the wish list's 246 is an undercount or an older snapshot). Filtering
those same lines for money/guard vocabulary (settlement, charge, deduction, invoice,
deposit, advance, policy, rate, hold, load) gives **15** in the edge functions.

The concentration is not in the edge functions. It is in the client-side settlement
gather described in section 3, where a single function discards the error on every
one of its ~12 reads. So: not one bad line, and not 246 equally bad ones — it is a
**property of `gatherSettlementRun` specifically**, which is the worst possible place
for it, plus a thin scatter elsewhere.

## 5. What the correct behaviour is (stated, not implemented)

When `equipment_outstanding` cannot be determined, the settlement run must **fail
loudly and refuse to produce a settlement for that operator** — not default either
way. Concretely:

- Read `error` as well as `data` and throw on it; keep the `catch` only to re-throw
  with context. No `catch {}`.
- A non-boolean `data` (null/undefined) is also "cannot be determined" and must
  throw, not compare-to-false.
- Defaulting to TRUE instead would be safer than today but is still wrong: it would
  invent a hold on evidence nobody checked, and a hold is a claim about the physical
  world that must be traceable to a row.
- The same rule applies to the rest of `gatherSettlementRun`: every read that feeds
  a dollar figure or an exclusion set must throw on error. An empty result set that
  came from a failure is indistinguishable from a true empty, and both directions
  (underpay, double-charge) are unacceptable in a settlement.
- The engine's `equipmentOutstanding = false` default at `settlementEngine.ts:385`
  should become a required field so a caller cannot omit it silently.

Sequencing note: fixing the RPC line alone converts a silent wrong payment into a
visible run failure, which is the right trade. Fixing the other reads in the same
pass is what makes the run trustworthy rather than merely noisier.
