# PEI restart and attribution — Marquis Bowie (2026-09-23 13:30 UTC)

## Why this pass exists

A previous-employer (PEI) request for Marquis Bowie was created and sent on 5 Aug 2026 to
`MaddoxB@schneider.com`, then deleted. The deletion took its event history with it and left the
application marked `pei_status = in_progress` with a 4 Sep deadline and **no request behind it**.
Nothing in the system recorded who created, sent or deleted it. William Westbrook's application
shows the same shape (`complete`, no requests).

The owner approved: rebuild Bowie's three checks unsent, and close the two holes that let a
request disappear without trace.

## Part 1 — Bowie's three checks, rebuilt unsent

Created from his application's own employment history (nothing typed by hand), all
`status = 'pending'`, company stamped `6b54d0e6` (SUPERTRANSPORT):

| Employer | Contact | Employment | DOT-regulated |
| --- | --- | --- | --- |
| Schneider | maddoxb@schneider.com | 12/2023 – 07/2026 | yes |
| Job Corps Little Rock | support@focushr.net | 02/2022 – 09/2023 | no |
| Dassault Falcon Jet | hortondassault@falconjet.com | 07/2008 – 09/2020 | no |

No email was sent. The status rollup trigger recomputed the application to `not_started`, which
is the truth; the stale `pei_deadline = 2026-09-04` was cleared, because a deadline only exists
once a request goes out.

## Part 2 — attribution and the withdraw rule

Staged migration `20260923132000_pei_request_attribution_and_withdraw.sql` (additive; applies
when this draft is accepted):

- `pei_requests` gains `withdrawn_at`, `withdrawn_by`, `withdrawn_by_name`, `withdrawn_reason`,
  plus a partial index on live rows per application.
- `log_pei_request_audit()` writes `pei_request_created`, `pei_request_status_changed` and
  `pei_request_withdrawn` to `audit_log` with the actor and the employer name as the label.
- `refuse_pei_request_delete()` raises `42501` on any hard DELETE: *"A previous-employer request
  cannot be deleted. Withdraw it instead so the record and its history are kept."*
- `update_application_pei_status()` and `get_pei_queue()` ignore withdrawn rows, so a withdrawal
  cannot leave a false "in progress" behind.

App side:

- `withdrawPEIRequest(id, reason)` replaces `deletePEIRequest`; a blank reason is refused.
- The employer row's delete button now opens *"Withdraw this employer record?"* with a required
  reason; withdrawn rows stay visible in their own **Withdrawn — kept for the record** section
  naming who, when and why.
- `PEIStatusMismatchAlert` on the PEI Q flags every application whose status claims progress with
  no live request — the exact state Bowie's record sat in for seven weeks.
- Sending stamps `sent_by_staff_id` on the record.
- `pei-auto-cadence` skips withdrawn rows.

## Verification

- Typecheck clean.
- Full suite `--maxWorkers=2`: `Test Files 3 failed | 216 passed | 2 skipped (221)`,
  `Tests 6 failed | 2206 passed | 16 skipped (2228)`.
  - 2 failures were the familiar pooler timeout in `dispatch-settlement-schema` and
    `payments-schema`; both files re-ran green (`2 passed`, `48 tests`).
  - 4 failures in `tenancy-resolver.test.ts` are **pre-existing drift, not this pass**:
    `applications` (and ten sibling tables) now carry `company_id` live while the test still
    declares them GLOBAL, and `RESTRICTIVE_DONE` (163) now sits below the live inventory (174).
    This pass touched no `company_id` and no tenancy declaration. It belongs to demo-carrier
    stage 3, whose plan already owns the fixture update.

## Files this pass authored

- `.lovable/drafts/.../migrations/20260923132000_pei_request_attribution_and_withdraw.sql`
- `src/lib/pei/api.ts`
- `src/lib/pei/types.ts`
- `src/components/pei/ApplicationPEITab.tsx`
- `src/components/pei/PEIQueuePanel.tsx`
- `src/components/pei/PEIStatusMismatchAlert.tsx`
- `src/components/pei/sendPEIEmail.ts`
- `supabase/functions/pei-auto-cadence/index.ts`
- `docs/passes/2026-09-23-1330-pei-restart-and-attribution.md`
