# 2026-09-18 2155 UTC — the fifteen "any signed-in session" functions, re-checked with imports followed

READ-ONLY PASS. No code, no migrations, no data. Full suite deliberately SKIPPED
(documentation only). Files authored by this pass are listed at the end.

## Method (repeatable)

The 2030 pass grepped each function's own text and missed gates living behind an
import. This pass did three things for every one of the fifteen:

1. `rg -n "^import|requireStaff|requireAuthedUser|getClaims|has_role|user_roles|CRON_SECRET|Authorization|roles:"` on the function's `index.ts` — this shows both the gate AND the import it may come from.
2. Opened `supabase/functions/_shared/email/auth.ts` once and read both exported gates end to end: `requireStaff` (lines 88-140: bearer required → `getClaims` → `user_roles` lookup restricted to the named roles → `403 Forbidden: caller lacks required staff role` when empty) and `requireAuthedUser` (lines 145-167: valid JWT only, no role).
3. Read `supabase/config.toml` for `verify_jwt = false`, because the PLATFORM gate is invisible in the function's source. A function with no auth code and no `verify_jwt = false` entry still requires a JWT — but the **publishable (anon) key is itself a valid JWT**, so "requires a JWT" is NOT a permission. This is the single most important correction in this pass.

## Gates, quoted

| # | Function | Gate, with file:line | Classification |
|---|---|---|---|
| 1 | `decrypt-ssn` | own file: `getClaims(token)` (`index.ts:48`), then `rpc('has_role', {_role:'management'})` (`index.ts:57-60`) → `403 Forbidden: management role required` | STAFF-ROLE GATED — management |
| 2 | `encrypt-ssn` | own file: `if (!authHeader)` (`index.ts:51-56`) — presence of ANY header string; `verify_jwt = false` (`config.toml:14`), no claims check anywhere | **NO GATE** |
| 3 | `export-retention-archive` | `requireStaff(req, { roles: ['management','owner'] })` (`index.ts:81`) → `_shared/email/auth.ts:88` | STAFF-ROLE GATED — management, owner |
| 4 | `purge-deleted-operator-documents` | own file: `x-cron-secret === CRON_SECRET` or bearer === service role key (`index.ts:16-31`) | SECRET GATED |
| 5 | `reset-demo-driver` | `requireStaff(req, { roles: ['management','owner'] })` (`index.ts:83`) | STAFF-ROLE GATED — management, owner |
| 6 | `download-qpassport` | own file: HMAC-SHA256 token `<payload>.<sig>` signed with the service role key, constant-time compared, with an expiry (`index.ts:93-116`) | TOKEN GATED (no session; a valid link reaches exactly one operator's QPassport) |
| 7 | `send-lease-termination` | `requireStaff(req, { roles: ['owner','management'] })` (`index.ts:79`) | STAFF-ROLE GATED — owner, management |
| 8 | `send-insurance-request` | `requireStaff(req, { roles: ['onboarding_staff','dispatcher','management'] })` (`index.ts:121`) | STAFF-ROLE GATED — **owner omitted** |
| 9 | `send-return-receipt-pdf` | `requireStaff(req, { roles: ['onboarding_staff','dispatcher','management','owner'] })` (`index.ts:65`) | STAFF-ROLE GATED — four roles |
| 10 | `send-release-note` | none. No `Authorization` read in the file; not in `config.toml`, so the platform accepts the publishable key | **NO GATE** |
| 11 | `send-transactional-email` | none in code. The file's own comment (`index.ts:29`) claims "verify_jwt = true in config.toml, so Supabase's gateway rejects anonymous callers" — that is FALSE for the publishable key | **NO GATE** |
| 12 | `send-dot-consultant-request` | `requireStaff(req, { roles: ['onboarding_staff','dispatcher','management','owner'] })` (`index.ts:111`) | STAFF-ROLE GATED — four roles |
| 13 | `send-test-email` | none. No `Authorization` read (`index.ts:9-27` goes straight to body validation) | **NO GATE** |
| 14 | `notify-owner-transfer` | intends bearer + `anon.auth.getClaims` (`index.ts:45-52`) then `transfer.from_user_id !== callerId → 403` (`index.ts:75`). The client built at `index.ts:48` is `@supabase/supabase-js@2.45.0`, which has no `auth.getClaims` — the call THROWS on every request | BROKEN GATE (fails closed; see below) |
| 15 | `pei-auto-cadence` | none, and `verify_jwt = false` (`config.toml:34-35`) | **NO GATE** |

## Live evidence

### Outside any session — publishable key, empty body, one call each

```
decrypt-ssn                      401 {"error":"Unauthorized"}
encrypt-ssn                      400 {"error":"Invalid SSN"}                      ← ADMITTED
export-retention-archive         401 {"error":"Unauthorized: invalid or expired token","details":{"cause":"invalid claim: missing sub claim"}}
purge-deleted-operator-documents 401 {"error":"unauthorized"}
reset-demo-driver                401 {"error":"Unauthorized: invalid or expired token",...}
download-qpassport               400 HTML "Missing link token"                    ← reached, token refused
send-lease-termination           401 {"error":"Unauthorized: invalid or expired token",...}
send-insurance-request           401 {"error":"Unauthorized: invalid or expired token",...}
send-return-receipt-pdf          401 {"error":"Unauthorized: invalid or expired token",...}
send-release-note                400 {"error":"title and body required"}          ← ADMITTED
send-transactional-email         400 {"error":"templateName is required"}         ← ADMITTED
send-dot-consultant-request      401 {"error":"Unauthorized: invalid or expired token",...}
send-test-email                  400 {"error":"operator_email is required"}       ← ADMITTED
notify-owner-transfer            200 {"sent":false,"error":"anon.auth.getClaims is not a function"}
pei-auto-cadence                 200 {"checked":19,"sent":0,"gfe":0,"paused":0,"skipped":19,"errors":[]}  ← ADMITTED AND RAN
```

A `400 …is required` from an anonymous caller is the finding: the call is past
every permission check and is being stopped only by missing arguments. Per the
probe rule, no second call was made with valid arguments to any of those five.
What they WOULD have done, unmade: `send-transactional-email` would have
rendered any registered template to any address; `send-test-email` would have
emailed an attacker-chosen address a QPassport download link minted for a real
driver; `send-release-note` would have emailed every staff recipient;
`encrypt-ssn` would have returned ciphertext for any string.

**DISCLOSURE — `pei-auto-cadence` executed.** It takes no arguments, so the
empty-body probe ran its real logic: it evaluated 19 previous-employer requests
and skipped all 19 (no milestone due), sending nothing and creating no GFE. No
mail left the company and no row changed, but this was a real execution of a
live outbound job by an unauthenticated caller — which is exactly the finding.

### As a driver — Steve Figueroa (`878be880-…`, role `operator`), session minted with `lovable auth-session --json --user`

```
decrypt-ssn                      403 {"error":"Forbidden: management role required"}
export-retention-archive         403 requiredAny ["management","owner"]
purge-deleted-operator-documents 401 {"error":"unauthorized"}
reset-demo-driver                403 requiredAny ["management","owner"]
send-lease-termination           403 requiredAny ["owner","management"]
send-insurance-request           403 requiredAny ["onboarding_staff","dispatcher","management"]
send-return-receipt-pdf          403 requiredAny ["onboarding_staff","dispatcher","management","owner"]
send-dot-consultant-request      403 requiredAny ["onboarding_staff","dispatcher","management","owner"]
notify-owner-transfer            200 {"sent":false,"error":"anon.auth.getClaims is not a function"}
```

Every one refused before doing anything. The five NO GATE functions were not
called again as Steve: a driver is strictly more privileged than the anonymous
caller that already got through, so the second call would add no information and
would risk completing an action.

## STEP 3 — the answer

| Function | Gate | Who can call it today | What it does | Right, given P1-P11? |
|---|---|---|---|---|
| `decrypt-ssn` | management role | management (owner NOT included) | reveals a Social Security number | **No** — breaches P1: the owner cannot call it |
| `encrypt-ssn` | none | **anyone on the internet** | returns AES-GCM ciphertext for any string under the company SSN key | **No** — P8. A key-use oracle. No data leaves, but nothing should be able to use that key |
| `export-retention-archive` | management, owner | management, owner | exports a person's retention archive | Yes |
| `purge-deleted-operator-documents` | cron secret / service key | cron only | permanently purges soft-deleted documents | Yes |
| `reset-demo-driver` | management, owner | management, owner | wipes and reseeds a demo driver | Yes |
| `download-qpassport` | signed expiring token | anyone holding a valid link | serves one operator's QPassport | Yes, as designed (token = the permission) |
| `send-lease-termination` | owner, management | owner, management | emails a lease termination out of the company | Yes — matches P6 |
| `send-insurance-request` | onboarding_staff, dispatcher, management | those three | emails an insurance request with attachments | **No** — breaches P1: owner omitted |
| `send-return-receipt-pdf` | four staff roles | staff | emails a return receipt PDF | Yes |
| `send-release-note` | none | **anyone on the internet** | **emails every staff recipient** | **No** — P8. Outbound, unauthenticated |
| `send-transactional-email` | none | **anyone on the internet** | **sends any registered template to any address, as SUPERTRANSPORT** | **No — worst item found.** Outbound, unauthenticated, arbitrary recipient |
| `send-dot-consultant-request` | four staff roles | staff | emails a consultant outside the company | Yes |
| `send-test-email` | none | **anyone on the internet** | **emails an arbitrary address a QPassport link minted for a named driver** | **No** — P8. Outbound AND leaks a driver's document to an address the caller chooses |
| `notify-owner-transfer` | broken (`getClaims` missing on the 2.45.0 client) | nobody — every call throws and returns `200 {"sent":false}` | should email the outgoing owner a transfer notice | **No** — fails closed, so the OWNER'S OWN notice never sends. A functional break, not an exposure |
| `pei-auto-cadence` | none (`verify_jwt = false`) | **anyone on the internet** | runs the previous-employer cadence: follow-up emails to outside employers, auto-GFE | **No** — P8. Outbound, unauthenticated, and it RAN during this pass |

**Driver reach beyond his own data:** none of the fifteen lets a signed-in
driver reach another driver's data. Every staff-gated one refused Steve by role.
The exposure is the opposite shape from the one this pass went looking for — five
functions are open to **anyone, with no session at all**, four of which put mail
on the wire in the company's name.

**The queue's premise was wrong twice over.** "Any signed-in session" understated
five (they need no session) and overstated seven (they demand named staff roles),
one (`purge-deleted-operator-documents`) is cron-only, one
(`download-qpassport`) is token-gated by design, and one
(`notify-owner-transfer`) is broken rather than open.

## STEP 4 — proposed fix order, worst first. NOTHING BUILT.

1. `send-transactional-email` — arbitrary template, arbitrary recipient, company identity, no caller. Every other mail path calls it, so it must keep an internal-caller path (service key or a shared secret) alongside a staff gate.
2. `send-test-email` — unauthenticated, and it mints a real driver's QPassport link to an address the caller names. Staff-only, and the link should only ever go to the operator on the record.
3. `pei-auto-cadence` — unauthenticated outbound to outside employers. Same shape as the other cron jobs: `x-cron-secret`/`CRON_SECRET`, plus a staff path if it is ever triggered by hand.
4. `send-release-note` — unauthenticated, mails all staff. `requireStaff(['owner','management'])`.
5. `encrypt-ssn` — unauthenticated use of the SSN key. Staff roles that legitimately submit an SSN, matching whoever writes the application.
6. `notify-owner-transfer` — swap the 2.45.0 client for `npm:@supabase/supabase-js@2` so `getClaims` exists, then confirm the intended `from_user_id === callerId` gate actually fires. Failing closed is safe; the owner's notice silently never sending is not.
7. `decrypt-ssn` and `send-insurance-request` — add `owner` (P1). Small, but P1 says no gate may exclude the owner.

Each of these changes an edge function, so each carries a full suite run, a
typecheck, a deployment, and a refused live call as proof — the shape the 2030
pass used.

## Files authored by this pass

- `docs/passes/2026-09-18-2155-signed-in-function-recheck.md` (this file)
- `docs/tms-build-status.md` (dated entry appended; the 2030 Step 5 table corrected in place by appended note)
- `docs/tms-wish-list.md` (queue line corrected)
