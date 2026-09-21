# 2026-09-21 0019 UTC — the five sound gates built; `encrypt-ssn` and `pei-auto-cadence` deliberately deferred

BUILD MODE. Nothing in the prompt contradicted the live system this time — the two
items that did were excluded by the owner before the pass started. Five functions
were changed, all six changed functions deployed, and every claim below is a live
call made after deployment.

Changed: `send-transactional-email`, `send-test-email`, `send-release-note`,
`notify-owner-transfer`, `send-insurance-request`, `decrypt-ssn`.
No migration, no config change, no schema change.

---

## Item 1 — `send-transactional-email`: two paths, nothing else

The false comment at `index.ts:29-31` (claiming `verify_jwt = true` made an
in-function check unnecessary) is gone, replaced by a note saying why the
gateway's JWT check is not a permission: the publishable key IS a valid JWT.

The gate (`index.ts:60-72`), in this order:

1. **internal** — the `Authorization` bearer equals `SUPABASE_SERVICE_ROLE_KEY`.
   No new shared secret was invented; both internal callers already send exactly
   that value, so there is nothing to keep in step. (The `CRON_SECRET` finding in
   the 2352 record is precisely the failure mode a new shared secret invites.)
2. **staff** — `requireStaff(req, { roles: ['owner','management','onboarding_staff','dispatcher'] })`.
   Dispatcher is included because `send-ica-review-link` admits dispatchers and
   forwards their JWT onward.

**Refused, unauthenticated, after the change** (publishable key as `apikey`, no
`Authorization`):

```
POST /functions/v1/send-transactional-email  →  401
{"error":"Unauthorized: missing bearer token","status":401}
```

and with the publishable key AS the bearer — the case both earlier passes
mis-read as "authenticated":

```
→ 401 {"error":"Unauthorized: invalid or expired token","status":401,...}
```

**Legitimate caller still working** (owner session, deliberately bogus template so
no mail is created — probe rule):

```
POST {"templateName":"__no_such_template__","recipientEmail":"nobody@example.invalid"}
→ 404 {"error":"Template '__no_such_template__' not found. Available: pei-request-initial, ...}
```

404 from the registry means the request passed the gate and reached the handler.
A driver's live session on the same call: `403 Forbidden: caller lacks required
staff role`, `requiredAny: ["owner","management","onboarding_staff","dispatcher"]`.

### The nine census call sites — what was proven, and what was not

| Call site | Path | Exercised? |
|---|---|---|
| `src/components/pei/sendPEIEmail.ts:126` | staff | **Not sent** — it mails a previous employer. Proven by equivalence: same staff JWT, same endpoint, and the gate is the first statement in the handler. |
| `src/components/pei/SendTestPEIDialog.tsx:75` | staff | Same. |
| `src/components/equipment/EquipmentAssetSheet.tsx:224` | staff | Same. |
| `_shared/email/send.ts:50-57` (`sendTemplateEmail`, forwards `authHeader`) | staff | Same; its three callers below carry staff JWTs. |
| → `send-ica-review-link` (`requireStaff` incl. dispatcher) | staff | Not exercised — mails a driver. |
| → `send-equipment-return-instructions` | staff | Not exercised — mails a driver. |
| → `send-osas-to-operator` | staff | Not exercised — mails a driver. |
| `send-passenger-auth/index.ts:63,202` (`admin.functions.invoke`, service key `:32`) | internal | **Not exercised.** See below. |
| `pei-auto-cadence/index.ts:168-172` (`Bearer ${serviceKey}`) | internal | **Not exercised.** See below. |

**Plainly: the internal path could not be exercised.** Every route to it either
mails a real person (the probe rule forbids it) or requires the service-role key,
which is not readable on this platform — I cannot mint that bearer myself. What
the gate compares is the same `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` string
those two callers already send, read from the same environment in the same
function. The staff path is proven live; the internal path is proven by
construction only, and that is the one gap in this item.

`pei-auto-cadence` was called anonymously during the sweep and returned
`{"checked":19,"sent":0,"skipped":19}` — it sent nothing, so it did not reach
`send-transactional-email` on that run either.

## Item 2 — `send-test-email`: staff only

`requireStaff(req, { roles: ['owner','management'] })` is now the first statement
in the handler (`index.ts:13-14`), ahead of the `RESEND_API_KEY` read. Single
caller: `src/components/management/EmailCatalog.tsx:1013` (management portal).

```
unauthenticated → 401 {"error":"Unauthorized: missing bearer token","status":401}
driver session  → 403 {"error":"Forbidden: caller lacks required staff role","requiredAny":["owner","management"]}
owner session, {"operator_email":"nobody@example.invalid"}
                → 404 {"error":"No auth user found for nobody@example.invalid"}
```

The 404 comes from the operator lookup, past the gate, with no mail sent.

**OWED, not built here (as instructed):** the QPassport link still goes to a
caller-supplied `to` address (`index.ts:84`) rather than only to the operator on
the record. Until that changes, a signed-in owner or management user can mail a
named driver's QPassport link to any address. The gate narrows who can do it; it
does not fix the contract.

## Item 4 — `send-release-note`: staff only

`requireStaff(req, { roles: ['owner','management'] })` (`index.ts:19-20`). Still
no app caller anywhere — live, now locked, still unused.

```
unauthenticated → 401 {"error":"Unauthorized: missing bearer token","status":401}
driver session, {"title":"x","body":"y"} → 403 Forbidden: caller lacks required staff role
owner session, {}                        → 400 {"error":"title and body required"}
```

The 400 is the handler's own validation: the owner is admitted and no staff
broadcast was sent.

## Item 6 — `notify-owner-transfer`: no longer broken, gate proven both ways

Import moved from `https://esm.sh/@supabase/supabase-js@2.45.0` to
`npm:@supabase/supabase-js@2`, so `auth.getClaims` exists. Before this change
every call threw on a missing method and the outgoing owner's notice never sent.

Probe: a `pending` `owner_transfers` row was inserted server-side naming two
pre-existing throwaway accounts — `from_user_id` = `teststaff@example.com`,
`to_user_id` = `notiftest@example.com`. No real person is a party to it.
(`initiated_by` left NULL — it FKs `profiles(id)`, and neither throwaway has a
profile; `company_id` passed explicitly, as `stamp_tenant_company_id()` demands
of a service-role caller.)

Three live calls on the same transfer id:

```
to_user session (the other party)  → 403 {"error":"Forbidden"}
owner session (not a party at all) → 403 {"error":"Forbidden"}
from_user session (the right one)  → 200 {"sent":false}
```

So `from_user_id === callerId` fires both ways, and it is not a staff check — the
real owner is refused on a transfer he is not part of, which is correct.

**Does the notice actually send?** It reached the mail provider with the correct
recipient and was refused there, not here. `email_send_log` for
`owner-transfer-initiated`:

```
pending  teststaff@example.com
failed   teststaff@example.com
  Resend error [422]: Invalid `to` field. Please use our testing email address
  instead of domains like `example.com`.
```

That is the whole path — claims parsed, gate passed, owner's own address resolved
from `auth.users`, template built, provider called — with the send stopping at the
provider's own refusal of reserved-domain addresses. **Delivery into a real
mailbox was not proven**, because the only recipients safe under the probe rule
are `@example.com` addresses the provider will not accept, and the recipient is
taken from the account, never from the request, so I cannot redirect it.
`{"sent":false}` plus the logged 422 is the honest state.

Cleanup: the probe transfer row and both `email_send_log` rows were deleted; the
row count for that id is now 0. No profile was created, no account was created,
no account was modified.

## Item 7 — the owner added where P1 requires it

**`decrypt-ssn`** (`index.ts:56-67`) gated on `has_role(..., 'management')` alone.
It now checks `management` OR `owner` and refuses with
`Forbidden: management or owner role required`.

```
unauthenticated  → 401 {"error":"Unauthorized"}
publishable key  → 401 {"error":"Unauthorized"}
driver session   → 403 {"error":"Forbidden: management or owner role required"}
owner session, {} → 400 {"error":"application_id required"}
```

"Admitted" is exactly that 400: the role check passed and the handler stopped at
its own missing-argument check. **No real SSN was decrypted**, and no
`ssn_decrypted` audit row was written.

**`send-insurance-request`** (`index.ts:121-122`) now reads
`['owner','onboarding_staff','dispatcher','management']`.

```
unauthenticated   → 401 {"error":"Unauthorized: missing bearer token","status":401}
driver session    → 403 Forbidden: caller lacks required staff role
                     requiredAny ["owner","onboarding_staff","dispatch...]
owner session, {} → 400 {"error":"operator_id required","status":400}
```

---

## The after-state: all fifteen, called anonymously, after deployment

Both columns are live calls made at 0010 UTC. `no-auth` = publishable key as
`apikey` only. `anon-jwt` = publishable key also as the bearer.

| Function | no-auth | anon-jwt | Verdict |
|---|---|---|---|
| `send-transactional-email` | 401 missing bearer | 401 invalid token | **CLOSED this pass** |
| `send-test-email` | 401 missing bearer | 401 invalid token | **CLOSED this pass** |
| `send-release-note` | 401 missing bearer | 401 invalid token | **CLOSED this pass** |
| `notify-owner-transfer` | 401 Unauthorized | 401 Unauthorized | **FIXED this pass** (was throwing) |
| `send-insurance-request` | 401 missing bearer | 401 invalid token | closed; owner added (P1) |
| `decrypt-ssn` | 401 Unauthorized | 401 Unauthorized | closed; owner added (P1) |
| `export-retention-archive` | 401 missing bearer | 401 invalid token | already staff-gated |
| `reset-demo-driver` | 401 missing bearer | 401 invalid token | already staff-gated |
| `send-lease-termination` | 401 missing bearer | 401 invalid token | already staff-gated (P6) |
| `send-return-receipt-pdf` | 401 missing bearer | 401 invalid token | already staff-gated |
| `send-dot-consultant-request` | 401 missing bearer | 401 invalid token | already staff-gated |
| `purge-deleted-operator-documents` | 401 unauthorized | 401 unauthorized | cron-secret / service-key only |
| `download-qpassport` | 400 Missing link token | 400 Missing link token | signed expiring token, by design |
| `encrypt-ssn` | 401 Unauthorized | **400 Invalid SSN — OPEN** | **deliberately DEFERRED** |
| `pei-auto-cadence` | **200 `{"checked":19,"sent":0,"skipped":19}` — OPEN** | **200 — OPEN** | **deliberately DEFERRED** |

Thirteen of fifteen refuse every caller who is not signed in. The two that do not
are open on purpose, for the reasons recorded at 2352 and restated here:

- **`encrypt-ssn` — DEFERRED because `requireStaff` would break the public
  application.** `/apply` and `/apply/ssn` call it with the publishable key; the
  applicant has no session. Its own pass must pick one of: rate-limit it, bind it
  to the application draft (recommended), or move encryption server-side. It
  returns ciphertext only — it stores nothing, reveals no existing SSN, and cannot
  decrypt. The `400 Invalid SSN` above is the gate-free handler rejecting an empty
  body; a real string would have been encrypted, so the probe stopped there.
- **`pei-auto-cadence` — DEFERRED because the cron-secret pattern it would copy is
  itself broken.** `CRON_SECRET` does not exist as a project secret and
  `app.cron_secret` is set nowhere, so seven functions reading it accept only a
  service-role bearer that no cron job sends; `dispatch-scheduled-broadcasts` was
  logging 360 × 403 in six hours on exactly that gate. `pei-auto-cadence` is the
  only job in the group that runs. Gating it before the secret exists converts the
  one working job into the 361st refusal. Its pass is the cron repair.

## Checks

- **Full suite**, `bunx vitest run --maxWorkers=4`, summary verbatim:

  ```
   Test Files  202 passed | 2 skipped (204)
        Tests  2021 passed | 16 skipped (2037)
       Errors  2 errors
    Start at  00:12:29
    Duration  402.96s
  ```

  The 2 errors are both `[vitest-worker]: Timeout calling "onTaskUpdate"` —
  reporter RPC timeouts under `--maxWorkers=4`, not test failures. No test failed.
- **Typecheck**: `bunx tsgo --noEmit -p tsconfig.app.json` — clean, exit 0.
- **Deploy**: all six functions deployed together and confirmed the same way —
  each was called live afterwards and returned the NEW behaviour. Refusals are the
  proof that the new code is running: a stale `notify-owner-transfer` would have
  thrown 500 on `getClaims`, and a stale `send-release-note` would have returned
  400 to an anonymous caller instead of 401.

## What is owed

1. **`send-test-email`'s QPassport recipient** — the link must go only to the
   operator on the record, never to a caller-supplied `to`.
2. **The cron-secret repair** — create `CRON_SECRET`, place it where the jobs can
   read it, and update every cron command; then gate `pei-auto-cadence`. Revives
   scheduled broadcasts, the document purge, cert and inspection expiry,
   idle-operator notices and dispatch rollover. Check `ELD_CRON_SECRET` too.
3. **`encrypt-ssn`** — the owner's choice among the three options above.
4. **`send-transactional-email`'s internal path** — not exercised live; exercise
   it the next time something legitimately mails a safe address through
   `send-passenger-auth` or `pei-auto-cadence`.

## Files authored by this pass

- `supabase/functions/send-transactional-email/index.ts` (gate added, false comment removed)
- `supabase/functions/send-test-email/index.ts` (`requireStaff`)
- `supabase/functions/send-release-note/index.ts` (`requireStaff`)
- `supabase/functions/notify-owner-transfer/index.ts` (client import)
- `supabase/functions/send-insurance-request/index.ts` (`owner` added)
- `supabase/functions/decrypt-ssn/index.ts` (`owner` added)
- `docs/passes/2026-09-21-0019-five-function-gates.md` (this file)
- `docs/tms-build-status.md` (dated entry appended)
- `docs/tms-wish-list.md` (queue updated: five closed, two deferred, cron repair added)
