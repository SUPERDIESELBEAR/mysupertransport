# 2026-09-20 2352 UTC — STOPPED before any change: two of the seven items contradict the live system

BUILD MODE pass, halted at the contradiction rule. **No function, migration, config
or data was changed.** Full suite deliberately SKIPPED — no code changed; nothing
to regress. Everything below is live evidence gathered read-only.

Five of the seven items are sound and ready to build. Two are not, and both would
break something that works today.

---

## CONTRADICTION 1 — item 5, `encrypt-ssn`: `requireStaff` would break the public application intake

The prompt asks for "requireStaff with the roles that legitimately submit an SSN —
determine that from who writes applications." Determining that from the call sites
gives the answer the prompt did not expect: **the people who submit an SSN are
mostly not signed in at all.**

Four call sites:

| Call site | Route | Caller's identity |
|---|---|---|
| `src/pages/ApplicationForm.tsx:410` | `/apply` (public, `src/App.tsx:164`) | `session?.access_token ?? anonKey` (`:408`) — the applicant has no session, so this is the **publishable key** |
| `src/pages/SubmitSSN.tsx:67` | `/apply/ssn` (public, `src/App.tsx:165`) | `Bearer ${anonKey}` hard-coded (`:71`) — **never** a session |
| `src/components/management/StaffApplicationModal.tsx:100` | staff portal | staff JWT |
| `src/components/management/ApplicationReviewDrawer.tsx:676` | staff portal | staff JWT |

Adding `requireStaff` to `encrypt-ssn` would make every applicant's SSN submission
fail with 403 on both public routes — the driver application would break at the
last step. Removing its `verify_jwt = false` line (`supabase/config.toml:14-15`)
is harmless on its own, because the publishable key IS a valid JWT, but it also
buys nothing.

So the 2155 report's classification stands and its remedy does not. `encrypt-ssn`
is genuinely reachable by anyone, and that is **by design** — it is the intake
path. What it actually is: an oracle that will AES-GCM-encrypt any string under
`SSN_ENCRYPTION_KEY` for anyone who asks. It returns no stored data, reveals no
existing SSN, and cannot decrypt (`decrypt-ssn` is management-gated). The harm is
narrow: an outsider can make the key produce ciphertext, and can spend the
function's quota.

**Owner decision owed — three options, none of them "add requireStaff":**

1. **Leave it open, rate-limit it.** Cap by IP/application draft token. Smallest
   change, keeps intake working, does not close the oracle.
2. **Bind it to a draft.** Require the `/apply` draft token or the application id
   that `/apply/ssn` already carries in the URL, and verify that row exists and
   has no SSN yet. Closes the oracle to anyone not mid-application. This is the
   right answer in my view, and it is a real change to two front-end files plus
   the function, not a one-line gate.
3. **Move encryption server-side entirely.** The applicant submits the SSN to the
   function that writes the application row; nothing hands ciphertext back to the
   browser. Cleanest, largest.

## CONTRADICTION 2 — item 3, `pei-auto-cadence`: the cron-secret pattern it is told to copy does not work live

The prompt says to match `purge-deleted-operator-documents` (`x-cron-secret` /
`CRON_SECRET`) and to quote the live schedule rather than assume. Quoting it is
what breaks the item.

**The live schedule** (`cron.job`, jobid 106, `pei-auto-cadence-hourly`,
`schedule: 0 * * * *`) sends this and nothing else:

```
headers := '{"Content-Type":"application/json","apikey":"<ANON KEY>", "Authorization":"Bearer <ANON KEY>"}'
```

No `x-cron-secret`. So gating on the secret stops the job dead.

**Worse, the pattern itself is already failing in production. Three independent
proofs:**

1. **`CRON_SECRET` does not exist.** The project's secrets are `APP_URL`,
   `ELD_CRON_SECRET`, `EMAIL_TRACK_SECRET`, `LOVABLE_API_KEY`,
   `MGMT_API_ACCESS_TOKEN`, `RATE_CON_INGEST_ADDRESS`, `RESEND_API_KEY`,
   `RESEND_WEBHOOK_SECRET`, `SSN_ENCRYPTION_KEY`. There is no `CRON_SECRET`.
   In all seven functions that read it, `cronSecret` is `undefined`, so
   `(cronSecret && headerSecret === cronSecret)` can never be true — those
   functions accept **only** a service-role bearer, which no cron job sends.
2. **`app.cron_secret` is set nowhere.** `purge-deleted-operator-documents`'
   cron (jobid 15, `15 3 * * *`) builds its header from
   `current_setting('app.cron_secret', true)`; `pg_db_role_setting` contains no
   `app.cron_secret` on any database or role, and a live `current_setting` read
   returns NULL. The daily purge has been sending a null secret to a function
   whose secret is also unset.
3. **Live refusals, right now.** `net._http_response` retains ~6 hours and holds
   exactly two outcomes: **360 × `403 {"error":"Forbidden"}`**, one per minute
   from 17:50 to 23:49 UTC — the every-minute job is
   `dispatch-scheduled-broadcasts` (jobid 13), which uses this same
   `CRON_SECRET`-or-service-key gate — and **6 × `200`** from
   `pei-auto-cadence`, hourly, `{"checked":19,"sent":0,"skipped":19}`.

Note what that means: `pei-auto-cadence` is the one job in this group that is
actually running. Applying the requested gate would convert the only working
cron into the 361st refusal, and scheduled broadcasts would stay broken.
`cron.job_run_details` says "succeeded" for all of them — that records only that
the SQL queued the POST, never that the function accepted it. That is why this
was invisible.

**No person triggers `pei-auto-cadence` today.** `rg "pei-auto-cadence" src
supabase/functions` outside its own directory returns nothing — no screen, no
button, no other function. So a staff path is not needed; only the cron path is.

**What the fix must include, and why it is a bigger pass than item 3 describes:**
create a real `CRON_SECRET`, put the same value where the jobs can read it, and
update **every** cron job command to send it — not just `pei-auto-cadence`. Doing
it for one function while the rest keep 403ing would leave the real defect
standing. That repair is worth its own pass, because it fixes jobs that are
silently dead today (scheduled broadcasts every minute; the document purge daily;
cert and inspection expiry; idle-operator notices; dispatch rollover; ELD
escalations use a separate `ELD_CRON_SECRET` and need checking too).

---

## The five items that ARE sound (built on the word go, nothing done yet)

### Item 1 — `send-transactional-email`: caller census complete, no caller breaks

| Caller | Identity it sends | Path it will use |
|---|---|---|
| `_shared/email/send.ts:50-57` `sendTemplateEmail` — forwards `authHeader` | whatever the calling function received | staff |
| → `send-ica-review-link/index.ts:16-18` | `requireStaff(['management','onboarding_staff','owner','dispatcher'])` | staff |
| → `send-equipment-return-instructions/index.ts:31` | `requireStaff(['management','onboarding_staff','owner'])` | staff |
| → `send-osas-to-operator/index.ts:58` | `requireStaff(['management','onboarding_staff','owner'])` | staff |
| `send-passenger-auth/index.ts:63,202` — `admin.functions.invoke` | service-role key (`:32`) | internal |
| `pei-auto-cadence/index.ts:168-172` — `Bearer ${serviceKey}` | service-role key | internal |
| `src/components/pei/sendPEIEmail.ts:126` (StaffPortal, ManagementPortal, ApplicationReviewDrawer) | staff session | staff |
| `src/components/pei/SendTestPEIDialog.tsx:75` | staff session | staff |
| `src/components/equipment/EquipmentAssetSheet.tsx:224` | staff session | staff |

No operator/driver call site exists, and no cron calls it directly. **Nothing
breaks.** Internal path: **service-role key**, not a new shared secret — both
internal callers already send exactly that, so it needs no secret creation, no
cron edit, and no new value to keep in step (and the `CRON_SECRET` finding above
is precisely what a new shared secret would have risked). Staff path:
`requireStaff(['owner','management','onboarding_staff','dispatcher'])` —
dispatcher included because `send-ica-review-link` admits dispatchers and
forwards their JWT. The false comment at `index.ts:29-31` goes.

### Item 2 — `send-test-email`
Single caller: `src/components/management/EmailCatalog.tsx:1013` (management
portal). `requireStaff(['owner','management'])`. The second half — the QPassport
link going only to the operator on the record rather than a caller-supplied
address — is a change to the function's contract and its caller; it will be
recorded as owed unless you want it in the same pass.

### Item 4 — `send-release-note`
No app caller at all (`rg` finds none outside its own directory), same as the
`get-staff-list` delete branch: live, unlocked, unused.
`requireStaff(['owner','management'])` as specified.

### Item 6 — `notify-owner-transfer`
Caller: `src/pages/management/OwnershipTransferPage.tsx:175`. Move to
`npm:@supabase/supabase-js@2` so `getClaims` exists, then prove the
`from_user_id === callerId` gate both ways. Its notice goes to the outgoing
owner's own address, so a safe demonstration needs a transfer row whose
`from_user_id` is a throwaway account I create — I will do that inside the probe
rule, or say plainly that I could not.

### Item 7 — `decrypt-ssn` and `send-insurance-request`
Add `owner` (P1). `decrypt-ssn/index.ts:57-60` gates on
`has_role(..., 'management')`; `send-insurance-request/index.ts:121` lists
`['onboarding_staff','dispatcher','management']`. Both exclude you.

---

## Files authored by this pass

- `docs/passes/2026-09-20-2352-unauthenticated-functions-fixed.md` (this file)
- `docs/tms-build-status.md` (dated entry appended)

The wish-list queue is unchanged, because nothing was closed.
