# Close the PostgREST embed guard's blind spots

Reported issue 1 has no live source. The bad embed in `InspectionComplianceSummary.tsx` was corrected on Aug 20, 2026 (commit `006a397d`); the reported Postgres error predates that fix, and nothing matching it appears in the retained database logs. It is closed as stale.

What the investigation did expose is that the guard which should have caught it has two holes, and one of them is hiding a real defect right now.

## Census, measured before any change

Non-literal `.select()` calls the guard currently walks past:

| Scope | Variable / expression selects | Template selects with `${}` | Literal selects | Files affected |
| --- | --- | --- | --- | --- |
| `src/` | 21 | 2 | 594 | 14 |
| `supabase/functions/` | 3 | 0 | 324 | 3 |

The `src/` figures are what the guard reports as `skipped` today. The `supabase/functions/` column is not scanned at all — the guard's root is `src/`.

## Extending the scan to edge functions surfaces one wrong embed

Running the guard's own column check across `supabase/functions/` validates 776 column references and produces exactly one failure:

`supabase/functions/send-notification/index.ts:406`

```ts
const { data: opRow } = await supabaseAdmin
  .from('operators')
  .select('user_id, email')
  .eq('id', operatorId)
  .maybeSingle();
```

`public.operators` has no `email` column — confirmed against the live catalog. PostgREST rejects the whole request with `42703`, the error is discarded (`const { data: opRow }`), and `driverEmail` silently becomes `null`. The consequence is narrow but real: the `ica_signing_link_routed` audit entry records a null driver email on every ICA send. The routing itself is unaffected. Driver email lives on `applications`, reached through `operators.application_id`.
